@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Nota 11 - Executar Aplicativo Windows
color 0b

if exist "Release\Nota 11 - Windows v1.0\Nota11.exe" (
    start "" "Release\Nota 11 - Windows v1.0\Nota11.exe"
    exit
)

if exist "bin\ReleasePackage\Nota11.exe" (
    start "" "bin\ReleasePackage\Nota11.exe"
    exit
)

if exist "bin\Release\net9.0-windows\Nota11.exe" (
    start "" "bin\Release\net9.0-windows\Nota11.exe"
    exit
)

if exist "bin\Debug\net9.0-windows\Nota11.exe" (
    start "" "bin\Debug\net9.0-windows\Nota11.exe"
    exit
)

echo Sincronizando interface e iniciando aplicativo (.NET 9)...
if not exist "wwwroot" mkdir "wwwroot"
copy /Y "index.html" "wwwroot\index.html" >nul
xcopy /E /I /Y "css" "wwwroot\css\" >nul
xcopy /E /I /Y "js" "wwwroot\js\" >nul
xcopy /E /I /Y "vendor" "wwwroot\vendor\" >nul

dotnet run -c Release
