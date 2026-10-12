using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

namespace Nota11.Services
{
    public class IgdbProxyService
    {
        private readonly HttpClient _httpClient;
        private string? _cachedToken;
        private string? _cachedClientId;
        private DateTime _cachedTokenExpiry = DateTime.MinValue;
        private readonly SemaphoreSlim _tokenLock = new(1, 1);

        public IgdbProxyService()
        {
            var handler = new HttpClientHandler
            {
                AutomaticDecompression = System.Net.DecompressionMethods.All
            };

            _httpClient = new HttpClient(handler)
            {
                Timeout = TimeSpan.FromSeconds(15)
            };
            _httpClient.DefaultRequestHeaders.Add("User-Agent", "Nota11/1.0 (Windows; GameTracker)");
        }

        public async Task<string> GetTwitchTokenAsync(string clientId, string clientSecret)
        {
            try
            {
                var cleanCid = clientId?.Trim() ?? string.Empty;
                var cleanCs = clientSecret?.Trim() ?? string.Empty;
                if (string.IsNullOrWhiteSpace(cleanCid) || string.IsNullOrWhiteSpace(cleanCs))
                {
                    return "{\"error\":\"Client ID e Client Secret são obrigatórios\"}";
                }

                var url = $"https://id.twitch.tv/oauth2/token?client_id={Uri.EscapeDataString(cleanCid)}&client_secret={Uri.EscapeDataString(cleanCs)}&grant_type=client_credentials";
                using var req = new HttpRequestMessage(HttpMethod.Post, url);
                using var resp = await _httpClient.SendAsync(req);
                var raw = await resp.Content.ReadAsStringAsync();

                if (resp.IsSuccessStatusCode)
                {
                    try
                    {
                        using var doc = JsonDocument.Parse(raw);
                        if (doc.RootElement.TryGetProperty("access_token", out var atProp))
                        {
                            var token = atProp.GetString();
                            var expiresIn = doc.RootElement.TryGetProperty("expires_in", out var expProp) ? expProp.GetInt32() : 3600;
                            _cachedToken = token;
                            _cachedClientId = cleanCid;
                            _cachedTokenExpiry = DateTime.UtcNow.AddSeconds(Math.Max(60, expiresIn - 300));
                        }
                    }
                    catch { }
                }

                return raw;
            }
            catch (Exception ex)
            {
                return $"{{\"error\":\"{ex.Message}\"}}";
            }
        }

        public async Task<string?> GetValidTokenAsync(string clientId, string clientSecret, string? providedToken = null)
        {
            var cleanCid = clientId?.Trim() ?? string.Empty;
            var cleanCs = clientSecret?.Trim() ?? string.Empty;
            var cleanToken = providedToken?.Trim() ?? string.Empty;

            // Se o token em cache ainda for válido para o mesmo Client ID
            if (!string.IsNullOrWhiteSpace(_cachedToken) && _cachedClientId == cleanCid && DateTime.UtcNow < _cachedTokenExpiry)
            {
                return _cachedToken;
            }

            // Se temos credenciais Twitch, renovamos de forma segura
            if (!string.IsNullOrWhiteSpace(cleanCid) && !string.IsNullOrWhiteSpace(cleanCs))
            {
                await _tokenLock.WaitAsync();
                try
                {
                    if (!string.IsNullOrWhiteSpace(_cachedToken) && _cachedClientId == cleanCid && DateTime.UtcNow < _cachedTokenExpiry)
                    {
                        return _cachedToken;
                    }

                    var tokenJson = await GetTwitchTokenAsync(cleanCid, cleanCs);
                    using var doc = JsonDocument.Parse(tokenJson);
                    if (doc.RootElement.TryGetProperty("access_token", out var atProp))
                    {
                        var token = atProp.GetString();
                        var expiresIn = doc.RootElement.TryGetProperty("expires_in", out var expProp) ? expProp.GetInt32() : 3600;
                        _cachedToken = token;
                        _cachedClientId = cleanCid;
                        _cachedTokenExpiry = DateTime.UtcNow.AddSeconds(Math.Max(60, expiresIn - 300));
                        return _cachedToken;
                    }
                }
                catch
                {
                    // Se falhar a renovação, tenta usar o token fornecido
                    if (!string.IsNullOrWhiteSpace(cleanToken)) return cleanToken;
                }
                finally
                {
                    _tokenLock.Release();
                }
            }

            return !string.IsNullOrWhiteSpace(cleanToken) ? cleanToken : _cachedToken;
        }

        public async Task<string> QueryIgdbAsync(string clientId, string accessToken, string query)
        {
            try
            {
                using var req = new HttpRequestMessage(HttpMethod.Post, "https://api.igdb.com/v4/games");
                req.Headers.Add("Client-ID", clientId);
                req.Headers.Add("Authorization", $"Bearer {accessToken}");
                req.Headers.Add("Accept", "application/json");
                req.Content = new StringContent(query ?? string.Empty, Encoding.UTF8, "text/plain");

                using var resp = await _httpClient.SendAsync(req);
                return await resp.Content.ReadAsStringAsync();
            }
            catch (Exception ex)
            {
                return $"{{\"error\":\"{ex.Message}\"}}";
            }
        }

        public async Task<string> QueryIgdbWithAutoAuthAsync(string clientId, string clientSecret, string? accessToken, string query)
        {
            var cleanCid = clientId?.Trim() ?? string.Empty;
            var cleanCs = clientSecret?.Trim() ?? string.Empty;
            var token = await GetValidTokenAsync(cleanCid, cleanCs, accessToken);

            if (string.IsNullOrWhiteSpace(cleanCid) || string.IsNullOrWhiteSpace(token))
            {
                return "{\"error\":\"Credenciais IGDB ausentes\"}";
            }

            var result = await QueryIgdbAsync(cleanCid, token, query);

            // Verifica se houve falha de autorização (token expirado ou 401/403)
            bool isAuthFailure = result.Contains("\"status\": 401") ||
                                 result.Contains("\"status\": 403") ||
                                 result.Contains("Authorization Failure") ||
                                 result.Contains("Invalid OAuth token");

            if (isAuthFailure && !string.IsNullOrWhiteSpace(cleanCs))
            {
                // Invalida cache e renova o token imediatamente
                _cachedTokenExpiry = DateTime.MinValue;
                _cachedToken = null;
                token = await GetValidTokenAsync(cleanCid, cleanCs, null);
                if (!string.IsNullOrWhiteSpace(token))
                {
                    result = await QueryIgdbAsync(cleanCid, token, query);
                }
            }

            return result;
        }

        public async Task<string> SearchGamesAsync(string title, string platform, string clientId, string clientSecret, string? accessToken)
        {
            var cleanTitle = title?.Trim() ?? string.Empty;
            if (string.IsNullOrWhiteSpace(cleanTitle)) return "[]";

            var cleanCid = clientId?.Trim() ?? string.Empty;
            var cleanCs = clientSecret?.Trim() ?? string.Empty;

            // 1. Se credenciais IGDB estiverem presentes, busca no IGDB com multi-estratégia resiliente
            if (!string.IsNullOrWhiteSpace(cleanCid) && (!string.IsNullOrWhiteSpace(cleanCs) || !string.IsNullOrWhiteSpace(accessToken)))
            {
                try
                {
                    var candidates = GenerateSearchCandidates(cleanTitle);
                    const string fields = "fields id, name, summary, cover.url, cover.image_id, genres.name, platforms.name, first_release_date, artworks.url, artworks.image_id, screenshots.url, screenshots.image_id;";
                    var foundGames = new Dictionary<long, JsonElement>();

                    // Estratégia 1: Busca indexada (search "...") para os candidatos
                    foreach (var cand in candidates.Distinct())
                    {
                        var escaped = cand.Replace("\\", "\\\\").Replace("\"", "\\\"");
                        var query = $"search \"{escaped}\"; {fields} limit 25;";
                        var rawJson = await QueryIgdbWithAutoAuthAsync(cleanCid, cleanCs, accessToken, query);

                        if (!string.IsNullOrWhiteSpace(rawJson) && rawJson.Trim().StartsWith("["))
                        {
                            try
                            {
                                using var doc = JsonDocument.Parse(rawJson);
                                if (doc.RootElement.ValueKind == JsonValueKind.Array)
                                {
                                    foreach (var item in doc.RootElement.EnumerateArray())
                                    {
                                        if (item.TryGetProperty("id", out var idProp) && item.TryGetProperty("name", out _))
                                        {
                                            var gameId = idProp.GetInt64();
                                            if (!foundGames.ContainsKey(gameId))
                                            {
                                                foundGames[gameId] = item.Clone();
                                            }
                                        }
                                    }
                                }
                            }
                            catch { }
                        }

                        // Se já encontrou resultados para o candidato principal, retorna imediatamente!
                        if (foundGames.Count > 0) break;
                    }

                    // Estratégia 2: Se 0 resultados, tenta busca por padrão/substring (where name ~ *...*)
                    if (foundGames.Count == 0 && candidates.Count > 0)
                    {
                        var cleanCand = CleanSearchTitle(candidates[0]).Replace("\\", "\\\\").Replace("\"", "\\\"");
                        if (cleanCand.Length >= 3)
                        {
                            var query = $"where name ~ *\"{cleanCand}\"*; {fields} limit 25;";
                            var rawJson = await QueryIgdbWithAutoAuthAsync(cleanCid, cleanCs, accessToken, query);

                            if (!string.IsNullOrWhiteSpace(rawJson) && rawJson.Trim().StartsWith("["))
                            {
                                try
                                {
                                    using var doc = JsonDocument.Parse(rawJson);
                                    if (doc.RootElement.ValueKind == JsonValueKind.Array)
                                    {
                                        foreach (var item in doc.RootElement.EnumerateArray())
                                        {
                                            if (item.TryGetProperty("id", out var idProp) && item.TryGetProperty("name", out _))
                                            {
                                                var gameId = idProp.GetInt64();
                                                if (!foundGames.ContainsKey(gameId))
                                                {
                                                    foundGames[gameId] = item.Clone();
                                                }
                                            }
                                        }
                                    }
                                }
                                catch { }
                            }
                        }
                    }

                    if (foundGames.Count > 0)
                    {
                        return JsonSerializer.Serialize(foundGames.Values);
                    }
                }
                catch (Exception ex)
                {
                    System.Diagnostics.Debug.WriteLine($"[IgdbProxyService] Erro na busca IGDB: {ex.Message}");
                }
            }

            // 2. Fallback de altíssima velocidade para busca Steam
            return await SearchSteamAsync(cleanTitle);
        }

        public static string NormalizeDiacritics(string text)
        {
            if (string.IsNullOrWhiteSpace(text)) return string.Empty;
            var normalized = text.Normalize(NormalizationForm.FormD);
            var sb = new StringBuilder();
            foreach (var c in normalized)
            {
                var uc = CharUnicodeInfo.GetUnicodeCategory(c);
                if (uc != UnicodeCategory.NonSpacingMark)
                {
                    sb.Append(c);
                }
            }
            return sb.ToString().Normalize(NormalizationForm.FormC).Trim();
        }

        public static string CleanSearchTitle(string title)
        {
            if (string.IsNullOrWhiteSpace(title)) return string.Empty;
            var noTags = Regex.Replace(title, @"\s*\([^)]*\)|\s*\[[^\]]*\]", " ");
            var noPunct = Regex.Replace(noTags, @"[:\-_/\\#@!?,.'""`~]", " ");
            return Regex.Replace(noPunct, @"\s+", " ").Trim();
        }

        public static List<string> GenerateSearchCandidates(string rawTitle)
        {
            if (string.IsNullOrWhiteSpace(rawTitle)) return new List<string>();
            var trimmed = rawTitle.Trim();
            var candidates = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { trimmed };

            // 1. Sem diacríticos
            var ascii = NormalizeDiacritics(trimmed);
            if (!string.IsNullOrWhiteSpace(ascii)) candidates.Add(ascii);

            // 2. Sem tags (2023), [PC]
            var noTags = Regex.Replace(trimmed, @"\s*\([^)]*\)|\s*\[[^\]]*\]", " ").Trim();
            noTags = Regex.Replace(noTags, @"\s+", " ");
            if (!string.IsNullOrWhiteSpace(noTags))
            {
                candidates.Add(noTags);
                candidates.Add(NormalizeDiacritics(noTags));
            }

            // 3. Sem pontuação
            var clean = CleanSearchTitle(trimmed);
            if (!string.IsNullOrWhiteSpace(clean))
            {
                candidates.Add(clean);
                candidates.Add(NormalizeDiacritics(clean));
            }

            // 4. Prefixo antes de dois pontos ou traço
            if (trimmed.Contains(':') || trimmed.Contains(" - "))
            {
                var parts = trimmed.Split(new[] { ':', '-' }, StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length > 0)
                {
                    var prefix = parts[0].Trim();
                    if (prefix.Length >= 3)
                    {
                        candidates.Add(prefix);
                        candidates.Add(NormalizeDiacritics(prefix));
                    }
                }
            }

            // 5. Algarismos Romanos <-> Arábicos
            var romanConversions = new (string pattern, string replacement)[]
            {
                (@"\bX\b", "10"),
                (@"\bIX\b", "9"),
                (@"\bVIII\b", "8"),
                (@"\bVII\b", "7"),
                (@"\bVI\b", "6"),
                (@"\bIV\b", "4"),
                (@"\bV\b", "5"),
                (@"\bIII\b", "3"),
                (@"\bII\b", "2")
            };

            foreach (var (pat, rep) in romanConversions)
            {
                if (Regex.IsMatch(trimmed, pat, RegexOptions.IgnoreCase))
                {
                    var converted = Regex.Replace(trimmed, pat, rep, RegexOptions.IgnoreCase);
                    candidates.Add(converted);
                    candidates.Add(NormalizeDiacritics(converted));
                }
            }

            var numConversions = new (string pattern, string replacement)[]
            {
                (@"\b10\b", "X"),
                (@"\b9\b", "IX"),
                (@"\b8\b", "VIII"),
                (@"\b7\b", "VII"),
                (@"\b6\b", "VI"),
                (@"\b5\b", "V"),
                (@"\b4\b", "IV"),
                (@"\b3\b", "III"),
                (@"\b2\b", "II")
            };

            foreach (var (pat, rep) in numConversions)
            {
                if (Regex.IsMatch(trimmed, pat))
                {
                    var converted = Regex.Replace(trimmed, pat, rep);
                    candidates.Add(converted);
                    candidates.Add(NormalizeDiacritics(converted));
                }
            }

            return candidates.Where(c => !string.IsNullOrWhiteSpace(c)).ToList();
        }

        public async Task<string> SearchSteamAsync(string title)
        {
            try
            {
                var cleanTitle = CleanSearchTitle(title);
                if (string.IsNullOrWhiteSpace(cleanTitle)) cleanTitle = title?.Trim() ?? string.Empty;
                if (string.IsNullOrWhiteSpace(cleanTitle)) return "[]";

                var url = $"https://store.steampowered.com/api/storesearch/?term={Uri.EscapeDataString(cleanTitle)}&l=portuguese&cc=BR";
                using var req = new HttpRequestMessage(HttpMethod.Get, url);
                req.Headers.Add("Accept", "application/json");

                using var resp = await _httpClient.SendAsync(req);
                if (!resp.IsSuccessStatusCode) return "[]";

                var rawJson = await resp.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(rawJson);
                var root = doc.RootElement;

                if (root.TryGetProperty("items", out var items) && items.ValueKind == JsonValueKind.Array)
                {
                    var results = new List<object>();
                    foreach (var item in items.EnumerateArray().Take(10))
                    {
                        var appId = item.TryGetProperty("id", out var idProp) ? idProp.GetInt64().ToString() : "";
                        var itemName = item.TryGetProperty("name", out var nameProp) ? nameProp.GetString() ?? "" : "";
                        if (string.IsNullOrWhiteSpace(appId)) continue;

                        var headerImg = $"https://cdn.akamai.steamstatic.com/steam/apps/{appId}/header.jpg";
                        var libraryHero = $"https://cdn.akamai.steamstatic.com/steam/apps/{appId}/library_600x900_2x.jpg";
                        var libraryCover = $"https://cdn.akamai.steamstatic.com/steam/apps/{appId}/library_600x900.jpg";

                        results.Add(new
                        {
                            id = $"steam_{appId}",
                            title = itemName,
                            platform = "PC",
                            platforms = new[] { "PC (Windows / Steam)" },
                            genre = "",
                            genres = Array.Empty<string>(),
                            releaseYear = (int?)null,
                            coverUrl = libraryCover,
                            source = "Steam",
                            candidateCovers = new[]
                            {
                                new { type = "cover-vertical-hd", url = libraryHero, label = "Capa Vertical HD (Steam)", priority = 1 },
                                new { type = "cover-vertical", url = libraryCover, label = "Capa Vertical (Steam)", priority = 2 },
                                new { type = "cover-header", url = headerImg, label = "Banner Horizontal (Steam)", priority = 3 }
                            }
                        });
                    }
                    return JsonSerializer.Serialize(results);
                }
                return "[]";
            }
            catch
            {
                return "[]";
            }
        }
    }
}
