@echo off
title LiteMail - Low-Bandwidth Text Email Client
echo ========================================================
echo   LiteMail - Ultra-Lightweight Text-Only Email Client
echo   Designed for Remote Operations & Low Bandwidth
echo ========================================================
echo.
echo Launching LiteMail in your default browser...
start "" "%~dp0index.html"
echo.
echo Done! LiteMail is running.
timeout /t 3 >nul
exit
