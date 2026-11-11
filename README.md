# ⛏️ Minecraft × TikTok Live Studio (`v2.2.0` — App de Escritorio, Web GUI, Layout OBS 9:16 + RCON Nativo)

Estudio visual y aplicación de escritorio **100% gratuita** desarrollada en **Node.js (ES Modules)** y **Electron** para conectar cualquier directo de **TikTok Live** con un servidor dedicado de **Minecraft: Java Edition (1.20+ / 1.21+, Vanilla, Paper, Spigot, Purpur, Fabric o Forge)** mediante su protocolo **RCON nativo** (sin pagar suscripciones como TikFinity Pro ni planes de pago de EulerStream).

Permite iniciar y configurar tu servidor de Minecraft con un clic, activar `enable-rcon=true` y `eula=true` automáticamente, explorar visualmente las **criaturas (Mobs) de Minecraft 1.21+** y los **1,384+ Ítems de Minecraft con su ilustración oficial**, buscar entre **1,690+ Regalos de TikTok con su precio en monedas**, generar tu **Layout Vertical 9:16 para OBS (`1080×1920`)**, y mostrar alertas compactas en pantalla (`/title` + `subtitle` + `actionbar`) diseñadas a medida para el recorte vertical de TikTok Live.

---

## 🆕 Novedades de la Versión `v2.2.0`

- **🎨 Interfaz Minimalista Estilo Minecraft (100% Colores Sólidos, Cero Gradientes):** Rediseño visual con bordes pixelados tipo ranura de inventario de Minecraft, tipografía `Silkscreen` y barra de navegación centrada en una sola línea basada en iconos que despliega el título completo al pasar el cursor (*hover*).
- **📺 Alertas en Pantalla Ajustadas para TikTok Vertical (`/title` Compacto):** En lugar de saturar el chat con `say`, los regalos, nuevos seguidores y metas de likes aparecen centrados en la pantalla del juego usando `subtitle` + `actionbar` (50% más compactos que el título gigante tradicional) para que nunca se corten en los bordes de un directo vertical 9:16.
- **🖼️ Generador Integrado de Layout Vertical para OBS (`1080×1920`):** Incluye `public/obs-layout-vertical.png` (y el botón **🖼️ Descargar Layout OBS (9:16)** en el panel) con:
  - **Parte superior:** Tarjetas visuales para **➕ Nuevo Follow** (`1x Creeper`) y **❤️ Meta de 100 Likes** (`1x Tótem de la Inmortalidad`).
  - **Centro transparente (`996×1110`):** Recorte con canal alfa real para colocar tu captura de Minecraft detrás en OBS Studio o TikTok Live Studio.
  - **Parte inferior:** Tabla visual minimalista de regalos configurados (solo iconos del regalo, cantidad y render oficial del mob/ítem, sin texto innecesario).
- **❤️ Contador Real de Ráfagas de Likes y Conexión Automática en Vivo:**
  - Suma automáticamente el conteo completo de cada ráfaga de likes (`data.count`) enviada por los espectadores para disparar con precisión la **Meta de Likes** (por defecto cada 100 likes, sin necesidad de configurar metas dentro de TikTok).
  - La aplicación de escritorio y el panel web (`src/guiServer.js`) se conectan y reconectan automáticamente al Webcast en vivo de tu cuenta apenas detectan que estás en `LIVE`.

---

## 📦 Opción 1: Descargar el Ejecutable Listo para Usar (Recomendado)

No necesitas instalar Node.js ni escribir comandos en una terminal. Descarga la última versión directamente desde la sección **[Releases](../../releases)**:

| Plataforma | Archivo en Releases | Cómo abrirlo |
| :--- | :--- | :--- |
| 🪟 **Windows** | **`MinecraftTikTokLive-Windows-Portable.exe`** | Haz doble clic sobre el archivo `.exe` y se abrirá la ventana de la aplicación. |
| 🐧 **Linux** | **`MinecraftTikTokLive-Linux.AppImage`** | Dale permiso de ejecución (`chmod +x MinecraftTikTokLive-Linux.AppImage` o *Propiedades → Permitir ejecutar como un programa*) y haz doble clic. |

### 📋 ¿Qué necesitas para usar el Ejecutable?
1. **Java 21 o superior (JDK/JRE 21+):** Requerido por los servidores de Minecraft 1.20.5+ / 1.21+.
2. **Archivo de Servidor de Minecraft (`server.jar` o `paper.jar`):** Una carpeta en tu PC que contenga el `.jar` de tu servidor de Minecraft (descargable gratis desde [Minecraft.net](https://www.minecraft.net/es-es/download/server) o [PaperMC.io](https://papermc.io/downloads/paper)).

### 🚀 Pasos dentro de la Aplicación:
1. Abre la aplicación y entra a la pestaña **🏰 Servidor Minecraft (Control y Ajustes)**.
2. Haz clic en **📂 Elegir Carpeta...** y selecciona la carpeta donde tienes tu `server.jar` (o `paper-*.jar`).
3. Haz clic en **⚡ Habilitar RCON Nativo + Aceptar EULA (1 Clic)** o directamente en **▶️ Iniciar Servidor Minecraft**:
   - La aplicación aceptará automáticamente `eula=true` en `eula.txt` y activará `enable-rcon=true` en `server.properties` (puerto `25575`).
   - Desde la consola en vivo puedes darte permisos de administrador con el botón **👑 Dar OP a mi Jugador**.
4. En la barra superior derecha, escribe tu **👤 Jugador Minecraft** y tu **🎥 Usuario TikTok** y presiona **💾 Guardar Ajustes**.
5. Ve a **🎛️ Mis Reglas Configuradas** (o a los catálogos de **👾 Mobs**, **🗡️ Ítems** y **🎁 Regalos**) para elegir qué criatura aparecerá o qué ítem se entregará con cada regalo y pruébalo al instante con el botón **⚡ Probar en Minecraft**.
6. Haz clic en **🖼️ Descargar Layout OBS (9:16)** para obtener tu overlay vertical listo para OBS Studio o TikTok Live Studio.

> **Nota importante sobre los puertos:**
> - **Puerto para entrar a jugar desde tu cliente de Minecraft:** `127.0.0.1:25565`
> - **Puerto RCON interno (usado automáticamente por la app):** `127.0.0.1:25575`

---

## 💻 Opción 2: Ejecutar desde el Código Fuente (Desarrolladores / Terminal)

Si prefieres clonar el repositorio y correrlo o modificarlo desde el código fuente:

### 📋 Requisitos Previos
- **Node.js v20 o superior** (y `npm`).
- **Java 21+** para correr el servidor de Minecraft 1.21+.
- Servidor dedicado de Minecraft (`server.jar`, Paper, Spigot, Purpur, Fabric o Forge).
- *(Opcional)* **Python 3 + Pillow (`python3-pil`)** si deseas regenerar dinámicamente el archivo `public/obs-layout-vertical.png`.

### 🛠️ Instalación y Ejecución
1. **Clonar el repositorio e instalar dependencias:**
   ```bash
   git clone https://github.com/danielDEBIAN/minecraft-tiktok-rcon.git
   cd minecraft-tiktok-rcon
   npm install
   ```

2. **Configurar variables de entorno (opcional, también editable desde la interfaz gráfica):**
   ```bash
   cp .env.example .env
   ```

3. **Formas de iniciar el proyecto:**

   | Comando / Archivo | Descripción |
   | :--- | :--- |
   | **`npm run desktop`** | Abre la aplicación en su ventana nativa de escritorio con **Electron**. |
   | **`npm run app`** *(o `./launch-app.sh` / `Start-Windows.bat`)* | Levanta el servidor y abre la interfaz en modo ventana de aplicación dedicada. |
   | **`npm run gui`** | Inicia el servidor del panel visual web y listener de TikTok Live en **`http://localhost:3000`**. |
   | **`npm start`** | Conecta al directo de **TikTok Live** en consola y levanta simultáneamente el panel web en **`http://localhost:3000`**. |
   | **`npm run simulate`** | Abre un simulador interactivo en la terminal para probar regalos, follows y metas de likes sin estar en directo. |
   | **`npm run obs:layout`** | Regenera `public/obs-layout-vertical.png` (`1080×1920`) leyendo tus reglas de `config/gifts.json`. |

4. **Compilar tus propios ejecutables (`.AppImage` / `.exe`):**
   ```bash
   # Generar ejecutable .AppImage para Linux en dist/
   npm run dist:linux

   # Generar ejecutable .exe portable para Windows en dist/
   npm run dist:win
   ```

---

## 🖼️ Cómo Configurar el Layout Vertical 9:16 en OBS Studio

El proyecto incluye el overlay vertical **`public/obs-layout-vertical.png`** (`1080×1920` px) diseñado específicamente para directos verticales de TikTok:

1. En **OBS Studio**, ve a **Ajustes → Vídeo** y establece la **Resolución de base (lienzo)** y de **salida** en **`1080x1920`** (formato vertical 9:16).
2. En **Fuentes**, agrega una fuente **Imagen** (`obs-layout-vertical.png`) y colócala **arriba** en la lista de capas.
3. Debajo de la imagen, agrega tu **Captura de Juego** (Minecraft) y encájala en la ventana transparente central:
   - **Posición:** `X = 42`, `Y = 230`
   - **Tamaño:** `996 × 1110` px

---

## 📂 Estructura del Proyecto

```text
minecraft-tiktok-rcon/
├── .github/workflows/
│   └── release.yml                # GitHub Action que compila y publica .exe y .AppImage
├── config/
│   └── gifts.json                 # Mapeo recargable en caliente de regalos y eventos -> comandos Minecraft
├── public/                        # Interfaz Gráfica Minimalista Estilo Minecraft (Frontend)
│   ├── index.html                 # Panel de reglas, catálogos, gestor del servidor y documentación
│   ├── styles.css                 # Tema pixelado estilo Minecraft 100% colores sólidos (sin gradientes)
│   ├── app.js                     # Lógica del cliente web y comunicación con la API
│   ├── obs-layout-vertical.png    # Overlay 1080x1920 con ventana central transparente para OBS
│   ├── obs-layout-preview.png     # Vista previa del layout OBS
│   └── icon.svg / icon.png        # Icono de la aplicación
├── src/
│   ├── electronMain.js            # Proceso principal de la App de Escritorio (Electron)
│   ├── index.js                   # Conector CLI a TikTok Live + RCON + GUI
│   ├── guiServer.js               # Servidor HTTP local, API REST y receptor automático de TikTok Live
│   ├── minecraftServerManager.js  # Control de server.jar, consola, server.properties y eula.txt
│   ├── catalogService.js          # Obtención dinámica de Mobs e Ítems de Minecraft y Regalos de TikTok
│   ├── giftHandler.js             # Procesador de regalos, combos, ráfagas de likes y follows
│   ├── generateObsLayout.py       # Generador del overlay vertical 9:16 (1080x1920) para OBS
│   ├── rconClient.js              # Cliente RCON con reconexión automática y modo simulador
│   └── simulate.js                # Simulador interactivo por consola
├── launch-app.sh                  # Lanzador de 1 clic para Linux
├── Start-Windows.bat              # Lanzador de 1 clic para Windows
├── .env.example                   # Plantilla de variables de entorno
└── package.json
```

---

## 🎁 Referencia Rápida de Comandos en Minecraft (`config/gifts.json`)

| Acción | Sintaxis del Comando RCON | Ejemplo Real en Minecraft: Java Edition |
| :--- | :--- | :--- |
| **Alerta compacta en pantalla (Stream 9:16)** | `title @a subtitle` + `title @a actionbar` | `title @a times 10 70 20`<br>`title @a subtitle {"text":"{user} · {repeatCount}x {giftName}","color":"gold","bold":true}`<br>`title @a title {"text":""}`<br>`title @a actionbar {"text":"¡Cuidado con el Creeper, {player}!","color":"yellow","bold":true}` |
| **Spawnear Mob en tu posición** | `execute at {player} run summon minecraft:<mob> ~ ~ ~` | `execute at {player} run summon minecraft:creeper ~ ~ ~`<br>`execute at {player} run summon minecraft:zombie ~ ~ ~`<br>`execute at {player} run summon minecraft:warden ~ ~ ~` |
| **Dar objeto al jugador** | `give {player} minecraft:<item> <cantidad>` | `give {player} minecraft:diamond_sword 1`<br>`give {player} minecraft:golden_apple 3`<br>`give {player} minecraft:totem_of_undying 1` |

Variables dinámicas disponibles: `{player}` (usa `@p` si está vacío), `{user}`, `{giftName}`, `{repeatCount}`.

---

## 🚀 Cómo Crear y Publicar un Nuevo Release en GitHub

El repositorio cuenta con un flujo automatizado en [`.github/workflows/release.yml`](.github/workflows/release.yml) que compila automáticamente el instalador de **Windows (`MinecraftTikTokLive-Windows-Portable.exe`)** y **Linux (`MinecraftTikTokLive-Linux.AppImage`)** y los adjunta a una nueva versión en GitHub Releases.

### Opción A: Crear el Release automáticamente por Terminal (Con un Tag de Git)
Ejecuta estos comandos en la raíz del proyecto:

```bash
# 1. Guardar todos los cambios en la rama principal
git add .
git commit -m "Release v2.2.0: UI minimalista Minecraft, títulos compactos, layout OBS 9:16 y fix de likes"
git push origin main

# 2. Crear y subir el tag de la versión (esto dispara automáticamente GitHub Actions)
git tag v2.2.0
git push origin v2.2.0
```

### Opción B: Ejecutar el Release manualmente desde la web de GitHub
1. Sube tus cambios a `main` (`git add . && git commit -m "..." && git push origin main`).
2. Entra a tu repositorio en GitHub → pestaña **Actions**.
3. Selecciona el flujo **Build & Publish Release** en la barra izquierda.
4. Haz clic en **Run workflow**, escribe el tag (por ejemplo `v2.2.0`) y presiona el botón verde **Run workflow**.

---

## 🛠️ Ayuda y Solución de Problemas Frecuentes (FAQ)

### 1. Hago clic en "⚡ Probar en Minecraft" pero no aparece el Mob o Ítem en el juego
Verifica estos 3 puntos:
1. **Servidor encendido:** El panel superior izquierdo debe mostrar **🟢 Servidor de Minecraft y RCON Activos**. Si está apagado, presiona **▶️ Iniciar Servidor Minecraft**.
2. **Modo RCON Real activo:** El botón en la esquina superior derecha debe decir **🟢 RCON REAL ACTIVO** (si dice `🧪 SIMULADOR`, haz clic sobre él para pasar a modo Real).
3. **Jugador dentro de la partida:** Debes haber entrado al mundo desde tu cliente de Minecraft (`Multijugador → Conexión Directa → 127.0.0.1:25565`) y tu nombre en el campo **👤 Jugador Minecraft** debe coincidir con tu usuario en la partida (o estar vacío para usar `@p`).

### 2. ¿Tengo que configurar la Meta de Likes dentro de TikTok?
**No.** La aplicación cuenta internamente todas las ráfagas de likes (`data.count`) que llegan durante tu directo y ejecuta la recompensa automáticamente cada vez que el total acumulado cruza el múltiplo configurado (por defecto cada **100 Likes**).

### 3. El estado de TikTok Live dice "Usuario fuera de línea (No está en LIVE)"
Es normal cuando no estás transmitiendo en vivo en ese momento, ya que TikTok solo activa la sala Webcast durante una transmisión activa. En cuanto inicies tu directo, la aplicación se conectará sola sin que tengas que reiniciarla.

---

## 📜 Créditos, Fuentes de Datos y Material de Terceros (Atribuciones)

Esta aplicación utiliza datos públicos, librerías de código abierto y recursos visuales pertenecientes a sus respectivos autores y titulares:

### 1. Páginas Web y Fuentes de Catálogos
- **[PrismarineJS / `minecraft-data`](https://github.com/PrismarineJS/minecraft-data):** Base de datos comunitaria abierta para los nombres e identificadores técnicos (`entities.json` e `items.json`) de Minecraft: Java Edition 1.21.4.
- **[Minecraft Wiki (`minecraft.wiki`)](https://minecraft.wiki/) e [`InventivetalentDev/minecraft-assets`](https://github.com/InventivetalentDev/minecraft-assets):** Fuente de consulta para las ilustraciones de criaturas e iconos de inventario de Minecraft.
- **[StreamToEarn.io — TikTok Gifts](https://streamtoearn.io/gifts):** Fuente de consulta para el catálogo global de regalos de TikTok, costos en monedas e iconos de regalos regionales.
- **API Pública de TikTok Webcast:** Consulta en tiempo real del estado de transmisión (`LIVE`) y lista de regalos activos de la sala.

### 2. Propiedad Intelectual, Juegos y Marcas
- **Minecraft (`server.jar`, nombres, marcas e ilustraciones de Mobs e Ítems):** Son propiedad intelectual y marcas registradas de **Mojang Synergies AB / Microsoft Corporation**.
- **TikTok y Regalos de TikTok Live:** Son marcas registradas y propiedad intelectual de **ByteDance Ltd.**

### 3. Paquetes y Librerías Open Source (Node.js / Frontend)
- **[`tiktok-live-connector`](https://github.com/zerodytrash/TikTok-Live-Connector)** *(MIT License, por Zerody)* — Conexión a eventos de Webcast de TikTok Live en Node.js.
- **[`rcon-client`](https://github.com/janispritzkau/rcon-client)** *(MIT License)* — Cliente para el protocolo TCP Source RCON.
- **[`dotenv`](https://github.com/motdotla/dotenv)** *(BSD-2-Clause License)* — Carga de variables de entorno desde archivo `.env`.
- **[`electron`](https://www.electronjs.org/) y [`electron-builder`](https://www.electron.build/)** *(MIT License)* — Empaquetado multiplataforma de escritorio para Windows (`.exe`) y Linux (`.AppImage`).
- **[Google Fonts (`Silkscreen`, `Inter` y `JetBrains Mono`)](https://fonts.google.com/)** *(SIL Open Font License)* — Tipografías empleadas en la interfaz gráfica.

> **⚖️ Aviso Legal:** Este proyecto es una herramienta comunitaria independiente, 100% gratuita y sin fines de lucro. **No es un producto oficial de Minecraft ni está aprobado, afiliado, respaldado o asociado con Mojang Studios, Microsoft Corporation, TikTok, ByteDance Ltd., Minecraft Wiki ni StreamToEarn.io.**
