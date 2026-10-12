using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using Microsoft.Web.WebView2.Core;
using Nota11.Services;

namespace Nota11
{
    public partial class MainWindow : Window
    {
        private readonly DiskStorageService _storageService;
        private readonly HltbProxyService _hltbService;
        private readonly IgdbProxyService _igdbService;
        private readonly ImageProxyService _imageService;
        private readonly ApiHandler _apiHandler;
        private EmbeddedServer? _embeddedServer;
        private CoreWebView2Environment? _webViewEnvironment;

        // P/Invoke para Tema Escuro Nativo no Windows (DWM)
        [DllImport("dwmapi.dll", PreserveSig = true)]
        private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int attrValue, int attrSize);

        private const int DWMWA_USE_IMMERSIVE_DARK_MODE = 20;
        private const int DWMWA_WINDOW_CORNER_PREFERENCE = 33; // 2 = Round corners no Win11

        public MainWindow()
        {
            InitializeComponent();

            _storageService = new DiskStorageService();
            _hltbService = new HltbProxyService();
            _igdbService = new IgdbProxyService();
            _imageService = new ImageProxyService();
            _apiHandler = new ApiHandler(_storageService, _hltbService, _igdbService, _imageService);

            try
            {
                var icoPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "app.ico");
                if (File.Exists(icoPath))
                {
                    Icon = System.Windows.Media.Imaging.BitmapFrame.Create(new Uri(icoPath, UriKind.Absolute));
                }
            }
            catch { }

            SourceInitialized += MainWindow_SourceInitialized;
            Loaded += MainWindow_Loaded;
            Closing += MainWindow_Closing;
            StateChanged += MainWindow_StateChanged;
            KeyDown += MainWindow_KeyDown;
        }

        private void MainWindow_SourceInitialized(object? sender, EventArgs e)
        {
            ApplyWindowsDarkMode();
        }

        private void ApplyWindowsDarkMode()
        {
            try
            {
                var hwnd = new WindowInteropHelper(this).Handle;
                if (hwnd != IntPtr.Zero)
                {
                    int darkMode = 1;
                    DwmSetWindowAttribute(hwnd, DWMWA_USE_IMMERSIVE_DARK_MODE, ref darkMode, sizeof(int));

                    int cornerPreference = 2; // Arredondamento suave no Windows 11
                    DwmSetWindowAttribute(hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, ref cornerPreference, sizeof(int));
                }
            }
            catch
            {
                // Versões anteriores do Windows ignoram suavemente
            }
        }

        private async void MainWindow_Loaded(object sender, RoutedEventArgs e)
        {
            try
            {
                await StartAppAsync();
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Falha ao iniciar o aplicativo:\n\n{ex.Message}\n\n{ex.StackTrace}", "Nota 11 - Erro", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private string FindWwwrootDirectory()
        {
            var candidates = new[]
            {
                Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "wwwroot"),
                Path.Combine(Directory.GetCurrentDirectory(), "wwwroot"),
                AppDomain.CurrentDomain.BaseDirectory,
                Directory.GetCurrentDirectory(),
                Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..", "wwwroot"),
                Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..", "..", "wwwroot"),
                Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..", "..", "..", "wwwroot"),
                Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..", "..", ".."),
                Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..", "..", "..", "..", "wwwroot"),
                Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..", "..", "..", "..")
            };

            foreach (var c in candidates)
            {
                try
                {
                    var full = Path.GetFullPath(c);
                    if (Directory.Exists(full) && File.Exists(Path.Combine(full, "index.html")))
                    {
                        return full;
                    }
                }
                catch { }
            }

            throw new DirectoryNotFoundException("Pasta de interface contendo 'index.html' não foi encontrada.");
        }

        private async Task StartAppAsync()
        {
            // 1. Determina caminho da pasta wwwroot
            var wwwrootDir = FindWwwrootDirectory();

            // 2. Tenta iniciar servidor embutido local C#
            _embeddedServer = new EmbeddedServer(wwwrootDir, _storageService, _hltbService, _igdbService, _imageService);
            bool serverStarted = _embeddedServer.Start();

            // 3. Inicializa WebView2 com pasta de perfil dedicada no AppData
            var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            var webViewDataFolder = Path.Combine(appData, "Nota11", "WebView2Profile");
            if (!Directory.Exists(webViewDataFolder))
            {
                Directory.CreateDirectory(webViewDataFolder);
            }

            var options = new CoreWebView2EnvironmentOptions(
                additionalBrowserArguments: "--disable-background-networking --disable-features=Translate,OptimizationHints,MediaRouter --enable-zero-copy --disable-http-cache"
            );
            _webViewEnvironment = await CoreWebView2Environment.CreateAsync(null, webViewDataFolder, options);
            await WebView.EnsureCoreWebView2Async(_webViewEnvironment);

            // Garante que arquivos HTML/CSS/JS modificados não fiquem presos no cache de disco do Chromium
            try
            {
                await WebView.CoreWebView2.Profile.ClearBrowsingDataAsync(
                    CoreWebView2BrowsingDataKinds.DiskCache |
                    CoreWebView2BrowsingDataKinds.CacheStorage
                );
            }
            catch { }

            // 4. Configurações de exibição do WebView2
            WebView.CoreWebView2.Settings.IsStatusBarEnabled = false;
            WebView.CoreWebView2.Settings.AreDevToolsEnabled = true;
            WebView.CoreWebView2.Settings.IsSwipeNavigationEnabled = false;

            // 5. Mapeia pasta local como host virtual seguro (garante funcionamento mesmo sem servidor HTTP)
            WebView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                "app.nota11",
                wwwrootDir,
                CoreWebView2HostResourceAccessKind.Allow
            );

            // 5.1 Intercepta requisições de API nativamente em memória (sem portas, sem firewall, sem problemas de permissão)
            WebView.CoreWebView2.AddWebResourceRequestedFilter("*/api/*", CoreWebView2WebResourceContext.All);
            WebView.CoreWebView2.AddWebResourceRequestedFilter("https://app.nota11/api/*", CoreWebView2WebResourceContext.All);
            WebView.CoreWebView2.AddWebResourceRequestedFilter("http://app.nota11/api/*", CoreWebView2WebResourceContext.All);
            WebView.CoreWebView2.AddWebResourceRequestedFilter("*://127.0.0.1*/api/*", CoreWebView2WebResourceContext.All);
            WebView.CoreWebView2.AddWebResourceRequestedFilter("*://localhost*/api/*", CoreWebView2WebResourceContext.All);
            WebView.CoreWebView2.WebResourceRequested += CoreWebView2_WebResourceRequested;

            // 6. Tratamento de mensagens Web <-> C#
            WebView.CoreWebView2.WebMessageReceived += CoreWebView2_WebMessageReceived;
            WebView.CoreWebView2.NavigationCompleted += CoreWebView2_NavigationCompleted;
            WebView.CoreWebView2.NewWindowRequested += CoreWebView2_NewWindowRequested;

            // 7. Navega para a URL do servidor local embutido ou fallback virtual seguro
            if (serverStarted && !string.IsNullOrEmpty(_embeddedServer.BaseUrl))
            {
                WebView.CoreWebView2.Navigate(_embeddedServer.BaseUrl);
            }
            else
            {
                Debug.WriteLine("[MainWindow] Servidor HTTP não pôde ser iniciado em nenhuma porta. Usando Virtual Host seguro.");
                WebView.CoreWebView2.Navigate("https://app.nota11/index.html");
            }
        }

        private async void CoreWebView2_WebResourceRequested(object? sender, CoreWebView2WebResourceRequestedEventArgs e)
        {
            var deferral = e.GetDeferral();
            try
            {
                var uri = new Uri(e.Request.Uri);
                var path = uri.AbsolutePath;
                var query = uri.Query;
                var method = e.Request.Method;

                string bodyText = "";
                if (e.Request.Content != null)
                {
                    using var reader = new StreamReader(e.Request.Content, Encoding.UTF8, leaveOpen: true);
                    bodyText = await reader.ReadToEndAsync();
                }

                var response = await Task.Run(() => _apiHandler.HandleAsync(method, path, query, bodyText));
                e.Response = _webViewEnvironment!.CreateWebResourceResponse(
                    response.Stream,
                    response.StatusCode,
                    response.ReasonPhrase,
                    response.Headers
                );
            }
            catch (Exception ex)
            {
                var errorBytes = Encoding.UTF8.GetBytes($"{{\"error\":\"{ex.Message}\"}}");
                var stream = new MemoryStream(errorBytes);
                e.Response = _webViewEnvironment!.CreateWebResourceResponse(
                    stream,
                    500,
                    "Internal Server Error",
                    "Content-Type: application/json; charset=utf-8\r\nAccess-Control-Allow-Origin: *"
                );
            }
            finally
            {
                deferral.Complete();
            }
        }

        private void CoreWebView2_NewWindowRequested(object? sender, CoreWebView2NewWindowRequestedEventArgs e)
        {
            e.Handled = true;
            try
            {
                if (Uri.TryCreate(e.Uri, UriKind.Absolute, out var uri) &&
                    (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps))
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = e.Uri,
                        UseShellExecute = true
                    });
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"Erro ao abrir link externo: {ex.Message}");
            }
        }

        private void CoreWebView2_NavigationCompleted(object? sender, CoreWebView2NavigationCompletedEventArgs e)
        {
            if (!e.IsSuccess)
            {
                Debug.WriteLine($"[WebView2] Falha na navegação ({e.WebErrorStatus}). Tentando fallback para Virtual Host...");
                try
                {
                    // Tenta carregar via Virtual Host caso a requisição HTTP local tenha falhado
                    if (WebView.Source == null || !WebView.Source.ToString().Contains("app.nota11"))
                    {
                        WebView.CoreWebView2.Navigate("https://app.nota11/index.html");
                        return;
                    }
                }
                catch { }

                var errorMsg = $"Não foi possível conectar à interface local ({e.WebErrorStatus}).\n\nServidor: {_embeddedServer?.BaseUrl}";
                Debug.WriteLine($"[WebView2] Falha definitiva na navegação: {e.WebErrorStatus}");
                MessageBox.Show(errorMsg, "Nota 11 - Erro de Conexão", MessageBoxButton.OK, MessageBoxImage.Warning);
            }
        }

        private async void CoreWebView2_WebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            try
            {
                var msgJson = e.WebMessageAsJson;
                using var doc = System.Text.Json.JsonDocument.Parse(msgJson);
                var root = doc.RootElement;

                if (root.TryGetProperty("action", out var actionProp))
                {
                    var action = actionProp.GetString();
                    switch (action)
                    {
                        case "minimize":
                            WindowState = WindowState.Minimized;
                            break;

                        case "maximize":
                            WindowState = WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized;
                            break;

                        case "close":
                            Close();
                            break;

                        case "reload":
                            WebView.CoreWebView2?.Reload();
                            break;

                        case "open_url":
                            if (root.TryGetProperty("url", out var urlProp))
                            {
                                var url = urlProp.GetString();
                                if (!string.IsNullOrEmpty(url))
                                {
                                    Process.Start(new ProcessStartInfo
                                    {
                                        FileName = url,
                                        UseShellExecute = true
                                    });
                                }
                            }
                            break;

                        case "open_appdata":
                            Process.Start(new ProcessStartInfo
                            {
                                FileName = "explorer.exe",
                                Arguments = _storageService.StorageDirectory,
                                UseShellExecute = true
                            });
                            break;

                        case "save_database":
                            if (root.TryGetProperty("data", out var dataProp))
                            {
                                var rawData = dataProp.GetRawText();
                                await _storageService.SaveDatabaseAsync(rawData);
                            }
                            break;
                    }
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"Erro ao processar mensagem web: {ex.Message}");
            }
        }

        #region Controles da Barra de Título Customizada

        private void BtnReload_Click(object sender, RoutedEventArgs e)
        {
            WebView.CoreWebView2?.Reload();
        }

        private void BtnMinimize_Click(object sender, RoutedEventArgs e)
        {
            WindowState = WindowState.Minimized;
        }

        private void BtnMaximize_Click(object sender, RoutedEventArgs e)
        {
            WindowState = WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized;
        }

        private void BtnClose_Click(object sender, RoutedEventArgs e)
        {
            Close();
        }

        private void MainWindow_StateChanged(object? sender, EventArgs e)
        {
            if (WindowState == WindowState.Minimized)
            {
                try
                {
                    if (WebView.CoreWebView2 != null)
                    {
                        WebView.CoreWebView2.MemoryUsageTargetLevel = CoreWebView2MemoryUsageTargetLevel.Low;
                    }
                }
                catch { }
                return;
            }

            try
            {
                if (WebView.CoreWebView2 != null)
                {
                    WebView.CoreWebView2.MemoryUsageTargetLevel = CoreWebView2MemoryUsageTargetLevel.Normal;
                }
            }
            catch { }

            if (WindowState == WindowState.Maximized)
            {
                // Ícone de Restaurar (quadrados sobrepostos)
                MaximizeIconPath.Data = Geometry.Parse("M 2.5,0.5 L 9.5,0.5 L 9.5,7.5 L 7.5,7.5 L 7.5,9.5 L 0.5,9.5 L 0.5,2.5 L 2.5,2.5 Z M 2.5,2.5 L 7.5,2.5 L 7.5,7.5 L 2.5,7.5 Z");
                BtnMaximize.ToolTip = "Restaurar";
                var b = SystemParameters.WindowResizeBorderThickness;
                RootBorder.Margin = new Thickness(b.Left, b.Top, b.Right, b.Bottom);
                RootBorder.BorderThickness = new Thickness(0);
            }
            else
            {
                // Ícone de Maximizar (quadrado único)
                MaximizeIconPath.Data = Geometry.Parse("M 1,1 L 9,1 L 9,9 L 1,9 Z");
                BtnMaximize.ToolTip = "Maximizar";
                RootBorder.Margin = new Thickness(0);
                RootBorder.BorderThickness = new Thickness(1);
            }
        }

        private void MainWindow_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.F5)
            {
                WebView.CoreWebView2?.Reload();
                e.Handled = true;
            }
            else if (e.Key == Key.F11)
            {
                WindowState = WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized;
                e.Handled = true;
            }
        }

        #endregion

        private void MainWindow_Closing(object? sender, CancelEventArgs e)
        {
            _embeddedServer?.Dispose();
        }
    }
}
