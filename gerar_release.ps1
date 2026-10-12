Write-Host "==========================================================" -ForegroundColor Yellow
Write-Host "       NOTA 11 - GERAR PACOTE DE RELEASE PARA TESTES" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Yellow
Write-Host ""

$baseDir = $PSScriptRoot
if (-not $baseDir) {
    $baseDir = Get-Location
}
Set-Location $baseDir

# Fechar instâncias do Nota11 em execução para permitir atualização dos binários
$runningApp = Get-Process "Nota11" -ErrorAction SilentlyContinue
if ($runningApp) {
    Write-Host "Fechando instância aberta do Nota 11 para atualização de arquivos..." -ForegroundColor Yellow
    $runningApp | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 600
}

# Limpar cache do WebView2 para garantir atualização imediata da interface (sem afetar database.json)
$webViewCachePath = Join-Path $env:APPDATA "Nota11\WebView2Profile"
if (Test-Path $webViewCachePath) {
    Write-Host "Limpando cache local do WebView2 para sincronizacao imediata..." -ForegroundColor Cyan
    Remove-Item -Recurse -Force $webViewCachePath -ErrorAction SilentlyContinue
}

Write-Host "Sincronizando arquivos de interface web para wwwroot..." -ForegroundColor Cyan
if (-not (Test-Path "wwwroot")) {
    New-Item -ItemType Directory -Path "wwwroot" -Force | Out-Null
}
Copy-Item -Force "index.html" "wwwroot\index.html"
Copy-Item -Recurse -Force "css" "wwwroot\"
Copy-Item -Recurse -Force "js" "wwwroot\"
Copy-Item -Recurse -Force "vendor" "wwwroot\"

if (Test-Path "bin\ReleasePackage") {
    Remove-Item -Recurse -Force "bin\ReleasePackage" -ErrorAction SilentlyContinue
}
Write-Host "1. Compilando executavel 100% autocontido de alta performance e compactacao (.NET 9 + WPF)..." -ForegroundColor Cyan
& dotnet publish -c Release -r win-x64 --self-contained true /p:PublishSingleFile=true /p:IncludeNativeLibrariesForSelfExtract=true /p:EnableCompressionInSingleFile=true /p:PublishReadyToRun=true -o "bin\ReleasePackage"

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERRO] Falha ao compilar o executavel." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "2. Organizando arquivos e gerando pacote de distribuicao..." -ForegroundColor Cyan

$releaseDir = Join-Path $baseDir "Release"
$releaseFolder = Join-Path $releaseDir "Nota 11 - Windows v1.0"
$zipPath = Join-Path $releaseDir "Nota11-Windows-v1.0-Portatil.zip"

if (-not (Test-Path $releaseDir)) {
    New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null
}

if (Test-Path $releaseFolder) {
    Remove-Item -Recurse -Force $releaseFolder
}
New-Item -ItemType Directory -Path $releaseFolder -Force | Out-Null

# Copiar executavel e assets
Copy-Item -Force (Join-Path $baseDir "bin\ReleasePackage\Nota11.exe") (Join-Path $releaseFolder "Nota11.exe")
Copy-Item -Recurse -Force (Join-Path $baseDir "wwwroot") (Join-Path $releaseFolder "wwwroot")

# Criar LEIAME.txt
$leiame = @"
========================================================================
                      NOTA 11 - GAME TRACKER
                   Versao Desktop Windows v1.0
========================================================================

Bem-vindo ao Nota 11 Game Tracker para Windows!

COMO USAR:
1. Basta dar dois cliques no arquivo 'Nota11.exe'.
2. Nao e necessario instalar nada: o aplicativo ja e 100% autocontido
   e inclui o motor nativo e todas as bibliotecas.

RECURSOS PRINCIPAIS:
- Rastreamento completo de Jogos Zerados e Jogando Agora (Prateleiras).
- Estimativa automatica de tempo de jogo via HowLongToBeat (HLTB).
- Download e busca de capas oficiais em HD via IGDB.
- Metricas, Estatisticas, Graficos Anuais e Vitrine Nota 11.
- Gerador de imagens (PNG) para compartilhamento na Steam e redes sociais.
- Armazenamento automatico e seguro em %AppData%\Nota11\database.json.
- Importacao e Exportacao de planilhas CSV e backups JSON.

ATALHOS UTEIS:
- N: Adicionar novo jogo
- F11: Alternar tela cheia
- F5 ou Ctrl+R: Recarregar
- Ctrl+Shift+I ou F12: Abrir ferramentas de desenvolvedor

DESENVOLVIDO POR:
Rafael Lannes • Nota 11 (2026)
"@
Set-Content -Path (Join-Path $releaseFolder "LEIAME.txt") -Value $leiame -Encoding UTF8

# Compactar em ZIP portátil
Write-Host "Compactando pacote ZIP..." -ForegroundColor Cyan
if (Test-Path $zipPath) {
    Remove-Item -Force $zipPath
}
Compress-Archive -Path "$releaseFolder\*" -DestinationPath $zipPath -CompressionLevel Optimal

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host " [SUCESSO] Pacote de Release gerado com exito!" -ForegroundColor Green
Write-Host ""
Write-Host " Pasta descompactada:" -ForegroundColor White
Write-Host "   $releaseFolder" -ForegroundColor Gray
Write-Host ""
Write-Host " Arquivo ZIP pronto para compartilhar ($([math]::Round((Get-Item $zipPath).Length / 1MB, 1)) MB):" -ForegroundColor White
Write-Host "   $zipPath" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Green
