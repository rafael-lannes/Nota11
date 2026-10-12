using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace Nota11.Services
{
    public class EmbeddedServer : IDisposable
    {
        private HttpListener? _listener;
        private readonly string _wwwrootDir;
        private readonly DiskStorageService _storageService;
        private readonly HltbProxyService _hltbService;
        private readonly IgdbProxyService _igdbService;
        private readonly ImageProxyService _imageService;
        private readonly ApiHandler _apiHandler;
        private CancellationTokenSource? _cts;
        private int _port;
        private bool _isRunning;

        private static readonly Dictionary<string, string> MimeTypes = new(StringComparer.OrdinalIgnoreCase)
        {
            [".html"] = "text/html; charset=utf-8",
            [".htm"] = "text/html; charset=utf-8",
            [".css"] = "text/css; charset=utf-8",
            [".js"] = "application/javascript; charset=utf-8",
            [".json"] = "application/json; charset=utf-8",
            [".png"] = "image/png",
            [".jpg"] = "image/jpeg",
            [".jpeg"] = "image/jpeg",
            [".gif"] = "image/gif",
            [".svg"] = "image/svg+xml",
            [".ico"] = "image/x-icon",
            [".webp"] = "image/webp",
            [".csv"] = "text/csv; charset=utf-8",
            [".txt"] = "text/plain; charset=utf-8",
            [".woff"] = "font/woff",
            [".woff2"] = "font/woff2",
            [".ttf"] = "font/ttf",
            [".otf"] = "font/otf",
            [".eot"] = "application/vnd.ms-fontobject"
        };

        public EmbeddedServer(string wwwrootDir, DiskStorageService storageService, HltbProxyService hltbService, IgdbProxyService igdbService, ImageProxyService imageService, ApiHandler? apiHandler = null)
        {
            _wwwrootDir = wwwrootDir;
            _storageService = storageService;
            _hltbService = hltbService;
            _igdbService = igdbService;
            _imageService = imageService;
            _apiHandler = apiHandler ?? new ApiHandler(storageService, hltbService, igdbService, imageService);
        }

        public int Port => _port;
        public bool IsRunning => _isRunning;
        public string BaseUrl => _isRunning && _port > 0 ? $"http://127.0.0.1:{_port}/" : string.Empty;

        public bool Start()
        {
            // Gera lista de portas candidatas: 3000 até 3050, seguidas por alternativas comuns e porta dinâmica
            var candidatePorts = new List<int>();
            for (int p = 3000; p <= 3050; p++)
            {
                candidatePorts.Add(p);
            }
            candidatePorts.Add(8080);
            candidatePorts.Add(8000);
            candidatePorts.Add(5500);
            candidatePorts.Add(0); // Solicita porta livre dinamicamente ao sistema operacional

            foreach (var p in candidatePorts)
            {
                HttpListener? candidateListener = null;
                try
                {
                    int targetPort = p == 0 ? GetRandomFreePort() : p;
                    if (targetPort <= 0) continue;

                    candidateListener = new HttpListener();
                    var prefix = $"http://127.0.0.1:{targetPort}/";
                    candidateListener.Prefixes.Add(prefix);
                    candidateListener.Start();

                    _listener = candidateListener;
                    _port = targetPort;
                    _isRunning = true;
                    System.Diagnostics.Debug.WriteLine($"[EmbeddedServer] Servidor HTTP local iniciado com sucesso na porta {_port}");
                    break;
                }
                catch (Exception ex)
                {
                    System.Diagnostics.Debug.WriteLine($"[EmbeddedServer] Porta {p} ocupada ou inacessivel ({ex.Message}). Tentando proxima...");
                    try
                    {
                        candidateListener?.Close();
                    }
                    catch { }
                    _listener = null;
                }
            }

            if (!_isRunning || _listener == null)
            {
                System.Diagnostics.Debug.WriteLine("[EmbeddedServer] Nao foi possivel vincular o servidor HTTP em nenhuma porta. Usando modo de fallback.");
                return false;
            }

            _cts = new CancellationTokenSource();
            Task.Run(() => ListenLoopAsync(_cts.Token));
            return true;
        }

        private static int GetRandomFreePort()
        {
            try
            {
                using var socket = new System.Net.Sockets.TcpListener(IPAddress.Loopback, 0);
                socket.Start();
                var port = ((IPEndPoint)socket.LocalEndpoint).Port;
                socket.Stop();
                return port;
            }
            catch
            {
                return 0;
            }
        }

        private async Task ListenLoopAsync(CancellationToken ct)
        {
            while (!ct.IsCancellationRequested && _listener != null && _listener.IsListening)
            {
                try
                {
                    var context = await _listener.GetContextAsync();
                    _ = Task.Run(() => ProcessRequestAsync(context), ct);
                }
                catch (HttpListenerException)
                {
                    break;
                }
                catch (ObjectDisposedException)
                {
                    break;
                }
                catch (Exception)
                {
                    // Continua ouvindo
                }
            }
        }

        private async Task ProcessRequestAsync(HttpListenerContext context)
        {
            var req = context.Request;
            var res = context.Response;

            try
            {
                // Headers CORS padrão
                res.Headers.Add("Access-Control-Allow-Origin", "*");
                res.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD");
                res.Headers.Add("Access-Control-Allow-Headers", "Content-Type, Client-ID, Authorization, Accept");

                if (req.HttpMethod == "OPTIONS")
                {
                    res.StatusCode = 200;
                    res.Close();
                    return;
                }

                var path = req.Url?.AbsolutePath.ToLowerInvariant() ?? "/";

                // Roteamento unificado de todas as APIs via ApiHandler
                if (path.StartsWith("/api/"))
                {
                    string bodyText = "";
                    if (req.HasEntityBody)
                    {
                        using var reader = new StreamReader(req.InputStream, Encoding.UTF8);
                        bodyText = await reader.ReadToEndAsync();
                    }

                    var apiResp = await _apiHandler.HandleAsync(req.HttpMethod, path, req.Url?.Query ?? "", bodyText);
                    res.StatusCode = apiResp.StatusCode;
                    res.ContentType = apiResp.ContentType;
                    res.ContentLength64 = apiResp.Data.Length;
                    if (req.HttpMethod != "HEAD")
                    {
                        await res.OutputStream.WriteAsync(apiResp.Data);
                    }
                    res.Close();
                    return;
                }

                // 7. ARQUIVOS ESTÁTICOS LOCAIS (wwwroot com Cache em Memória e Cache-Control)
                var relPath = path.TrimStart('/');
                if (string.IsNullOrWhiteSpace(relPath)) relPath = "index.html";

                var filePath = Path.Combine(_wwwrootDir, relPath.Replace('/', Path.DirectorySeparatorChar));
                if (File.Exists(filePath))
                {
                    var ext = Path.GetExtension(filePath);
                    res.ContentType = MimeTypes.TryGetValue(ext, out var mt) ? mt : "application/octet-stream";
                    res.Headers.Add("Cache-Control", "no-cache, no-store, must-revalidate");
                    res.Headers.Add("Pragma", "no-cache");
                    res.Headers.Add("Expires", "0");
                    res.StatusCode = 200;

                    var bytes = await File.ReadAllBytesAsync(filePath);
                    res.ContentLength64 = bytes.Length;
                    if (req.HttpMethod != "HEAD")
                    {
                        await res.OutputStream.WriteAsync(bytes);
                        await res.OutputStream.FlushAsync();
                    }
                }
                else
                {
                    res.StatusCode = 404;
                    var notFoundBytes = Encoding.UTF8.GetBytes($"404 - Arquivo não encontrado: {relPath}");
                    res.ContentType = "text/plain; charset=utf-8";
                    res.ContentLength64 = notFoundBytes.Length;
                    await res.OutputStream.WriteAsync(notFoundBytes);
                }
            }
            catch (Exception ex)
            {
                try
                {
                    res.StatusCode = 500;
                    var errBytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new { error = ex.Message }));
                    res.ContentType = "application/json; charset=utf-8";
                    res.ContentLength64 = errBytes.Length;
                    await res.OutputStream.WriteAsync(errBytes);
                }
                catch { }
            }
            finally
            {
                try { res.Close(); } catch { }
            }
        }

        private static async Task WriteJsonResponseAsync(HttpListenerResponse res, string json, int statusCode = 200)
        {
            var bytes = Encoding.UTF8.GetBytes(json);
            res.StatusCode = statusCode;
            res.ContentType = "application/json; charset=utf-8";
            res.ContentLength64 = bytes.Length;
            await res.OutputStream.WriteAsync(bytes);
            res.Close();
        }

        public void Dispose()
        {
            _cts?.Cancel();
            try { _listener?.Stop(); } catch { }
            try { _listener?.Close(); } catch { }
        }
    }
}
