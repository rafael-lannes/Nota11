using System;
using System.IO;
using System.Text;
using System.Threading.Tasks;

namespace Nota11.Services
{
    public class DiskStorageService
    {
        private readonly string _storageDir;
        private readonly string _databasePath;
        private readonly string _settingsPath;
        private readonly string _profilePath;

        public DiskStorageService()
        {
            var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            _storageDir = Path.Combine(appData, "Nota11");
            _databasePath = Path.Combine(_storageDir, "database.json");
            _settingsPath = Path.Combine(_storageDir, "settings.json");
            _profilePath = Path.Combine(_storageDir, "profile.json");

            EnsureDirectoryExists();
        }

        public string StorageDirectory => _storageDir;

        private void EnsureDirectoryExists()
        {
            if (!Directory.Exists(_storageDir))
            {
                Directory.CreateDirectory(_storageDir);
            }
        }

        public async Task SaveDatabaseAsync(string json)
        {
            EnsureDirectoryExists();
            await File.WriteAllTextAsync(_databasePath, json, Encoding.UTF8);
        }

        public async Task<string?> LoadDatabaseAsync()
        {
            if (File.Exists(_databasePath))
            {
                return await File.ReadAllTextAsync(_databasePath, Encoding.UTF8);
            }
            return null;
        }

        public async Task SaveSettingsAsync(string json)
        {
            EnsureDirectoryExists();
            await File.WriteAllTextAsync(_settingsPath, json, Encoding.UTF8);
        }

        public async Task<string?> LoadSettingsAsync()
        {
            if (File.Exists(_settingsPath))
            {
                return await File.ReadAllTextAsync(_settingsPath, Encoding.UTF8);
            }
            return null;
        }

        public async Task SaveProfileAsync(string json)
        {
            EnsureDirectoryExists();
            await File.WriteAllTextAsync(_profilePath, json, Encoding.UTF8);
        }

        public async Task<string?> LoadProfileAsync()
        {
            if (File.Exists(_profilePath))
            {
                return await File.ReadAllTextAsync(_profilePath, Encoding.UTF8);
            }
            return null;
        }
    }
}
