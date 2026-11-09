import 'dotenv/config';
import readline from 'node:readline';
import { MinecraftRconClient } from './rconClient.js';
import { GiftHandler } from './giftHandler.js';

const playerName = process.env.PLAYER_NAME || '';
const mockMode = process.argv.includes('--real')
  ? false
  : true;

const rconClient = new MinecraftRconClient({
  host: process.env.RCON_HOST || '127.0.0.1',
  port: Number(process.env.RCON_PORT) || 25575,
  password: process.env.RCON_PASSWORD || 'minecraft_rcon_local',
  mockMode,
});

const giftHandler = new GiftHandler(rconClient, playerName);

async function startSimulator() {
  console.log('============================================================');
  console.log('🧪 SIMULADOR INTERACTIVO: TIKTOK LIVE -> MINECRAFT RCON 🧪');
  console.log('============================================================');
  console.log(`👤 Jugador objetivo : ${playerName || '@p (Jugador más cercano)'}`);
  console.log(`🛠️  Estado RCON      : ${mockMode ? 'SIMULADO (Imprime en consola)' : 'REAL (Envía al servidor)'}`);
  console.log('------------------------------------------------------------');

  await rconClient.connect();

  const giftsList = Object.keys(giftHandler.config.gifts || {});
  console.log('\n📋 Comandos de prueba disponibles en esta consola:');
  console.log('  1  -> Simular regalo "Rose" (Spawnear Zombie)');
  console.log('  2  -> Simular regalo "GG" (Spawnear Creeper)');
  console.log('  3  -> Simular combo x3 de "GG" (Spawnear 3 Creepers)');
  console.log('  4  -> Simular regalo "Finger Heart" (Dar Espada de Diamante)');
  console.log('  5  -> Simular regalo "Doughnut" (2 Esqueletos + 1 Breeze)');
  console.log('  6  -> Simular regalo "Corgi" (Spawnear Jefe Warden)');
  console.log('  7  -> Simular Nuevo Seguidor (Follow)');
  console.log('  8  -> Simular 100 Likes (Meta de Likes -> Tótem de la Inmortalidad)');
  console.log(`  O escribe el nombre de cualquier regalo (${giftsList.join(', ')})`);
  console.log('  Escribe "salir" para terminar.\n');

  // Si se pasa --auto por línea de comandos, ejecuta una demostración automática y termina
  if (process.argv.includes('--auto')) {
    console.log('▶️ Ejecutando demostración automática de eventos...\n');
    await giftHandler.handleGift({
      nickname: 'GamerPro99',
      giftName: 'Rose',
      repeatCount: 1,
      diamondCount: 1,
      giftType: 1,
      repeatEnd: true,
    });
    await giftHandler.handleGift({
      nickname: 'CreeperTikTok',
      giftName: 'GG',
      repeatCount: 3,
      diamondCount: 1,
      giftType: 1,
      repeatEnd: true,
    });
    await giftHandler.handleGift({
      nickname: 'MinecraftFan',
      giftName: 'Doughnut',
      repeatCount: 1,
      diamondCount: 30,
      giftType: 0,
      repeatEnd: true,
    });
    await giftHandler.handleFollow({ nickname: 'NuevoSub_01' });
    await rconClient.disconnect();
    console.log('\n✅ Demostración completada.');
    process.exit(0);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '🎮 Simular evento > ',
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }

    if (input.toLowerCase() === 'salir' || input.toLowerCase() === 'exit') {
      await rconClient.disconnect();
      rl.close();
      process.exit(0);
    }

    switch (input) {
      case '1':
        await giftHandler.handleGift({
          nickname: 'TikTokUser_1',
          giftName: 'Rose',
          repeatCount: 1,
          diamondCount: 1,
          giftType: 1,
          repeatEnd: true,
        });
        break;
      case '2':
        await giftHandler.handleGift({
          nickname: 'TikTokUser_2',
          giftName: 'GG',
          repeatCount: 1,
          diamondCount: 1,
          giftType: 1,
          repeatEnd: true,
        });
        break;
      case '3':
        await giftHandler.handleGift({
          nickname: 'ComboKing',
          giftName: 'GG',
          repeatCount: 3,
          diamondCount: 1,
          giftType: 1,
          repeatEnd: true,
        });
        break;
      case '4':
        await giftHandler.handleGift({
          nickname: 'CrafterGirl',
          giftName: 'Finger Heart',
          repeatCount: 1,
          diamondCount: 5,
          giftType: 1,
          repeatEnd: true,
        });
        break;
      case '5':
        await giftHandler.handleGift({
          nickname: 'TrollMaster',
          giftName: 'Doughnut',
          repeatCount: 1,
          diamondCount: 30,
          giftType: 0,
          repeatEnd: true,
        });
        break;
      case '6':
        await giftHandler.handleGift({
          nickname: 'VIP_Donator',
          giftName: 'Corgi',
          repeatCount: 1,
          diamondCount: 299,
          giftType: 0,
          repeatEnd: true,
        });
        break;
      case '7':
        await giftHandler.handleFollow({ nickname: 'SeguidorNuevo' });
        break;
      case '8':
        await giftHandler.handleLike({ nickname: 'LikerFan', likeCount: 100 });
        break;
      default:
        await giftHandler.handleGift({
          nickname: 'Tester',
          giftName: input,
          repeatCount: 1,
          diamondCount: 1,
          giftType: 0,
          repeatEnd: true,
        });
        break;
    }

    console.log('');
    rl.prompt();
  });
}

startSimulator();
