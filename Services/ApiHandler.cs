using System;
using System.IO;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

namespace Nota11.Services
{
    public class ApiResponse
    {
        public int StatusCode { get; set; } = 200;
        public string ReasonPhrase { get; set; } = "OK";
        public string ContentType { get; set; } = "application/json; charset=utf-8";
        public string Headers { get; set; } = "Content-Type: application/json; charset=utf-8\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS, HEAD\r\nAccess-Control-Allow-Headers: Content-Type, Client-ID, Authorization, Accept";
        public byte[] Data { get; set; } = Array.Empty<byte>();
        public Stream Stream => new MemoryStream(Data);

        public static ApiResponse Json(string json, int statusCode = 200) => new()
        {
            StatusCode = statusCode,
            ReasonPhrase = statusCode == 200 ? "OK" : "Error",
            ContentType = "application/json; charset=utf-8",
            Headers = "Content-Type: application/json; charset=utf-8\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS, HEAD\r\nAccess-Control-Allow-Headers: Content-Type, Client-ID, Authorization, Accept",
            Data = Encoding.UTF8.GetBytes(json ?? string.Empty)
        };

        public static ApiResponse Error(string message, int statusCode = 500) =>
            Json($"{{\"error\":\"{message.Replace("\"", "\\\"")}\"}}", statusCode);
    }

    public class ApiHandler
    {
        private readonly DiskStorageService _storageService;
        private readonly HltbProxyService _hltbService;
        private readonly IgdbProxyService _igdbService;
        private readonly ImageProxyService _imageService;

        public ApiHandler(
            DiskStorageService storageService,
            HltbProxyService hltbService,
            IgdbProxyService igdbService,
            ImageProxyService imageService)
        {
            _storageService = storageService;
            _hltbService = hltbService;
            _igdbService = igdbService;
            _imageService = imageService;
        }

        private async Task<(string clientId, string clientSecret, string accessToken)> GetFallbackCredentialsAsync(string clientId, string clientSecret, string accessToken)
        {
            if (!string.IsNullOrWhiteSpace(clientId) && !string.IsNullOrWhiteSpace(clientSecret))
            {
                return (clientId, clientSecret, accessToken);
            }

            try
            {
                var dbJson = await _storageService.LoadDatabaseAsync();
                if (!string.IsNullOrWhiteSpace(dbJson))
                {
                    using var doc = JsonDocument.Parse(dbJson);
                    if (doc.RootElement.TryGetProperty("settings", out var s))
                    {
                        if (string.IsNullOrWhiteSpace(clientId) && s.TryGetProperty("igdb_client_id", out var cid))
                            clientId = cid.GetString() ?? "";
                        if (string.IsNullOrWhiteSpace(clientSecret) && s.TryGetProperty("igdb_client_secret", out var cs))
                            clientSecret = cs.GetString() ?? "";
                        if (string.IsNullOrWhiteSpace(accessToken) && s.TryGetProperty("igdb_access_token", out var at))
                            accessToken = at.GetString() ?? "";
                    }
                }
            }
            catch { }

            if (string.IsNullOrWhiteSpace(clientId) || string.IsNullOrWhiteSpace(clientSecret))
            {
                try
                {
                    var settingsJson = await _storageService.LoadSettingsAsync();
                    if (!string.IsNullOrWhiteSpace(settingsJson))
                    {
                        using var doc = JsonDocument.Parse(settingsJson);
                        if (string.IsNullOrWhiteSpace(clientId) && doc.RootElement.TryGetProperty("igdb_client_id", out var cid))
                            clientId = cid.GetString() ?? "";
                        if (string.IsNullOrWhiteSpace(clientSecret) && doc.RootElement.TryGetProperty("igdb_client_secret", out var cs))
                            clientSecret = cs.GetString() ?? "";
                        if (string.IsNullOrWhiteSpace(accessToken) && doc.RootElement.TryGetProperty("igdb_access_token", out var at))
                            accessToken = at.GetString() ?? "";
                    }
                }
                catch { }
            }

            return (clientId, clientSecret, accessToken);
        }

        public async Task<ApiResponse> HandleAsync(string method, string path, string queryString, string bodyText)
        {
            var normMethod = method?.ToUpperInvariant() ?? "GET";
            var normPath = path?.ToLowerInvariant() ?? "/";

            if (normMethod == "OPTIONS")
            {
                return new ApiResponse
                {
                    StatusCode = 200,
                    Headers = "Access-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS, HEAD\r\nAccess-Control-Allow-Headers: Content-Type, Client-ID, Authorization, Accept"
                };
            }

            var queryParams = System.Web.HttpUtility.ParseQueryString(queryString ?? string.Empty);

            // 1. STATUS / SAÚDE
            if (normPath == "/api/status" || normPath == "/api/health")
            {
                var statusObj = new
                {
                    status = "ok",
                    server = "Nota 11 Windows Native",
                    storagePath = _storageService.StorageDirectory,
                    time = DateTime.UtcNow.ToString("o")
                };
                return ApiResponse.Json(JsonSerializer.Serialize(statusObj));
            }

            // 2. HLTB SEARCH
            if (normPath == "/api/hltb/search")
            {
                string searchTitle = queryParams["q"] ?? queryParams["title"] ?? "";
                if (string.IsNullOrWhiteSpace(searchTitle) && !string.IsNullOrWhiteSpace(bodyText))
                {
                    try
                    {
                        using var doc = JsonDocument.Parse(bodyText);
                        if (doc.RootElement.TryGetProperty("title", out var t)) searchTitle = t.GetString() ?? "";
                        else if (doc.RootElement.TryGetProperty("q", out var q)) searchTitle = q.GetString() ?? "";
                    }
                    catch { }
                }

                var result = await _hltbService.SearchAsync(searchTitle);
                return ApiResponse.Json(result);
            }

            // 3. TWITCH TOKEN
            if (normPath == "/api/twitch/token")
            {
                string clientId = queryParams["clientId"] ?? "";
                string clientSecret = queryParams["clientSecret"] ?? "";
                if (!string.IsNullOrWhiteSpace(bodyText))
                {
                    try
                    {
                        using var doc = JsonDocument.Parse(bodyText);
                        if (doc.RootElement.TryGetProperty("clientId", out var cid)) clientId = cid.GetString() ?? "";
                        if (doc.RootElement.TryGetProperty("clientSecret", out var cs)) clientSecret = cs.GetString() ?? "";
                    }
                    catch { }
                }

                var creds = await GetFallbackCredentialsAsync(clientId, clientSecret, "");
                var tokenResult = await _igdbService.GetTwitchTokenAsync(creds.clientId, creds.clientSecret);
                return ApiResponse.Json(tokenResult);
            }

            // 4. IGDB GAMES
            if (normPath == "/api/igdb/games")
            {
                string clientId = "", clientSecret = "", accessToken = "", query = "";
                if (!string.IsNullOrWhiteSpace(bodyText))
                {
                    try
                    {
                        using var doc = JsonDocument.Parse(bodyText);
                        if (doc.RootElement.TryGetProperty("clientId", out var cid)) clientId = cid.GetString() ?? "";
                        if (doc.RootElement.TryGetProperty("clientSecret", out var cs)) clientSecret = cs.GetString() ?? "";
                        if (doc.RootElement.TryGetProperty("accessToken", out var at)) accessToken = at.GetString() ?? "";
                        if (doc.RootElement.TryGetProperty("query", out var q)) query = q.GetString() ?? "";
                    }
                    catch { }
                }

                var creds = await GetFallbackCredentialsAsync(clientId, clientSecret, accessToken);
                var igdbResult = await _igdbService.QueryIgdbWithAutoAuthAsync(creds.clientId, creds.clientSecret, creds.accessToken, query);
                return ApiResponse.Json(igdbResult);
            }

            // 5. IGDB SEARCH UNIFICADO (METADADOS & CAPAS)
            if (normPath == "/api/igdb/search")
            {
                string searchTitle = queryParams["q"] ?? queryParams["title"] ?? "";
                string platform = queryParams["platform"] ?? "";
                string clientId = queryParams["clientId"] ?? "";
                string clientSecret = queryParams["clientSecret"] ?? "";
                string accessToken = queryParams["accessToken"] ?? "";

                if (!string.IsNullOrWhiteSpace(bodyText))
                {
                    try
                    {
                        using var doc = JsonDocument.Parse(bodyText);
                        if (doc.RootElement.TryGetProperty("title", out var t)) searchTitle = t.GetString() ?? "";
                        else if (doc.RootElement.TryGetProperty("q", out var q)) searchTitle = q.GetString() ?? "";
                        if (doc.RootElement.TryGetProperty("platform", out var p)) platform = p.GetString() ?? "";
                        if (doc.RootElement.TryGetProperty("clientId", out var cid)) clientId = cid.GetString() ?? "";
                        if (doc.RootElement.TryGetProperty("clientSecret", out var cs)) clientSecret = cs.GetString() ?? "";
                        if (doc.RootElement.TryGetProperty("accessToken", out var at)) accessToken = at.GetString() ?? "";
                    }
                    catch { }
                }

                var creds = await GetFallbackCredentialsAsync(clientId, clientSecret, accessToken);
                var searchResultJson = await _igdbService.SearchGamesAsync(searchTitle, platform, creds.clientId, creds.clientSecret, creds.accessToken);
                return ApiResponse.Json(searchResultJson);
            }

            // 6. PROXY DE IMAGENS
            if (normPath == "/api/proxy-image")
            {
                var targetUrl = queryParams["url"] ?? "";
                if (string.IsNullOrWhiteSpace(targetUrl))
                {
                    return ApiResponse.Error("URL ausente", 400);
                }

                var img = await _imageService.FetchImageAsync(targetUrl);
                if (img.HasValue)
                {
                    return new ApiResponse
                    {
                        StatusCode = 200,
                        ContentType = img.Value.ContentType,
                        Headers = $"Content-Type: {img.Value.ContentType}\r\nAccess-Control-Allow-Origin: *\r\nCache-Control: public, max-age=86400, immutable",
                        Data = img.Value.Data
                    };
                }

                return ApiResponse.Error("Falha ao baixar imagem", 502);
            }

            // 7. STORAGE SAVE / LOAD
            if (normPath == "/api/storage/save" && normMethod == "POST")
            {
                await _storageService.SaveDatabaseAsync(bodyText ?? "{}");
                return ApiResponse.Json("{\"status\":\"saved\"}");
            }

            if (normPath == "/api/storage/load")
            {
                var json = await _storageService.LoadDatabaseAsync();
                return ApiResponse.Json(json ?? "null");
            }

            return ApiResponse.Error("Endpoint não encontrado", 404);
        }
    }
}
