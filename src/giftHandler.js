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
   * Extrae el texto de un comando de anuncio ('title ...' o 'say ...')
   * @param {string} cmdTemplate
   * @returns {string|null}
   */
  extractAnnouncementTemplate(cmdTemplate) {
    const trimmed = String(cmdTemplate || '').trim();
    if (!trimmed) return null;

    if (trimmed.toLowerCase().startsWith('say ')) {
      return trimmed.slice(4).trim();
    }

    const titleMatch = trimmed.match(/^title\s+\S+\s+(?:title|subtitle)\s+(.+)$/i);
    if (titleMatch) {
      const payload = titleMatch[1].trim();
      if (payload.startsWith('{') || payload.startsWith('"')) {
        try {
          const parsed = JSON.parse(payload);
          if (typeof parsed === 'string') return parsed || null;
          if (parsed && typeof parsed.text === 'string') return parsed.text || null;
        } catch {
          // Si contiene llaves de plantilla o formato manual, extraer el campo text con regex
          const textField = payload.match(/"text"\s*:\s*"([^"]*)"/);
          if (textField) return textField[1] || null;
        }
      }
      const cleanPayload = payload.replace(/^["']|["']$/g, '');
      return cleanPayload || null;
    }

    return null;
  }

  /**
   * Divide un mensaje en Título principal y Subtítulo para que luzca limpio y completo en el stream
   * @param {string} rawMessage
   * @returns {{ title: string, subtitle: string }}
   */
  splitTitleAndSubtitle(rawMessage) {
    const clean = String(rawMessage || '')
      .replace(/^\[tiktok\]\s*/i, '')
      .trim();

    if (!clean) {
      return { title: '', subtitle: '' };
    }

    // Soportar separador explícito "Título | Subtítulo"
    if (clean.includes('|')) {
      const [first, ...rest] = clean.split('|');
      return {
        title: first.trim(),
        subtitle: rest.join('|').trim(),
      };
    }

    // Separar por oraciones (!, ., ?)
    const sentences = clean
      .split(/(?<=[!.?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (sentences.length >= 2) {
      return {
        title: sentences[0],
        subtitle: sentences.slice(1).join(' '),
      };
    }

    // Si es una sola oración (> 24 caracteres), dividirla para que quepa en el recorte vertical 9:16
    if (clean.length > 24) {
      const mid = Math.floor(clean.length / 2);
      const splitIdx = clean.lastIndexOf(' ', mid + 6);
      if (splitIdx > 6) {
        return {
          title: clean.slice(0, splitIdx).trim(),
          subtitle: clean.slice(splitIdx + 1).trim(),
        };
      }
    }

    return { title: clean, subtitle: '' };
  }

  /**
   * Envía un Título compacto (usando subtitle a escala 2x + actionbar a escala 1x)
   * para que quepa perfectamente dentro del recorte vertical 9:16 de TikTok en OBS
   * @param {string} rawTemplate
   * @param {Object} context
   */
  async sendTitleAnnouncement(rawTemplate, context) {
    const formatted = this.formatCommand(rawTemplate, context);
    const { title, subtitle } = this.splitTitleAndSubtitle(formatted);
    if (!title) return [];

    const timesCmd = 'title @a times 10 70 20';
    const compactTitleJson = JSON.stringify({
      text: title,
      color: 'gold',
      bold: true,
    });

    const r1 = await this.rconClient.sendCommand(timesCmd);
    const r2 = await this.rconClient.sendCommand(`title @a subtitle ${compactTitleJson}`);
    const r3 = await this.rconClient.sendCommand('title @a title {"text":""}');
    const responses = [r1, r2, r3];

    if (subtitle) {
      const actionbarJson = JSON.stringify({
        text: subtitle,
        color: 'yellow',
        bold: true,
      });
      const r4 = await this.rconClient.sendCommand(`title @a actionbar ${actionbarJson}`);
      responses.push(r4);
    }

    return responses;
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
        const trimmed = cmdTemplate.trim();
        if (!trimmed) continue;

        const announcementTemplate = this.extractAnnouncementTemplate(trimmed);
        if (announcementTemplate !== null) {
          // Evitar repetir el título 10 veces en un combo; solo se muestra en la primera iteración
          if (i === 0) {
            const titleResponses = await this.sendTitleAnnouncement(announcementTemplate, context);
            responses.push(...titleResponses);
          }
          continue;
        }

        // Ignorar subcomandos 'title ... subtitle/times' sueltos en iteraciones > 0
        if (i > 0 && /^title\s+/i.test(trimmed)) {
          continue;
        }

        const finalCommand = this.formatCommand(trimmed, context);
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

    const context = { user, giftName: 'Follow', repeatCount: 1 };
    const responses = [];
    for (const cmdTemplate of followConfig.commands || []) {
      const trimmed = cmdTemplate.trim();
      if (!trimmed) continue;

      const announcementTemplate = this.extractAnnouncementTemplate(trimmed);
      if (announcementTemplate !== null) {
        const titleResponses = await this.sendTitleAnnouncement(announcementTemplate, context);
        responses.push(...titleResponses);
        continue;
      }

      const cmd = this.formatCommand(trimmed, context);
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

      const context = { user, giftName: 'Likes', repeatCount: step };
      const responses = [];
      for (const cmdTemplate of likeConfig.commands || []) {
        const trimmed = cmdTemplate.trim();
        if (!trimmed) continue;

        const announcementTemplate = this.extractAnnouncementTemplate(trimmed);
        if (announcementTemplate !== null) {
          const titleResponses = await this.sendTitleAnnouncement(announcementTemplate, context);
          responses.push(...titleResponses);
          continue;
        }

        const cmd = this.formatCommand(trimmed, context);
        const res = await this.rconClient.sendCommand(cmd);
        responses.push(res);
      }
      return { executed: responses.some((r) => r !== null), responses };
    }
    return { executed: false, responses: [] };
  }
}

