@echo off
title Nota 11 - Game Tracker (Servidor Local)
chcp 65001 > nul
cls

echo ==========================================================
echo        NOTA 11 - RASTREADOR DE JOGOS E MASTERPIECES
echo ==========================================================
echo.
echo  Iniciando servidor local nativo do Windows...
echo  O navegador sera aberto automaticamente.
echo.
echo  URLs de Acesso:
echo   - http://localhost:3000/
echo   - http://127.0.0.1:3000/
echo.
echo  Pressione Ctrl+C nesta janela quando desejar encerrar.
echo ==========================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ----------------------------------------------------------
    echo DICA: Se preferir abrir sem o servidor, voce tambem pode
    echo dar duplo clique diretamente no arquivo "index.html".
    echo ----------------------------------------------------------
    echo.
    pause
)

