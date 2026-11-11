import 'dotenv/config';
import dotenv from 'dotenv';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { TikTokLiveConnection, WebcastEvent, ControlEvent, RouteConfig } from 'tiktok-live-connector';
import { MinecraftRconClient } from './rconClient.js';
import { GiftHandler, getWritableConfigPath } from './giftHandler.js';
import { fetchMinecraftMobs, fetchMinecraftItems, fetchTikTokGifts } from './catalogService.js';
import { MinecraftServerManager } from './minecraftServerManager.js';

// Parche gratuito para consultar gift/list/ sin firma de pago de EulerStream
RouteConfig.fetchRoomGifts = async ({ webClient, roomId = webClient.roomId }) => {
  try {
    const res = await webClient.getJsonObjectFromWebcastApi(
      'gift/list/',
      { ...webClient.clientParams, room_id: roomId },
      false
    );
    return res?.data?.gifts || [];
  } catch {
    return [];
  }
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, '../public');
const CONFIG_PATH = getWritableConfigPath();

function getWritableEnvPath() {
  if (__dirname.includes('app.asar')) {
    const userDir = path.join(os.homedir(), '.config', 'minecraft-tiktok-rcon');
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
    const target = path.join(userDir, '.env');
    if (fs.existsSync(target)) {
      dotenv.config({ path: target, override: true });
    }
    return target;
  }
  return path.resolve(__dirname, '../.env');
}

const ENV_PATH = getWritableEnvPath();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

let tiktokStatusCache = {
  username: '',
  timestamp: 0,
  data: null,
};

/**
 * Verifica mediante socket TCP si el puerto RCON del servidor de Minecraft está escuchando
 */
function checkTcpPort(host, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const done = (ok) => {
      if (!settled) {
        settled = true;
        socket.destroy();
        resolve(ok);
      }
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, host);
  });
}

/**
 * Consulta si el usuario configurado en TIKTOK_USERNAME está actualmente en directo (LIVE)
 */
async function checkTikTokLiveStatus(rawUsername, force = false) {
  const username = String(rawUsername || '').trim().replace(/^@/, '');

  if (!username || username === 'tu_usuario_tiktok') {
    return {
      configured: false,
      username: '',
      isLive: false,
      status: 'unconfigured',
      title: 'Usuario de TikTok sin configurar',
      message: 'Escribe tu usuario de TikTok arriba y haz clic en Guardar Ajustes.',
    };
  }

  const now = Date.now();
  if (
    !force &&
    tiktokStatusCache.data &&
    tiktokStatusCache.username.toLowerCase() === username.toLowerCase() &&
    now - tiktokStatusCache.timestamp < 15000
  ) {
    return tiktokStatusCache.data;
  }

  try {
    const conn = new TikTokLiveConnection(username, { processInitialData: false });
    const isLive = await conn.fetchIsLive();
    const result = isLive
      ? {
          configured: true,
          username,
          isLive: true,
          roomId: conn.roomId || null,
          status: 'live',
          title: `¡@${username} está EN VIVO en TikTok!`,
          message: `Transmisión activa detectada (Room ID: ${conn.roomId || 'Activo'}). Lista para recibir regalos.`,
        }
      : {
          configured: true,
          username,
          isLive: false,
          status: 'offline',
          title: `@${username} NO está en directo ahora mismo`,
          message: `La cuenta @${username} está fuera de línea en TikTok Live. Aún puedes usar los botones "Probar en Minecraft" para testear tus mobs e ítems.`,
        };

    tiktokStatusCache = { username, timestamp: now, data: result };
    return result;
  } catch (err) {
    const result = {
      configured: true,
      username,
      isLive: false,
      status: 'error',
      title: `@${username} fuera de línea o no encontrado`,
      message: `No se detectó un directo activo para @${username} (${err.message || 'Sin transmisión activa'}).`,
    };
    tiktokStatusCache = { username, timestamp: now, data: result };
    return result;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 5 * 1024 * 1024) {
        reject(new Error('Payload demasiado grande'));
      }
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function updateEnvFile(updates) {
  let content = '';
  if (fs.existsSync(ENV_PATH)) {
    content = fs.readFileSync(ENV_PATH, 'utf-8');
  }
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${value}`);
    } else {
      content += `${content.endsWith('\n') || !content ? '' : '\n'}${key}=${value}\n`;
    }
    process.env[key] = String(value);
  }
  fs.writeFileSync(ENV_PATH, content, 'utf-8');
}

export async function startGuiServer(options = {}) {
  const port = Number(options.port || process.env.GUI_PORT || 3000);

  let rconClient = options.rconClient;
  if (!rconClient) {
    const mockMode = String(process.env.MOCK_RCON).toLowerCase() === 'true';
    rconClient = new MinecraftRconClient({
      host: process.env.RCON_HOST || '127.0.0.1',
      port: Number(process.env.RCON_PORT) || 25575,
      password: process.env.RCON_PASSWORD || 'minecraft_rcon_local',
      mockMode,
    });
    await rconClient.connect();
  }

  let giftHandler = options.giftHandler;
  if (!giftHandler) {
    giftHandler = new GiftHandler(rconClient, process.env.PLAYER_NAME || '');
  }

  const serverManager = new MinecraftServerManager();

  /**
   * Sincroniza la contraseña y puerto RCON desde server.properties del servidor de Minecraft si existe
   */
  function syncRconFromServerProperties() {
    try {
      const propsFile = path.join(serverManager.serverDir, 'server.properties');
      if (fs.existsSync(propsFile)) {
        const props = serverManager.readPropertiesFile(propsFile);
        if (props['rcon.password'] && props['rcon.password'].trim()) {
          rconClient.password = props['rcon.password'].trim();
        }
        if (props['rcon.port'] && Number(props['rcon.port'])) {
          rconClient.port = Number(props['rcon.port']);
        }
      }
    } catch {
      // Ignorar
    }
  }

  syncRconFromServerProperties();

  // Gestor automático de conexión en tiempo real con TikTok Live (Regalos, Follows y Likes)
  let activeTikTokConn = null;
  let activeTikTokUser = '';
  let isConnectingTikTok = false;

  async function ensureTikTokLiveListener(rawUsername) {
    if (options.disableTikTokListener) return;
    const username = String(rawUsername || process.env.TIKTOK_USERNAME || '')
      .trim()
      .replace(/^@/, '');

    if (!username || username === 'tu_usuario_tiktok') {
      if (activeTikTokConn) {
        try {
          activeTikTokConn.disconnect();
        } catch {
          // Ignorar
        }
        activeTikTokConn = null;
        activeTikTokUser = '';
      }
      return;
    }

    if (activeTikTokConn && activeTikTokUser.toLowerCase() === username.toLowerCase()) {
      return;
    }

    if (isConnectingTikTok) return;
    isConnectingTikTok = true;

    try {
      if (activeTikTokConn) {
        try {
          activeTikTokConn.disconnect();
        } catch {
          // Ignorar
        }
        activeTikTokConn = null;
        activeTikTokUser = '';
      }

      const conn = new TikTokLiveConnection(username, {
        processInitialData: false,
        enableExtendedGiftInfo: true,
      });

      const state = await conn.connect();
      activeTikTokConn = conn;
      activeTikTokUser = username;

      console.log(`✅ [TikTok Live] Escuchando eventos en vivo de @${username} (Room ID: ${state.roomId})`);
      serverManager.appendLog(`[TikTok Live] Conectado al directo de @${username} (Room ID: ${state.roomId})`);

      conn.on(WebcastEvent.GIFT, async (data) => {
        syncRconFromServerProperties();
        await giftHandler.handleGift(data);
      });

      conn.on(WebcastEvent.FOLLOW, async (data) => {
        syncRconFromServerProperties();
        await giftHandler.handleFollow(data);
      });

      conn.on(WebcastEvent.LIKE, async (data) => {
        syncRconFromServerProperties();
        await giftHandler.handleLike(data);
      });

      conn.on(ControlEvent.DISCONNECTED, () => {
        console.warn(`⚠️ [TikTok Live] Desconectado del directo de @${username}`);
        if (activeTikTokConn === conn) {
          activeTikTokConn = null;
          activeTikTokUser = '';
        }
      });

      conn.on(ControlEvent.ERROR, (err) => {
        console.error('❌ [TikTok Live Error]:', err?.info || err?.exception || err?.message || err);
      });
    } catch {
      // El usuario aún no está en vivo o cerró transmisión; se reintentará automáticamente
    } finally {
      isConnectingTikTok = false;
    }
  }

  ensureTikTokLiveListener(process.env.TIKTOK_USERNAME);

  /**
   * Evalúa en vivo el estado real del servidor RCON de Minecraft
   */
  async function evaluateRconStatus() {
    syncRconFromServerProperties();
    const host = rconClient.host || '127.0.0.1';
    const rconPort = rconClient.port || 25575;
    const portReachable = await checkTcpPort(host, rconPort, 1200);
    const procStatus = serverManager.getStatus();

    if (portReachable && rconClient.mockMode) {
      rconClient.mockMode = false;
      updateEnvFile({ MOCK_RCON: 'false' });
    }

    if (rconClient.mockMode) {
      return {
        mockMode: true,
        serverUp: portReachable,
        connected: false,
        host,
        port: rconPort,
        status: 'mock',
        title: 'Modo Simulador RCON Activo',
        message: portReachable
          ? `Tu servidor Minecraft (${host}:${rconPort}) SÍ está encendido, pero estás en Modo Simulador. Haz clic en el botón de Modo RCON arriba para conectarte al servidor real.`
          : `Simulando comandos en consola (El servidor de Minecraft en ${host}:${rconPort} está apagado).`,
      };
    }

    if (!portReachable) {
      rconClient.isConnected = false;
      if (procStatus.pid) {
        return {
          mockMode: false,
          serverUp: false,
          connected: false,
          host,
          port: rconPort,
          status: 'mock',
          title: '⏳ Servidor de Minecraft Iniciando...',
          message: `El proceso ${procStatus.jarName} está cargando el mundo (PID: ${procStatus.pid}). RCON se conectará automáticamente apenas termine de iniciar.`,
        };
      }
      return {
        mockMode: false,
        serverUp: false,
        connected: false,
        host,
        port: rconPort,
        status: 'offline',
        title: 'Servidor de Minecraft / RCON Apagado',
        message: `No hay respuesta en ${host}:${rconPort}. Puedes iniciarlo directamente haciendo clic en "▶️ Iniciar Servidor Minecraft".`,
      };
    }

    if (!rconClient.isConnected || !rconClient.rcon) {
      await rconClient.connect();
    }

    if (rconClient.isConnected) {
      const targetLabel = giftHandler.playerName || '@p (jugador activo en el mundo)';
      return {
        mockMode: false,
        serverUp: true,
        connected: true,
        host,
        port: rconPort,
        status: 'online',
        title: 'Servidor de Minecraft y RCON Activos',
        message: `Conectado exitosamente por RCON en ${host}:${rconPort}. Las acciones se aplicarán sobre ${targetLabel}.`,
      };
    }

    return {
      mockMode: false,
      serverUp: true,
      connected: false,
      host,
      port: rconPort,
      status: 'error',
      title: 'Error de autenticación RCON',
      message: `El puerto ${host}:${rconPort} está abierto pero rechazó la contraseña RCON. Verifica rcon.password en server.properties o RCON_PASSWORD en .env.`,
    };
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

      // 0. Verificar estado en tiempo real de RCON (Minecraft) y TikTok Live
      if (req.method === 'GET' && url.pathname === '/api/status') {
        const force = url.searchParams.get('force') === '1';
        const [rconStatus, tiktokStatus] = await Promise.all([
          evaluateRconStatus(),
          checkTikTokLiveStatus(process.env.TIKTOK_USERNAME, force),
        ]);
        if (tiktokStatus.isLive) {
          ensureTikTokLiveListener(process.env.TIKTOK_USERNAME);
        }
        return sendJson(res, 200, {
          ok: true,
          rcon: rconStatus,
          tiktok: tiktokStatus,
          serverProcess: serverManager.getStatus(),
        });
      }

      // 0.1 Iniciar el servidor dedicado de Minecraft desde la web
      if (req.method === 'POST' && url.pathname === '/api/minecraft/start') {
        const body = await readBody(req);
        if (rconClient.mockMode) {
          rconClient.mockMode = false;
          updateEnvFile({ MOCK_RCON: 'false' });
        }
        const result = serverManager.start(body);
        syncRconFromServerProperties();
        return sendJson(res, result.ok ? 200 : 400, {
          ...result,
          serverProcess: serverManager.getStatus(),
        });
      }

      // 0.2 Detener el servidor dedicado de Minecraft desde la web
      if (req.method === 'POST' && url.pathname === '/api/minecraft/stop') {
        await rconClient.disconnect();
        const result = await serverManager.stop();
        return sendJson(res, result.ok ? 200 : 400, {
          ...result,
          serverProcess: serverManager.getStatus(),
        });
      }

      // 0.3 Obtener logs de la consola del servidor de Minecraft
      if (req.method === 'GET' && url.pathname === '/api/minecraft/logs') {
        return sendJson(res, 200, {
          ok: true,
          serverProcess: serverManager.getStatus(),
          logs: serverManager.getLogs(),
        });
      }

      // 0.4 Enviar comando a la consola del servidor de Minecraft (vía stdin o RCON)
      if (req.method === 'POST' && url.pathname === '/api/minecraft/console') {
        const body = await readBody(req);
        const cmd = String(body.command || '').trim();
        if (!cmd) {
          return sendJson(res, 400, { ok: false, error: 'Escribe un comando para enviar' });
        }
        const directRes = serverManager.sendConsoleCommand(cmd);
        if (directRes.ok) {
          return sendJson(res, 200, directRes);
        }
        const rconOut = await rconClient.sendCommand(cmd);
        if (rconOut !== null) {
          serverManager.appendLog(`[RCON >] ${cmd}`);
          if (rconOut) serverManager.appendLog(`[RCON <] ${rconOut}`);
          return sendJson(res, 200, { ok: true, message: `Comando ejecutado vía RCON: ${cmd}`, response: rconOut });
        }
        return sendJson(res, 400, directRes);
      }

      // 0.5 Leer configuración del servidor Minecraft (server.properties + RAM)
      if (req.method === 'GET' && url.pathname === '/api/minecraft/config') {
        const data = serverManager.readServerConfigs();
        return sendJson(res, 200, {
          ok: true,
          ...data,
          serverProcess: serverManager.getStatus(),
        });
      }

      // 0.6 Guardar configuración del servidor Minecraft (server.properties + RAM)
      if (req.method === 'POST' && url.pathname === '/api/minecraft/config') {
        const body = await readBody(req);
        const updated = serverManager.saveServerConfigs(body);
        return sendJson(res, 200, {
          ok: true,
          ...updated,
          serverProcess: serverManager.getStatus(),
        });
      }

      // 0.7 Seleccionar o cambiar la carpeta del servidor de Minecraft
      if (req.method === 'POST' && url.pathname === '/api/minecraft/server-dir') {
        const body = await readBody(req);
        let result;
        if (body.pickDialog) {
          result = await serverManager.pickServerFolderDialog();
        } else {
          result = serverManager.setServerDir(body.serverDir);
        }
        if (result.ok) {
          updateEnvFile({ MINECRAFT_SERVER_DIR: result.serverDir });
          syncRconFromServerProperties();
          return sendJson(res, 200, {
            ...result,
            ...serverManager.readServerConfigs(),
            serverProcess: serverManager.getStatus(),
          });
        }
        return sendJson(res, result.cancelled ? 200 : 400, result);
      }

      // 0.8 Habilitar automáticamente RCON en server.properties y aceptar EULA en eula.txt (1 Clic)
      if (req.method === 'POST' && url.pathname === '/api/minecraft/install-rcon') {
        const result = serverManager.configureRconAndEula(rconClient.password);
        syncRconFromServerProperties();
        return sendJson(res, result.ok ? 200 : 400, {
          ...result,
          serverProcess: serverManager.getStatus(),
        });
      }

      // 1. Obtener catálogo dinámico de Mobs de Minecraft (1.21.4+)
      if (req.method === 'GET' && url.pathname === '/api/mobs') {
        const refresh = url.searchParams.get('refresh') === '1';
        const mobs = await fetchMinecraftMobs(refresh);
        return sendJson(res, 200, { ok: true, total: mobs.length, mobs });
      }

      // 1.5 Obtener catálogo dinámico de Ítems de Minecraft (1.21.4+)
      if (req.method === 'GET' && url.pathname === '/api/items') {
        const refresh = url.searchParams.get('refresh') === '1';
        const items = await fetchMinecraftItems(refresh);
        return sendJson(res, 200, { ok: true, total: items.length, items });
      }

      // 2. Obtener catálogo dinámico de Regalos de TikTok (streamtoearn.io + TikTok Webcast API)
      if (req.method === 'GET' && url.pathname === '/api/tiktok-gifts') {
        const refresh = url.searchParams.get('refresh') === '1';
        const gifts = await fetchTikTokGifts(refresh);
        return sendJson(res, 200, { ok: true, total: gifts.length, gifts });
      }

      // 3. Obtener configuración actual (gifts.json + .env)
      if (req.method === 'GET' && url.pathname === '/api/config') {
        const config = giftHandler.loadConfig();
        return sendJson(res, 200, {
          ok: true,
          config,
          env: {
            tiktokUsername: process.env.TIKTOK_USERNAME || '',
            playerName: giftHandler.playerName || process.env.PLAYER_NAME || '',
            rconHost: rconClient.host,
            rconPort: rconClient.port,
            mockMode: rconClient.mockMode,
            rconConnected: rconClient.isConnected,
          },
        });
      }

      // 4. Guardar configuración de regalos y eventos (gifts.json)
      if (req.method === 'POST' && url.pathname === '/api/config') {
        const body = await readBody(req);
        if (!body || typeof body.config !== 'object') {
          return sendJson(res, 400, { ok: false, error: 'Formato de configuración inválido' });
        }
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(body.config, null, 2) + '\n', 'utf-8');
        giftHandler.config = giftHandler.loadConfig();
        return sendJson(res, 200, { ok: true, config: giftHandler.config });
      }

      // 4.5 Generar y descargar el Layout Vertical 9:16 para OBS (1080x1920 PNG con recorte transparente)
      if (req.method === 'GET' && url.pathname === '/api/obs-layout') {
        const scriptPath = path.resolve(__dirname, './generateObsLayout.py');
        const outPng = path.join(PUBLIC_DIR, 'obs-layout-vertical.png');
        await new Promise((resolve) => {
          execFile('python3', [scriptPath], { timeout: 20000 }, () => resolve());
        });
        if (fs.existsSync(outPng)) {
          res.writeHead(200, {
            'Content-Type': 'image/png',
            'Content-Disposition': 'attachment; filename="obs-layout-vertical.png"',
          });
          return fs.createReadStream(outPng).pipe(res);
        }
        return sendJson(res, 500, { ok: false, error: 'No se pudo generar el layout OBS' });
      }

      // 5. Actualizar ajustes de jugador / TikTok / modo simulador (.env)
      if (req.method === 'POST' && url.pathname === '/api/env') {
        const body = await readBody(req);
        const updates = {};
        if (typeof body.playerName === 'string') {
          updates.PLAYER_NAME = body.playerName.trim();
          giftHandler.playerName = updates.PLAYER_NAME;
        }
        if (typeof body.tiktokUsername === 'string') {
          updates.TIKTOK_USERNAME = body.tiktokUsername.trim().replace(/^@/, '');
          tiktokStatusCache.timestamp = 0;
        }
        if (typeof body.mockMode === 'boolean') {
          updates.MOCK_RCON = String(body.mockMode);
          rconClient.mockMode = body.mockMode;
          await rconClient.connect();
        }
        updateEnvFile(updates);
        if (typeof body.tiktokUsername === 'string') {
          ensureTikTokLiveListener(updates.TIKTOK_USERNAME);
        }
        return sendJson(res, 200, {
          ok: true,
          env: {
            tiktokUsername: process.env.TIKTOK_USERNAME || '',
            playerName: giftHandler.playerName || '',
            mockMode: rconClient.mockMode,
            rconConnected: rconClient.isConnected,
          },
        });
      }

      // 6. Probar regalo, evento, mob o ítem directamente en Minecraft
      if (req.method === 'POST' && url.pathname === '/api/test') {
        const body = await readBody(req);
        const type = body.type;
        const targetPlayer = giftHandler.playerName || '@p';
        const playerLabel = giftHandler.playerName || 'tu jugador activo (@p)';

        syncRconFromServerProperties();
        const portReachable = await checkTcpPort(rconClient.host || '127.0.0.1', rconClient.port || 25575, 1200);

        if (portReachable && rconClient.mockMode) {
          rconClient.mockMode = false;
          updateEnvFile({ MOCK_RCON: 'false' });
        }

        if (!portReachable && !rconClient.mockMode) {
          return sendJson(res, 400, {
            ok: false,
            error:
              '⚠️ Tu servidor de Minecraft está apagado (127.0.0.1:25575 no responde). Inícialo primero con el botón "▶️ Iniciar Servidor Minecraft".',
          });
        }

        const checkMcRconResponse = (responses = []) => {
          const text = responses.filter(Boolean).join(' | ');
          if (
            text.includes('No player was found') ||
            text.includes('No entity was found') ||
            text.includes('That player does not exist')
          ) {
            return {
              ok: false,
              error: `⚠️ El servidor está activo, pero ${playerLabel} aún no ha entrado al mundo en Minecraft (127.0.0.1:25565). Entra a la partida para ejecutar la acción.`,
            };
          }
          return null;
        };

        if (type === 'gift') {
          const result = await giftHandler.handleGift({
            user: { nickname: body.user || 'TesterGUI' },
            giftName: body.giftName || 'Rose',
            repeatCount: Number(body.repeatCount) || 1,
            diamondCount: Number(body.coins) || 1,
            giftType: 1,
            repeatEnd: true,
          });
          const warn = checkMcRconResponse(result?.responses);
          if (warn) return sendJson(res, 400, warn);
          if (!result?.executed) {
            return sendJson(res, 400, {
              ok: false,
              error: '❌ No se pudo enviar el comando por RCON al servidor de Minecraft.',
            });
          }
          return sendJson(res, 200, {
            ok: true,
            message: rconClient.mockMode
              ? `🧪 [Simulador] Regalo "${body.giftName}" simulado en consola`
              : `✅ Regalo "${body.giftName}" ejecutado en Minecraft para ${playerLabel}`,
          });
        }

        if (type === 'follow') {
          const result = await giftHandler.handleFollow({
            user: { nickname: body.user || 'SeguidorGUI' },
          });
          const warn = checkMcRconResponse(result?.responses);
          if (warn) return sendJson(res, 400, warn);
          return sendJson(res, 200, {
            ok: true,
            message: '✅ Evento de Nuevo Seguidor (Follow) ejecutado en Minecraft',
          });
        }

        if (type === 'like') {
          const step = Number(giftHandler.loadConfig().specialEvents?.likeMilestone?.everyLikes) || 100;
          const result = await giftHandler.handleLike({
            user: { nickname: body.user || 'FanGUI' },
            likeCount: step,
          });
          const warn = checkMcRconResponse(result?.responses);
          if (warn) return sendJson(res, 400, warn);
          return sendJson(res, 200, {
            ok: true,
            message: `✅ Meta de Likes (+${step}) ejecutada en Minecraft`,
          });
        }

        if (type === 'mob') {
          let roleId = String(body.roleId || 'minecraft:zombie').replace(/[;"\\]/g, '').trim();
          if (!roleId.includes(':')) roleId = `minecraft:${roleId}`;
          const count = Math.min(Math.max(Number(body.count) || 1, 1), 20);
          const responses = [];
          for (let i = 0; i < count; i++) {
            const out = await rconClient.sendCommand(`execute at ${targetPlayer} run summon ${roleId} ~ ~ ~`);
            responses.push(out);
          }
          const warn = checkMcRconResponse(responses);
          if (warn) return sendJson(res, 400, warn);
          if (!responses.some((r) => r !== null)) {
            return sendJson(res, 400, {
              ok: false,
              error: '❌ No se pudo enviar el comando por RCON al servidor de Minecraft.',
            });
          }
          return sendJson(res, 200, {
            ok: true,
            message: `✅ Spawneado ${count}x ${roleId} en la posición de ${playerLabel}`,
          });
        }

        if (type === 'item') {
          let itemId = String(body.itemId || 'minecraft:diamond_sword').replace(/[;"\\]/g, '').trim();
          if (!itemId.includes(':')) itemId = `minecraft:${itemId}`;
          const count = Math.min(Math.max(Number(body.count) || 1, 1), 64);
          const cmd = `give ${targetPlayer} ${itemId} ${count}`;
          const out = await rconClient.sendCommand(cmd);
          const warn = checkMcRconResponse([out]);
          if (warn) return sendJson(res, 400, warn);
          if (out === null) {
            return sendJson(res, 400, {
              ok: false,
              error: '❌ No se pudo enviar el comando por RCON al servidor de Minecraft.',
            });
          }
          return sendJson(res, 200, {
            ok: true,
            message: `✅ Entregado ${count}x ${itemId} al inventario de ${playerLabel}`,
          });
        }

        if (type === 'command') {
          const rawCmd = String(body.command || '');
          const formatted = giftHandler.formatCommand(rawCmd, {
            user: body.user || 'TesterGUI',
            giftName: body.giftName || 'Test',
            repeatCount: 1,
          });
          const out = await rconClient.sendCommand(formatted);
          const warn = checkMcRconResponse([out]);
          if (warn) return sendJson(res, 400, warn);
          return sendJson(res, 200, {
            ok: true,
            message: `✅ Comando ejecutado: ${formatted}`,
          });
        }

        return sendJson(res, 400, { ok: false, error: 'Tipo de prueba no reconocido' });
      }

      // Archivos estáticos del Frontend
      let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
      const resolvedPath = path.resolve(PUBLIC_DIR, `.${filePath}`);
      if (!resolvedPath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403);
        return res.end('Forbidden');
      }

      if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()) {
        const ext = path.extname(resolvedPath);
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
        return fs.createReadStream(resolvedPath).pipe(res);
      }

      res.writeHead(404);
      res.end('Not Found');
    } catch (err) {
      console.error('❌ Error en GUI Server:', err.message);
      sendJson(res, 500, { ok: false, error: err.message });
    }
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      console.log(`🌐 Interfaz Gráfica (Dashboard Web) activa en: http://localhost:${port}`);
      resolve(server);
    });
  });
}

// Si se ejecuta directamente con `node src/guiServer.js` (`npm run gui`)
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  startGuiServer();
}

