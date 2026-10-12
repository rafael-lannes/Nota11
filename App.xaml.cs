using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows;
using System.Windows.Threading;

namespace Nota11
{
    public partial class App : Application
    {
        private const string SingleInstanceMutexName = @"Local\Nota11_SingleInstance_Mutex_RafaelLannes_99A1";
        private static Mutex? _mutex;

        [DllImport("user32.dll")]
        private static extern bool SetForegroundWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);

        [DllImport("user32.dll")]
        private static extern bool IsIconic(IntPtr hWnd);

        private const int SW_RESTORE = 9;
        private const int SW_SHOW = 5;

        protected override void OnStartup(StartupEventArgs e)
        {
            try
            {
                _mutex = new Mutex(true, SingleInstanceMutexName, out bool isNewInstance);

                if (!isNewInstance)
                {
                    // Aplicação já está aberta: restaura e traz a janela em execução para o primeiro plano suavemente
                    BringExistingInstanceToFront();
                    Shutdown(0);
                    return;
                }
            }
            catch
            {
                // Em caso de falha rara ao criar o Mutex, prossegue sem travar
            }

            base.OnStartup(e);

            DispatcherUnhandledException += App_DispatcherUnhandledException;
            AppDomain.CurrentDomain.UnhandledException += CurrentDomain_UnhandledException;

            var mainWindow = new MainWindow();
            mainWindow.Show();
        }

        private static void BringExistingInstanceToFront()
        {
            try
            {
                var currentProcess = Process.GetCurrentProcess();
                var processes = Process.GetProcessesByName(currentProcess.ProcessName);

                foreach (var process in processes)
                {
                    if (process.Id != currentProcess.Id && process.MainWindowHandle != IntPtr.Zero)
                    {
                        var handle = process.MainWindowHandle;
                        if (IsIconic(handle))
                        {
                            ShowWindowAsync(handle, SW_RESTORE);
                        }
                        else
                        {
                            ShowWindowAsync(handle, SW_SHOW);
                        }
                        SetForegroundWindow(handle);
                        break;
                    }
                }
            }
            catch
            {
                // Ignora silenciosamente
            }
        }

        protected override void OnExit(ExitEventArgs e)
        {
            if (_mutex != null)
            {
                try
                {
                    _mutex.ReleaseMutex();
                }
                catch { }
                _mutex.Dispose();
                _mutex = null;
            }

            base.OnExit(e);
        }

        private void App_DispatcherUnhandledException(object sender, DispatcherUnhandledExceptionEventArgs e)
        {
            LogException(e.Exception);
            e.Handled = true;
            MessageBox.Show($"Erro inesperado na aplicação:\n\n{e.Exception.Message}\n\n{e.Exception.StackTrace}", "Nota 11 - Erro", MessageBoxButton.OK, MessageBoxImage.Error);
        }

        private void CurrentDomain_UnhandledException(object sender, UnhandledExceptionEventArgs e)
        {
            if (e.ExceptionObject is Exception ex)
            {
                LogException(ex);
            }
        }

        private static void LogException(Exception ex)
        {
            try
            {
                var logPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "app_error.log");
                File.AppendAllText(logPath, $"[{DateTime.UtcNow:o}] {ex.Message}\n{ex.StackTrace}\nInner: {ex.InnerException?.Message}\n\n");
            }
            catch { }
        }
    }
}
