#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

export PATH="/home/linuxbrew/.linuxbrew/bin:/usr/local/bin:$PATH"

PORT="${GUI_PORT:-3000}"
URL="http://localhost:${PORT}"

# Si ya está corriendo en el puerto, solo abrir la ventana de la App
if ! fuser "${PORT}/tcp" >/dev/null 2>&1; then
  node src/index.js &
  SERVER_PID=$!
  trap 'kill $SERVER_PID 2>/dev/null || true' EXIT

  # Esperar a que el servidor web responda
  for _ in {1..30}; do
    if curl -s "$URL/api/config" >/dev/null 2>&1; then
      break
    fi
    sleep 0.25
  done
fi

# Si Electron está instalado, usarlo; de lo contrario abrir en modo Web App nativa (--app)
if [ -x "./node_modules/.bin/electron" ]; then
  if [ -n "${SERVER_PID:-}" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
    trap - EXIT
  fi
  exec ./node_modules/.bin/electron src/electronMain.js
fi

# Buscar navegador compatible con modo ventana de aplicación (--app)
for BROWSER in google-chrome google-chrome-stable brave-browser chromium chromium-browser microsoft-edge flatpak; do
  if command -v "$BROWSER" >/dev/null 2>&1; then
    if [ "$BROWSER" = "flatpak" ]; then
      if flatpak info com.brave.Browser >/dev/null 2>&1; then
        flatpak run com.brave.Browser --app="$URL"
        exit 0
      elif flatpak info com.google.Chrome >/dev/null 2>&1; then
        flatpak run com.google.Chrome --app="$URL"
        exit 0
      fi
    else
      "$BROWSER" --app="$URL"
      exit 0
    fi
  fi
done

# Fallback al navegador predeterminado del sistema
xdg-open "$URL" >/dev/null 2>&1 || true

if [ -n "${SERVER_PID:-}" ]; then
  wait "$SERVER_PID"
fi

