import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BUNDLED_CONFIG_PATH = path.resolve(__dirname, '../config/gifts.json');

export function getWritableConfigPath() {
  if (__dirname.includes('app.asar')) {
    const userDir = path.join(os.homedir(), '.config', 'minecraft-tiktok-rcon');
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
    const target = path.join(userDir, 'gifts.json');
    if (!fs.existsSync(target) && fs.existsSync(BUNDLED_CONFIG_PATH)) {
      fs.copyFileSync(BUNDLED_CONFIG_PATH, target);
    }
    return target;
  }
  return BUNDLED_CONFIG_PATH;
}

const CONFIG_PATH = getWritableConfigPath();

export class GiftHandler {
  /**
   * @param {import('./rconClient.js').MinecraftRconClient} rconClient
   * @param {string} playerName
   */
  constructor(rconClient, playerName) {
    this.rconClient = rconClient;
    this.playerName = playerName || '';
    this.totalLikes = 0;
    this.lastLikeMilestone = 0;
    this.config = this.loadConfig();
  }

  loadConfig() {
    try {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
      return JSON.parse(raw);
    } catch (error) {
      console.error('❌ Error al leer config/gifts.json:', error.message);
      return { gifts: {}, specialEvents: {}, defaultGift: { enabled: false, commands: [] } };
    }
  }

  /**
   * Reemplaza las variables dinámicas {player}, {user}, {giftName}, {repeatCount}
   */
  formatCommand(template, context) {
    const targetPlayer = this.playerName || '@p';
    return template
      .replaceAll('{player}', targetPlayer)
      .replaceAll('{user}', this.sanitizeText(context.user || 'Anonimo'))
      .replaceAll('{giftName}', this.sanitizeText(context.giftName || 'Regalo'))
      .replaceAll('{repeatCount}', String(context.repeatCount || 1));
  }

  /**
   * Limpia caracteres especiales para evitar inyección de comandos en RCON
   */
  sanitizeText(text) {
    return String(text).replace(/[;"\\]/g, '').trim();
  }

  /**
   * Encuentra la configuración de un regalo (sin importar mayúsculas/minúsculas)
   */
  findGiftRule(giftName) {
    const gifts = this.config.gifts || {};
    if (gifts[giftName]) return gifts[giftName];

    const lower = String(giftName).toLowerCase();
    for (const [key, rule] of Object.entries(gifts)) {
      if (key.toLowerCase() === lower) {
        return rule;
      }
    }
    return null;
  }

  /**
   * Procesa un evento de regalo de TikTok Live
   * @param {Object} data Datos del evento 'gift'
   */
  async handleGift(data) {
    const giftType = data.giftDetails?.giftType ?? data.giftType;
    // En TikTok, los regalos tipo combo (giftType === 1) envían varios eventos mientras
    // el usuario mantiene presionado el botón, y al terminar envían repeatEnd = true.
    // Solo ejecutamos cuando el combo termina (o si no es un regalo de combo) para no duplicar.
    if (giftType === 1 && !data.repeatEnd) {
      return;
    }

    const user = data.user?.nickname || data.user?.uniqueId || data.nickname || data.uniqueId || 'Usuario';
    const giftName =
      data.giftDetails?.giftName || data.extendedGiftInfo?.name || data.giftName || `Gift#${data.giftId}`;
    const repeatCount = Number(data.repeatCount) || 1;
    const diamondCount =
      Number(data.giftDetails?.diamondCount ?? data.extendedGiftInfo?.diamondCount ?? data.diamondCount) || 1;

    console.log(
      `\n🎁 [REGALO TIKTOK] ${user} envió ${repeatCount}x "${giftName}" (${diamondCount * repeatCount} monedas)`
    );

    // Recargar gifts.json en caliente por si el usuario editó sus comandos mientras juega
    this.config = this.loadConfig();

    let rule = this.findGiftRule(giftName);
    if (!rule) {
      if (this.config.defaultGift?.enabled) {
        console.log(`   ℹ️ Regalo "${giftName}" no listado en gifts.json; usando acción por defecto.`);
        rule = this.config.defaultGift;
      } else {
        console.log(`   ⏭️ Regalo "${giftName}" sin acción asignada en config/gifts.json.`);
        return;
      }
    }

    const context = { user, giftName, repeatCount };
    const iterations = rule.scaleWithCombo ? Math.min(repeatCount, 20) : 1;
    const responses = [];

    for (let i = 0; i < iterations; i++) {
      for (const cmdTemplate of rule.commands || []) {
        // Evitar repetir el mensaje 'say' 10 veces en un combo; solo se anuncia en la primera iteración
        if (i > 0 && cmdTemplate.trim().toLowerCase().startsWith('say ')) {
          continue;
        }
        const finalCommand = this.formatCommand(cmdTemplate, context);
        const res = await this.rconClient.sendCommand(finalCommand);
        responses.push(res);
      }
    }
    return { executed: responses.some((r) => r !== null), responses };
  }

  /**
   * Procesa el evento de nuevo seguidor en TikTok
   */
  async handleFollow(data) {
    this.config = this.loadConfig();
    const followConfig = this.config.specialEvents?.follow;
    if (!followConfig?.enabled) return { executed: false, responses: [] };

    const user = data.user?.nickname || data.user?.uniqueId || data.nickname || data.uniqueId || 'NuevoSeguidor';
    console.log(`\n➕ [NUEVO FOLLOW] ¡${user} comenzó a seguirte!`);

    const responses = [];
    for (const cmdTemplate of followConfig.commands || []) {
      const cmd = this.formatCommand(cmdTemplate, { user, giftName: 'Follow', repeatCount: 1 });
      const res = await this.rconClient.sendCommand(cmd);
      responses.push(res);
    }
    return { executed: responses.some((r) => r !== null), responses };
  }

  /**
   * Procesa los likes acumulados en el directo
   */
  async handleLike(data) {
    this.config = this.loadConfig();
    const likeConfig = this.config.specialEvents?.likeMilestone;
    if (!likeConfig?.enabled) return { executed: false, responses: [] };

    const likeCount = Number(data.likeCount) || 1;
    const user = data.user?.nickname || data.user?.uniqueId || data.nickname || data.uniqueId || 'Usuario';
    this.totalLikes += likeCount;

    const step = Number(likeConfig.everyLikes) || 100;
    const currentMilestone = Math.floor(this.totalLikes / step);

    if (currentMilestone > this.lastLikeMilestone) {
      this.lastLikeMilestone = currentMilestone;
      console.log(`\n❤️ [META DE LIKES] ¡Se alcanzaron ${currentMilestone * step} likes acumulados! (Último: ${user})`);

      const responses = [];
      for (const cmdTemplate of likeConfig.commands || []) {
        const cmd = this.formatCommand(cmdTemplate, { user, giftName: 'Likes', repeatCount: step });
        const res = await this.rconClient.sendCommand(cmd);
        responses.push(res);
      }
      return { executed: responses.some((r) => r !== null), responses };
    }
    return { executed: false, responses: [] };
  }
}

