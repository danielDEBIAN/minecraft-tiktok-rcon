import 'dotenv/config';
import { TikTokLiveConnection, WebcastEvent, ControlEvent, RouteConfig } from 'tiktok-live-connector';
import { MinecraftRconClient } from './rconClient.js';
import { GiftHandler } from './giftHandler.js';
import { startGuiServer } from './guiServer.js';

// Parche 100% gratuito: En tiktok-live-connector v2, fetchRoomGifts intenta firmar la petición
// usando fetchWebcastSignatureFromEulerRoute (que requiere plan Business de pago en EulerStream).
// Consultando gift/list/ directamente sin firma de pago (signRequest = false), TikTok devuelve
// la lista completa de regalos gratis, evitando el error de EulerStream.
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

const tiktokUsername = process.env.TIKTOK_USERNAME || '';
const playerName = process.env.PLAYER_NAME || '';
const mockMode = String(process.env.MOCK_RCON).toLowerCase() === 'true';

const rconClient = new MinecraftRconClient({
  host: process.env.RCON_HOST || '127.0.0.1',
  port: Number(process.env.RCON_PORT) || 25575,
  password: process.env.RCON_PASSWORD || 'minecraft_rcon_local',
  mockMode,
});

const giftHandler = new GiftHandler(rconClient, playerName);

async function main() {
  console.log('======================================================');
  console.log('⛏️  MINECRAFT x TIKTOK LIVE (RCON BRIDGE - 100% FREE) ⛏️');
  console.log('======================================================');
  console.log(`👤 Jugador en Minecraft : ${playerName || '(@p - Jugador más cercano en el mundo)'}`);
  console.log(`🎥 Usuario TikTok       : ${tiktokUsername ? `@${tiktokUsername}` : '(Sin configurar)'}`);
  console.log(`🛠️  Modo RCON            : ${mockMode ? 'SIMULADOR (Sin servidor)' : 'CONEXIÓN REAL'}`);
  console.log('------------------------------------------------------\n');

  await rconClient.connect();
  await startGuiServer({ rconClient, giftHandler });

  if (!tiktokUsername || tiktokUsername === 'tu_usuario_tiktok') {
    console.warn('⚠️ Aún no has configurado tu TIKTOK_USERNAME en el archivo .env o en el panel web.');
    console.log('👉 Para probar tus regalos y comandos ahora mismo sin estar en vivo, ejecuta:');
    console.log('   npm run simulate\n');
    return;
  }

  const tiktokConnection = new TikTokLiveConnection(tiktokUsername, {
    processInitialData: false,
    enableExtendedGiftInfo: true,
  });

  try {
    const state = await tiktokConnection.connect();
    console.log(`✅ ¡Conectado al directo de @${tiktokUsername} (Room ID: ${state.roomId})!`);
    console.log('📡 Esperando regalos, likes y seguidores en tiempo real...\n');
  } catch (err) {
    console.error(`❌ No se pudo conectar al Live de @${tiktokUsername}:`, err.message || err);
    console.log('💡 Asegúrate de que la cuenta esté en directo (LIVE) en este momento.');
    console.log('💡 Si solo quieres probar tus comandos sin estar en directo, usa el panel web o: npm run simulate');
    return;
  }

  // Escuchar regalos
  tiktokConnection.on(WebcastEvent.GIFT, async (data) => {
    await giftHandler.handleGift(data);
  });

  // Escuchar nuevos seguidores
  tiktokConnection.on(WebcastEvent.FOLLOW, async (data) => {
    await giftHandler.handleFollow(data);
  });

  // Escuchar likes
  tiktokConnection.on(WebcastEvent.LIKE, async (data) => {
    await giftHandler.handleLike(data);
  });

  tiktokConnection.on(ControlEvent.DISCONNECTED, () => {
    console.warn('⚠️ Desconectado de TikTok Live.');
  });

  tiktokConnection.on(ControlEvent.ERROR, (err) => {
    console.error('❌ Error en TikTok Live:', err.info || err.exception || err.message || err);
  });
}

main();

