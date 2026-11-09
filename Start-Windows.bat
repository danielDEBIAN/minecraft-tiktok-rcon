@echo off
title Minecraft x TikTok Live — RCON Studio
cd /d "%~dp0"

if not exist "node_modules" (
  echo Instalando dependencias por primera vez...
  call npm install
)

start "MinecraftTikTokServer" /min cmd /c "node src/index.js"
timeout /t 2 /nobreak >nul

:: Abrir en modo ventana de aplicacion (Web App sin barra de direcciones)
where msedge >nul 2>nul
if %errorlevel%==0 (
  start "" msedge --app=http://localhost:3000
  exit /b
)

where chrome >nul 2>nul
if %errorlevel%==0 (
  start "" chrome --app=http://localhost:3000
  exit /b
)

start http://localhost:3000

