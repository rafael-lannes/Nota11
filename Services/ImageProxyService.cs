using System;
using System.Net.Http;
using System.Threading.Tasks;

namespace Nota11.Services
{
    public class ImageProxyService
    {
        private readonly HttpClient _httpClient;

        public ImageProxyService()
        {
            var handler = new HttpClientHandler
            {
                AutomaticDecompression = System.Net.DecompressionMethods.All,
                AllowAutoRedirect = true
            };

            _httpClient = new HttpClient(handler)
            {
                Timeout = TimeSpan.FromSeconds(15)
            };
            _httpClient.DefaultRequestHeaders.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36");
        }

        public async Task<(byte[] Data, string ContentType)?> FetchImageAsync(string url)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(url) || !Uri.TryCreate(url, UriKind.Absolute, out var uri))
                {
                    return null;
                }

                using var req = new HttpRequestMessage(HttpMethod.Get, uri);
                req.Headers.Add("Referer", url);

                using var resp = await _httpClient.SendAsync(req);
                if (!resp.IsSuccessStatusCode) return null;

                var bytes = await resp.Content.ReadAsByteArrayAsync();
                var contentType = resp.Content.Headers.ContentType?.MediaType ?? "image/jpeg";

                return (bytes, contentType);
            }
            catch
            {
                return null;
            }
        }
    }
}
