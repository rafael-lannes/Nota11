@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Nota 11 - Compilar Aplicativo Windows (.NET 9)
color 0b

echo ==========================================================
echo        NOTA 11 - COMPILAÇÃO WINDOWS (.NET 9 + WPF)
echo ==========================================================
echo.
echo Sincronizando arquivos de interface web...
if not exist "wwwroot" mkdir "wwwroot"
copy /Y "index.html" "wwwroot\index.html" >nul
xcopy /E /I /Y "css" "wwwroot\css\" >nul
xcopy /E /I /Y "js" "wwwroot\js\" >nul
xcopy /E /I /Y "vendor" "wwwroot\vendor\" >nul

echo Compilando projeto em modo Release...
echo.

dotnet build -c Release
if %ERRORLEVEL% NEQ 0 (
    color 0c
    echo.
    echo [ERRO] Falha na compilação do projeto.
    pause
    exit /b 1
)

echo Copiando arquivos de interface para bin\Release\net9.0-windows\wwwroot...
if not exist "bin\Release\net9.0-windows\wwwroot" mkdir "bin\Release\net9.0-windows\wwwroot"
xcopy /E /I /Y "wwwroot\*" "bin\Release\net9.0-windows\wwwroot\" >nul

color 0a
echo.
echo ==========================================================
echo  [SUCESSO] Compilação concluída com êxito!
echo  Executável gerado em:
echo  bin\Release\net9.0-windows\Nota11.exe
echo ==========================================================
echo.
pause
