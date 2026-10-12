@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Nota 11 - Gerar Pacote de Release

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0gerar_release.ps1"

pause
