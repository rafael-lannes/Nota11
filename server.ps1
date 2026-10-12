# ==============================================================================
# Servidor Localhost Nativo do Windows para o Nota 11 Game Tracker
# Não necessita de Node.js, Python ou instalação adicional.
# ==============================================================================

param (
    [int]$Port = 3000,
    [switch]$NoBrowser
)

$Host.UI.RawUI.WindowTitle = "Nota 11 - Servidor Localhost"

# Garante TLS 1.2 e 1.3 para chamadas de API externas
try {
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12 -bor [System.Net.SecurityProtocolType]::Tls13
} catch {
    try { [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12 } catch {}
}

# Determina diretório base seguro
$BaseDir = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }

# Mapeamento de Extensão para MIME Type
$MimeTypes = @{
    ".html"  = "text/html; charset=utf-8"
    ".htm"   = "text/html; charset=utf-8"
    ".js"    = "application/javascript; charset=utf-8"
    ".mjs"   = "application/javascript; charset=utf-8"
    ".css"   = "text/css; charset=utf-8"
    ".json"  = "application/json; charset=utf-8"
    ".png"   = "image/png"
    ".jpg"   = "image/jpeg"
    ".jpeg"  = "image/jpeg"
    ".webp"  = "image/webp"
    ".gif"   = "image/gif"
    ".svg"   = "image/svg+xml"
    ".ico"   = "image/x-icon"
    ".csv"   = "text/csv; charset=utf-8"
    ".txt"   = "text/plain; charset=utf-8"
    ".woff"  = "font/woff"
    ".woff2" = "font/woff2"
    ".ttf"   = "font/ttf"
}

# Lista expandida de portas candidatas em caso de conflito (testa 3000..3040 + alternativas)
$CandidatePorts = @($Port..($Port + 40)) + @(8080, 8000, 5500, 8888, 4200) | Select-Object -Unique

$Listener = $null
$ActivePort = 0

foreach ($p in $CandidatePorts) {
    $tempListener = New-Object System.Net.HttpListener
    
    # Adiciona prefixo 127.0.0.1 (suportado universalmente sem necessidade de privilegios de Administrador)
    try {
        $tempListener.Prefixes.Add("http://127.0.0.1:$p/")
    } catch {}
    
    try {
        $tempListener.Start()
        $Listener = $tempListener
        $ActivePort = $p
        break
    } catch {
        Write-Host " [AVISO] Porta $p ocupada ou indisponivel. Tentando proxima..." -ForegroundColor DarkYellow
        try { 
            $tempListener.Close() 
            $tempListener.Dispose() 
        } catch {}
    }
}

if (-not $Listener -or -not $Listener.IsListening) {
    Write-Host ""
    Write-Host "==========================================================" -ForegroundColor Red
    Write-Host "  AVISO: Nao foi possivel iniciar o servidor HTTP local.  " -ForegroundColor Yellow
    Write-Host "==========================================================" -ForegroundColor Red
    Write-Host "  Todas as portas padrao estao ocupadas por outros programas." -ForegroundColor Yellow
    Write-Host "  Abrindo a aplicacao diretamente no navegador via index.html..." -ForegroundColor Cyan
    Write-Host "==========================================================" -ForegroundColor Red
    Write-Host ""
    try {
        Start-Process "$BaseDir\index.html"
    } catch {
        Write-Host "Abra manualmente: $BaseDir\index.html" -ForegroundColor White
    }
    Start-Sleep -Seconds 3
    exit 0
}

$Host.UI.RawUI.WindowTitle = "Nota 11 - Servidor Localhost (Porta $ActivePort)"

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Yellow
Write-Host "       NOTA 11 - SERVIDOR LOCAL (LOCALHOST:$ActivePort)   " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Yellow
Write-Host " > Diretório Base : $BaseDir" -ForegroundColor Gray
Write-Host " > URL Principal  : http://localhost:$ActivePort/" -ForegroundColor Green
Write-Host " > URL Alternativa: http://127.0.0.1:$ActivePort/" -ForegroundColor Green
Write-Host " > Proxy IGDB/Twitch integrado (Sem restrições de CORS)" -ForegroundColor Gray
Write-Host "----------------------------------------------------------" -ForegroundColor DarkGray
Write-Host " Pressione Ctrl+C para encerrar o servidor a qualquer momento." -ForegroundColor DarkYellow
Write-Host "==========================================================" -ForegroundColor Yellow
Write-Host ""

# Abre o navegador automaticamente se não desativado
if (-not $NoBrowser) {
    try {
        Start-Process "http://localhost:$ActivePort/"
    } catch {
        try {
            Start-Process "http://127.0.0.1:$ActivePort/"
        } catch {
            Write-Host "Abra http://localhost:$ActivePort/ no seu navegador." -ForegroundColor Cyan
        }
    }
}

# Loop principal de atendimento a requisições
while ($Listener.IsListening) {
    $Context = $null
    try {
        $Context = $Listener.GetContext()
    } catch [System.Net.HttpListenerException] {
        break
    } catch {
        continue
    }

    if (-not $Context) { continue }

    try {
        $Request = $Context.Request
        $Response = $Context.Response

        # Adiciona cabeçalhos CORS padrão
        $Response.Headers.Add("Access-Control-Allow-Origin", "*")
        $Response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD")
        $Response.Headers.Add("Access-Control-Allow-Headers", "Content-Type, Client-ID, Authorization, Accept")

        # Tratamento de pre-flight OPTIONS
        if ($Request.HttpMethod -eq "OPTIONS") {
            $Response.StatusCode = 200
            $Response.Close()
            continue
        }

        $RawPath = $Request.Url.AbsolutePath

        # ----------------------------------------------------------------------
        # ROTAS DE PROXY PARA API DO TWITCH / IGDB (Zero CORS no navegador)
        # ----------------------------------------------------------------------
        if ($RawPath -eq "/api/twitch/token" -and $Request.HttpMethod -eq "POST") {
            try {
                $Reader = New-Object System.IO.StreamReader($Request.InputStream, [System.Text.Encoding]::UTF8)
                $Body = $Reader.ReadToEnd()
                $Reader.Close()
                $Json = $Body | ConvertFrom-Json
                
                $EncodedId = [System.Net.WebUtility]::UrlEncode($Json.clientId)
                $EncodedSec = [System.Net.WebUtility]::UrlEncode($Json.clientSecret)
                $TokenUri = "https://id.twitch.tv/oauth2/token?client_id=$EncodedId&client_secret=$EncodedSec&grant_type=client_credentials"
                $TwitchResp = Invoke-RestMethod -Uri $TokenUri -Method Post -TimeoutSec 10
                $JsonResp = $TwitchResp | ConvertTo-Json -Compress
                
                $Buffer = [System.Text.Encoding]::UTF8.GetBytes($JsonResp)
                $Response.ContentType = "application/json; charset=utf-8"
                $Response.StatusCode = 200
                $Response.OutputStream.Write($Buffer, 0, $Buffer.Length)
            } catch {
                $Response.StatusCode = 400
                $ErrMsg = [System.Text.Encoding]::UTF8.GetBytes("{""error"": ""$($_.Exception.Message)""}")
                $Response.ContentType = "application/json; charset=utf-8"
                $Response.OutputStream.Write($ErrMsg, 0, $ErrMsg.Length)
            }
            $Response.Close()
            continue
        }

        if ($RawPath -eq "/api/igdb/games" -and $Request.HttpMethod -eq "POST") {
            try {
                $Reader = New-Object System.IO.StreamReader($Request.InputStream, [System.Text.Encoding]::UTF8)
                $Body = $Reader.ReadToEnd()
                $Reader.Close()
                $Json = $Body | ConvertFrom-Json

                $Headers = @{
                    "Client-ID" = $Json.clientId
                    "Authorization" = "Bearer $($Json.accessToken)"
                    "Accept" = "application/json"
                }

                $IgdbResp = Invoke-WebRequest -Uri "https://api.igdb.com/v4/games" -Method Post -Headers $Headers -Body $Json.query -TimeoutSec 12
                $Buffer = [System.Text.Encoding]::UTF8.GetBytes($IgdbResp.Content)
                $Response.ContentType = "application/json; charset=utf-8"
                $Response.StatusCode = 200
                $Response.OutputStream.Write($Buffer, 0, $Buffer.Length)
            } catch {
                $Response.StatusCode = 400
                $ErrMsg = [System.Text.Encoding]::UTF8.GetBytes("{""error"": ""$($_.Exception.Message)""}")
                $Response.ContentType = "application/json; charset=utf-8"
                $Response.OutputStream.Write($ErrMsg, 0, $ErrMsg.Length)
            }
            $Response.Close()
            continue
        }

        # ----------------------------------------------------------------------
        # ROTA DE STATUS / SAÚDE DO SERVIDOR LOCAL
        # ----------------------------------------------------------------------
        if ($RawPath -eq "/api/status" -or $RawPath -eq "/api/health") {
            $StatusJson = @{
                status = "ok"
                server = "PowerShell Native Localhost"
                port = $ActivePort
                time = [DateTime]::UtcNow.ToString("o")
            } | ConvertTo-Json -Compress
            $Buffer = [System.Text.Encoding]::UTF8.GetBytes($StatusJson)
            $Response.ContentType = "application/json; charset=utf-8"
            $Response.StatusCode = 200
            $Response.OutputStream.Write($Buffer, 0, $Buffer.Length)
            $Response.Close()
            continue
        }

        # ----------------------------------------------------------------------
        # ROTAS DE PROXY PARA HOWLONGTOBEAT (HLTB) COM AUTO-RENOVACAO DE TOKEN
        # ----------------------------------------------------------------------
        if ($RawPath -eq "/api/hltb/search") {
            try {
                $SearchTitle = ""
                if ($Request.HttpMethod -eq "GET") {
                    $SearchTitle = $Request.QueryString["q"]
                } elseif ($Request.HttpMethod -eq "POST") {
                    $Reader = New-Object System.IO.StreamReader($Request.InputStream, [System.Text.Encoding]::UTF8)
                    $Body = $Reader.ReadToEnd()
                    $Reader.Close()
                    $Json = $Body | ConvertFrom-Json
                    $SearchTitle = if ($Json.title) { $Json.title } else { $Json.q }
                }

                if ([string]::IsNullOrWhiteSpace($SearchTitle)) {
                    throw "Parâmetro de busca 'q' ou 'title' não informado."
                }

                $HltbHeaders = @{
                    "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
                    "Referer" = "https://howlongtobeat.com/"
                    "Origin" = "https://howlongtobeat.com"
                }

                # Função interna para obter token fresco
                $GetFreshToken = {
                    $Timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
                    $InitUrl = "https://howlongtobeat.com/api/search/site/init?t=$Timestamp"
                    $InitResp = Invoke-WebRequest -Uri $InitUrl -Headers $HltbHeaders -UseBasicParsing -TimeoutSec 10
                    $InitData = $InitResp.Content | ConvertFrom-Json
                    return @{
                        Token = $InitData.token
                        HpKey = $InitData.hpKey
                        HpVal = $InitData.hpVal
                        ExpiresAt = [DateTime]::UtcNow.AddMinutes(20)
                    }
                }

                # 1. Obter ou renovar token de segurança do HLTB
                if (-not $Global:HltbTokenCache -or [DateTime]::UtcNow -ge $Global:HltbTokenCache.ExpiresAt) {
                    $Global:HltbTokenCache = & $GetFreshToken
                }

                # 2. Sanitiza título e garante array explícito @(...) para não quebrar buscas de 1 palavra no JSON
                $CleanTitle = [regex]::Replace($SearchTitle, '[+:\-_/\\&''"!~#@$%^*=|]', ' ')
                $CleanTitle = [regex]::Replace($CleanTitle, '\s+', ' ').Trim()
                $SearchTerms = @($CleanTitle.Split(" ") | Where-Object { $_.Trim() -ne "" })
                if ($SearchTerms.Count -eq 0) {
                    $SearchTerms = @($SearchTitle.Trim())
                }

                # 3. Executa busca com tentativa e auto-retry com token renovado
                $SearchContent = $null
                $SearchSuccess = $false

                for ($attempt = 1; $attempt -le 2; $attempt++) {
                    try {
                        $BodyObj = [ordered]@{
                            "searchType" = "games"
                            "searchTerms" = $SearchTerms
                            "searchPage" = 1
                            "size" = 10
                            "searchOptions" = @{
                                "games" = @{
                                    "userId" = 0
                                    "platform" = ""
                                    "sortCategory" = "popular"
                                    "rangeCategory" = "main"
                                    "rangeTime" = @{ "min" = $null; "max" = $null }
                                    "gameplay" = @{ "perspective" = ""; "flow" = ""; "genre" = ""; "difficulty" = "" }
                                    "rangeYear" = @{ "min" = ""; "max" = "" }
                                    "modifier" = ""
                                }
                                "users" = @{ "sortCategory" = "postcount" }
                                "lists" = @{ "sortCategory" = "follows" }
                                "filter" = ""
                                "sort" = 0
                                "randomizer" = 0
                            }
                            "useCache" = $true
                        }
                        if ($Global:HltbTokenCache.HpKey) {
                            $BodyObj[$Global:HltbTokenCache.HpKey] = $Global:HltbTokenCache.HpVal
                        }
                        $PayloadJson = $BodyObj | ConvertTo-Json -Depth 10

                        $ReqHeaders = @{
                            "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
                            "Referer" = "https://howlongtobeat.com/"
                            "Origin" = "https://howlongtobeat.com"
                            "Content-Type" = "application/json"
                            "x-auth-token" = $Global:HltbTokenCache.Token
                            "x-hp-key" = $Global:HltbTokenCache.HpKey
                            "x-hp-val" = $Global:HltbTokenCache.HpVal
                        }

                        $SearchResp = Invoke-WebRequest -Uri "https://howlongtobeat.com/api/search/site" -Method POST -Headers $ReqHeaders -Body $PayloadJson -UseBasicParsing -TimeoutSec 12
                        $SearchContent = $SearchResp.Content
                        $SearchSuccess = $true
                        break
                    } catch {
                        # Em caso de erro 401, 403 ou 404, renova o token na hora e tenta mais uma vez
                        $Global:HltbTokenCache = & $GetFreshToken
                    }
                }

                if ($SearchSuccess -and $SearchContent) {
                    $Buffer = [System.Text.Encoding]::UTF8.GetBytes($SearchContent)
                    $Response.ContentType = "application/json; charset=utf-8"
                    $Response.StatusCode = 200
                    $Response.OutputStream.Write($Buffer, 0, $Buffer.Length)
                } else {
                    $ErrObj = @{ error = "Falha na consulta ao HowLongToBeat"; data = @() } | ConvertTo-Json -Compress
                    $ErrMsg = [System.Text.Encoding]::UTF8.GetBytes($ErrObj)
                    $Response.ContentType = "application/json; charset=utf-8"
                    $Response.StatusCode = 200
                    $Response.OutputStream.Write($ErrMsg, 0, $ErrMsg.Length)
                }
            } catch {
                $Response.StatusCode = 200
                $ErrObj = @{ error = $_.Exception.Message; data = @() } | ConvertTo-Json -Compress
                $ErrMsg = [System.Text.Encoding]::UTF8.GetBytes($ErrObj)
                $Response.ContentType = "application/json; charset=utf-8"
                $Response.OutputStream.Write($ErrMsg, 0, $ErrMsg.Length)
            }
            $Response.Close()
            continue
        }

        # ----------------------------------------------------------------------
        # PROXY DE IMAGENS EXTERNAS (Garante CORS liberado para snapshots .PNG)
        # ----------------------------------------------------------------------
        if ($RawPath -eq "/api/proxy-image" -and $Request.HttpMethod -eq "GET") {
            try {
                $TargetUrl = $Request.QueryString["url"]
                if ([string]::IsNullOrWhiteSpace($TargetUrl) -or -not ($TargetUrl -match "^https?://")) {
                    $Response.StatusCode = 400
                    $Buffer = [System.Text.Encoding]::UTF8.GetBytes('{"error":"URL de imagem inválida ou ausente"}')
                    $Response.ContentType = "application/json; charset=utf-8"
                    $Response.OutputStream.Write($Buffer, 0, $Buffer.Length)
                    $Response.Close()
                    continue
                }

                $ImgReq = [System.Net.HttpWebRequest]::Create($TargetUrl)
                $ImgReq.UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
                $ImgReq.Referer = $TargetUrl
                $ImgReq.Timeout = 12000
                $ImgReq.AllowAutoRedirect = $true
                $ImgReq.AutomaticDecompression = [System.Net.DecompressionMethods]::GZip -bor [System.Net.DecompressionMethods]::Deflate
                
                $ImgResp = $ImgReq.GetResponse()
                $Response.ContentType = if ($ImgResp.ContentType) { $ImgResp.ContentType } else { "image/jpeg" }
                $Response.StatusCode = 200
                $Response.Headers.Set("Access-Control-Allow-Origin", "*")
                $Response.Headers.Set("Cache-Control", "public, max-age=86400, immutable")

                $RespStream = $ImgResp.GetResponseStream()
                $RespStream.CopyTo($Response.OutputStream)
                $RespStream.Close()
                $ImgResp.Close()
            } catch {
                $Response.StatusCode = 502
                $Buffer = [System.Text.Encoding]::UTF8.GetBytes('{"error":"Falha ao carregar imagem remota"}')
                $Response.ContentType = "application/json; charset=utf-8"
                $Response.OutputStream.Write($Buffer, 0, $Buffer.Length)
            }
            $Response.Close()
            continue
        }

        # ----------------------------------------------------------------------
        # SERVINDO ARQUIVOS ESTÁTICOS LOCAIS
        # ----------------------------------------------------------------------
        $CleanPath = [System.Net.WebUtility]::UrlDecode($RawPath.TrimStart('/'))
        if ([string]::IsNullOrWhiteSpace($CleanPath)) {
            $CleanPath = "index.html"
        }

        $FilePath = Join-Path $BaseDir $CleanPath

        if (Test-Path $FilePath -PathType Leaf) {
            $Extension = [System.IO.Path]::GetExtension($FilePath).ToLower()
            $ContentType = if ($MimeTypes.ContainsKey($Extension)) { $MimeTypes[$Extension] } else { "application/octet-stream" }

            $FileBytes = [System.IO.File]::ReadAllBytes($FilePath)
            $Response.ContentType = $ContentType
            $Response.StatusCode = 200
            $Response.ContentLength64 = $FileBytes.Length
            if ($Request.HttpMethod -ne "HEAD") {
                $Response.OutputStream.Write($FileBytes, 0, $FileBytes.Length)
            }
            Write-Host "[$([DateTime]::Now.ToString('HH:mm:ss'))] 200 $($Request.HttpMethod) $RawPath" -ForegroundColor Green
        } else {
            $Response.StatusCode = 404
            $NotFoundHtml = "<!DOCTYPE html><html><head><meta charset='utf-8'><title>404</title></head><body style='font-family:sans-serif;background:#090a0f;color:#fff;padding:2rem;'><h1>404 - Arquivo Não Encontrado</h1><p>$CleanPath</p><a href='/' style='color:#8b5cf6;'>Voltar para Início</a></body></html>"
            $Buffer = [System.Text.Encoding]::UTF8.GetBytes($NotFoundHtml)
            $Response.ContentType = "text/html; charset=utf-8"
            $Response.ContentLength64 = $Buffer.Length
            if ($Request.HttpMethod -ne "HEAD") {
                $Response.OutputStream.Write($Buffer, 0, $Buffer.Length)
            }
            Write-Host "[$([DateTime]::Now.ToString('HH:mm:ss'))] 404 $($Request.HttpMethod) $RawPath" -ForegroundColor Red
        }
    } catch {
        Write-Host "Erro no processamento da requisição: $($_.Exception.Message)" -ForegroundColor Red
    } finally {
        if ($Context -and $Context.Response) {
            try { $Context.Response.Close() } catch {}
        }
    }
}
