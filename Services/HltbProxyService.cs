using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace Nota11.Services
{
    public class HltbTokenData
    {
        public string Token { get; set; } = string.Empty;
        public string HpKey { get; set; } = string.Empty;
        public string HpVal { get; set; } = string.Empty;
        public DateTime ExpiresAt { get; set; } = DateTime.MinValue;
    }

    public class HltbProxyService
    {
        private readonly HttpClient _httpClient;
        private HltbTokenData? _cachedToken;

        public HltbProxyService()
        {
            var handler = new HttpClientHandler
            {
                AutomaticDecompression = System.Net.DecompressionMethods.All
            };

            _httpClient = new HttpClient(handler)
            {
                Timeout = TimeSpan.FromSeconds(15)
            };
            _httpClient.DefaultRequestHeaders.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36");
            _httpClient.DefaultRequestHeaders.Add("Referer", "https://howlongtobeat.com/");
            _httpClient.DefaultRequestHeaders.Add("Origin", "https://howlongtobeat.com");
        }

        private async Task<HltbTokenData> FetchInitTokenAsync()
        {
            var initUrl = $"https://howlongtobeat.com/api/search/site/init?t={DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}";
            using var req = new HttpRequestMessage(HttpMethod.Get, initUrl);
            using var resp = await _httpClient.SendAsync(req);
            resp.EnsureSuccessStatusCode();

            var json = await resp.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;

            var token = root.GetProperty("token").GetString() ?? string.Empty;
            var hpKey = root.TryGetProperty("hpKey", out var k) ? k.GetString() ?? string.Empty : string.Empty;
            var hpVal = root.TryGetProperty("hpVal", out var v) ? v.GetString() ?? string.Empty : string.Empty;

            var data = new HltbTokenData
            {
                Token = token,
                HpKey = hpKey,
                HpVal = hpVal,
                ExpiresAt = DateTime.UtcNow.AddMinutes(20)
            };

            _cachedToken = data;
            return data;
        }

        private async Task<string> QueryHltbInternalAsync(string[] searchTerms, HltbTokenData tokenData)
        {
            var bodyObj = new Dictionary<string, object>
            {
                ["searchType"] = "games",
                ["searchTerms"] = searchTerms,
                ["searchPage"] = 1,
                ["size"] = 10,
                ["searchOptions"] = new Dictionary<string, object>
                {
                    ["games"] = new Dictionary<string, object?>
                    {
                        ["userId"] = 0,
                        ["platform"] = "",
                        ["sortCategory"] = "popular",
                        ["rangeCategory"] = "main",
                        ["rangeTime"] = new { min = (int?)null, max = (int?)null },
                        ["gameplay"] = new { perspective = "", flow = "", genre = "", difficulty = "" },
                        ["rangeYear"] = new { min = "", max = "" },
                        ["modifier"] = ""
                    },
                    ["users"] = new { sortCategory = "postcount" },
                    ["lists"] = new { sortCategory = "follows" },
                    ["filter"] = "",
                    ["sort"] = 0,
                    ["randomizer"] = 0
                },
                ["useCache"] = true
            };

            if (!string.IsNullOrEmpty(tokenData.HpKey) && !string.IsNullOrEmpty(tokenData.HpVal))
            {
                bodyObj[tokenData.HpKey] = tokenData.HpVal;
            }

            var payloadJson = JsonSerializer.Serialize(bodyObj);
            using var request = new HttpRequestMessage(HttpMethod.Post, "https://howlongtobeat.com/api/search/site")
            {
                Content = new StringContent(payloadJson, Encoding.UTF8, "application/json")
            };

            request.Headers.Add("x-auth-token", tokenData.Token);
            if (!string.IsNullOrEmpty(tokenData.HpKey)) request.Headers.Add("x-hp-key", tokenData.HpKey);
            if (!string.IsNullOrEmpty(tokenData.HpVal)) request.Headers.Add("x-hp-val", tokenData.HpVal);

            using var response = await _httpClient.SendAsync(request);
            if (response.IsSuccessStatusCode)
            {
                return await response.Content.ReadAsStringAsync();
            }

            throw new HttpRequestException($"HTTP {(int)response.StatusCode}: {response.ReasonPhrase}");
        }

        public async Task<string> SearchAsync(string searchTitle)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(searchTitle))
                {
                    return JsonSerializer.Serialize(new { error = "Título não informado", data = Array.Empty<object>() });
                }

                // Sanitização do título
                var clean = Regex.Replace(searchTitle, @"[+:\-_/\\&'""!~#@$%^*=|]", " ");
                clean = Regex.Replace(clean, @"\s+", " ").Trim();

                var terms = clean.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                if (terms.Length == 0)
                {
                    terms = new[] { searchTitle.Trim() };
                }

                if (_cachedToken == null || DateTime.UtcNow >= _cachedToken.ExpiresAt)
                {
                    await FetchInitTokenAsync();
                }

                try
                {
                    return await QueryHltbInternalAsync(terms, _cachedToken!);
                }
                catch
                {
                    // Retry com token novo
                    var freshToken = await FetchInitTokenAsync();
                    return await QueryHltbInternalAsync(terms, freshToken);
                }
            }
            catch (Exception ex)
            {
                return JsonSerializer.Serialize(new { error = ex.Message, data = Array.Empty<object>() });
            }
        }
    }
}
