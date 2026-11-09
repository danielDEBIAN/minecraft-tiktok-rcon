import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TikTokLiveConnection } from 'tiktok-live-connector';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BUNDLED_CACHE_DIR = path.resolve(__dirname, '../config/.cache');
const CACHE_DIR = __dirname.includes('app.asar')
  ? path.join(os.homedir(), '.config', 'minecraft-tiktok-rcon', 'cache')
  : BUNDLED_CACHE_DIR;
const MOBS_CACHE_FILE = path.join(CACHE_DIR, 'mobs.json');
const ITEMS_CACHE_FILE = path.join(CACHE_DIR, 'items.json');
const GIFTS_CACHE_FILE = path.join(CACHE_DIR, 'tiktok-gifts.json');
const BUNDLED_MOBS_CACHE = path.join(BUNDLED_CACHE_DIR, 'mobs.json');
const BUNDLED_ITEMS_CACHE = path.join(BUNDLED_CACHE_DIR, 'items.json');
const BUNDLED_GIFTS_CACHE = path.join(BUNDLED_CACHE_DIR, 'tiktok-gifts.json');

const MC_DATA_BASE = 'https://raw.githubusercontent.com/PrismarineJS/minecraft-data/master/data/pc/1.21.4';

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
  if (CACHE_DIR !== BUNDLED_CACHE_DIR) {
    if (!fs.existsSync(MOBS_CACHE_FILE) && fs.existsSync(BUNDLED_MOBS_CACHE)) {
      fs.copyFileSync(BUNDLED_MOBS_CACHE, MOBS_CACHE_FILE);
    }
    if (!fs.existsSync(ITEMS_CACHE_FILE) && fs.existsSync(BUNDLED_ITEMS_CACHE)) {
      fs.copyFileSync(BUNDLED_ITEMS_CACHE, ITEMS_CACHE_FILE);
    }
    if (!fs.existsSync(GIFTS_CACHE_FILE) && fs.existsSync(BUNDLED_GIFTS_CACHE)) {
      fs.copyFileSync(BUNDLED_GIFTS_CACHE, GIFTS_CACHE_FILE);
    }
  }
}

const BOSS_MOBS = new Set(['ender_dragon', 'wither', 'warden', 'elder_guardian']);
const GOLEM_MOBS = new Set(['iron_golem', 'snow_golem', 'allay']);
const SPECIAL_SUMMONABLES = new Set(['lightning_bolt', 'tnt', 'end_crystal', 'fireball', 'armor_stand']);
const NEW_121_MOBS = new Set(['breeze', 'bogged', 'armadillo', 'creaking']);

function getMobCategories(entity) {
  const name = entity.name;
  const cats = [];
  if (BOSS_MOBS.has(name)) cats.push('Jefes (Bosses)');
  if (GOLEM_MOBS.has(name)) cats.push('Golems y Aliados');
  if (SPECIAL_SUMMONABLES.has(name)) cats.push('Especiales / Explosivos');

  if (entity.type === 'hostile' || entity.category === 'Hostile mobs') {
    cats.push('Hostiles');
  } else if (entity.type === 'water_creature' || ['axolotl', 'dolphin', 'turtle', 'frog', 'tadpole', 'guardian', 'elder_guardian', 'drowned'].includes(name)) {
    cats.push('Acuáticos');
  } else if (entity.type === 'animal' || entity.type === 'passive' || entity.type === 'ambient' || entity.category === 'Passive mobs') {
    cats.push('Pasivos y Animales');
  }

  if ( ['enderman', 'piglin', 'zombified_piglin', 'spider', 'cave_spider', 'wolf', 'bee', 'polar_bear', 'llama', 'trader_llama', 'goat', 'panda', 'iron_golem', 'dolphin'].includes(name)) {
    cats.push('Neutrales');
  }

  if (cats.length === 0) cats.push('Criaturas');
  return cats;
}

function getWikiMobImageUrl(displayName) {
  const clean = String(displayName || '').trim().replaceAll(' ', '_');
  return `https://minecraft.wiki/w/Special:FilePath/${encodeURIComponent(clean)}.png`;
}

function getWikiItemImageUrl(displayName) {
  const clean = String(displayName || '').trim().replaceAll(' ', '_');
  return `https://minecraft.wiki/w/Special:FilePath/Invicon_${encodeURIComponent(clean)}.png`;
}

function categorizeMinecraftItem(name) {
  const cats = [];
  if (/(sword|bow|crossbow|trident|mace|arrow|spectral_arrow|tipped_arrow|firework_rocket|tnt|end_crystal|wind_charge)/.test(name)) {
    cats.push('Armas y Combate');
  }
  if (/(helmet|chestplate|leggings|boots|elytra|shield|turtle_scute|wolf_armor|horse_armor|totem_of_undying)/.test(name)) {
    cats.push('Armaduras y Protección');
  }
  if (/(pickaxe|axe|shovel|hoe|shears|flint_and_steel|fishing_rod|spyglass|brush|bucket|compass|clock|lead|name_tag|saddle|carrot_on_a_stick|warped_fungus_on_a_stick)/.test(name)) {
    cats.push('Herramientas y Utilidades');
  }
  if (/(apple|bread|porkchop|beef|chicken|mutton|rabbit|cod|salmon|tropical_fish|pufferfish|stew|soup|cookie|melon_slice|dried_kelp|carrot|potato|beetroot|sweet_berries|glow_berries|chorus_fruit|cake|pumpkin_pie|honey_bottle|milk_bucket|potion|splash_potion|lingering_potion|omen_bottle)/.test(name)) {
    cats.push('Comida y Pociones');
  }
  if (/(diamond|emerald|netherite|gold_ingot|iron_ingot|copper_ingot|lapis_lazuli|redstone|quartz|amethyst_shard|nether_star|ender_pearl|ender_eye|blaze_rod|breeze_rod|heavy_core|echo_shard|heart_of_the_sea|nautilus_shell|shulker_shell|ancient_debris|trial_key|ominous_trial_key)/.test(name)) {
    cats.push('Minerales y Tesoros');
  }
  if (name.endsWith('_spawn_egg') || name === 'spawner' || name === 'trial_spawner') {
    cats.push('Spawn Eggs (Generadores)');
  }
  if (/(piston|observer|repeater|comparator|hopper|dropper|dispenser|Crafter|crafter|lever|button|pressure_plate|redstone|target|sculk_sensor|daylight_detector|note_block|jukebox|minecart|rail)/.test(name)) {
    cats.push('Redstone y Mecanismos');
  }
  if (/(music_disc|smithing_template|banner_pattern|pottery_sherd|enchanted_book|experience_bottle|beacon|conduit|dragon_egg|dragon_head|creeper_head|zombie_head|skeleton_skull|wither_skeleton_skull|piglin_head)/.test(name)) {
    cats.push('Especiales y Trofeos');
  }
  if (cats.length === 0) {
    cats.push('Bloques y Materiales');
  }
  return cats;
}

function getItemPriorityScore(name, categories) {
  if (name === 'diamond_sword' || name === 'netherite_sword' || name === 'golden_apple' || name === 'enchanted_golden_apple' || name === 'totem_of_undying' || name === 'mace' || name === 'trident' || name === 'elytra') return 0;
  if (categories.includes('Armas y Combate')) return 1;
  if (categories.includes('Armaduras y Protección')) return 2;
  if (categories.includes('Comida y Pociones')) return 3;
  if (categories.includes('Minerales y Tesoros')) return 4;
  if (categories.includes('Herramientas y Utilidades')) return 5;
  if (categories.includes('Especiales y Trofeos')) return 6;
  if (categories.includes('Redstone y Mecanismos')) return 7;
  if (categories.includes('Spawn Eggs (Generadores)')) return 8;
  return 9;
}

/**
 * Obtiene dinámicamente todos los Mobs y Entidades invocables de Minecraft Java Edition (1.21.4+)
 * con su nombre, ID (`minecraft:<id>`), categoría e ilustración oficial.
 */
export async function fetchMinecraftMobs(forceRefresh = false) {
  ensureCacheDir();

  if (!forceRefresh && fs.existsSync(MOBS_CACHE_FILE)) {
    try {
      const cached = JSON.parse(fs.readFileSync(MOBS_CACHE_FILE, 'utf-8'));
      if (Array.isArray(cached) && cached.length > 0) {
        return cached;
      }
    } catch {
      // Continuar con descarga fresca
    }
  }

  const res = await fetch(`${MC_DATA_BASE}/entities.json`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} al consultar entities.json de Minecraft`);
  }

  const rawEntities = await res.json();
  const validTypes = new Set(['hostile', 'mob', 'animal', 'passive', 'water_creature', 'ambient']);
  const seenIds = new Set();
  const mobs = [];

  for (const entity of rawEntities) {
    if (!entity?.name) continue;
    const isLivingMob = validTypes.has(entity.type);
    const isSpecial = SPECIAL_SUMMONABLES.has(entity.name);
    if (!isLivingMob && !isSpecial) continue;

    const roleId = `minecraft:${entity.name}`;
    if (seenIds.has(roleId)) continue;
    seenIds.add(roleId);

    const displayName = entity.displayName || entity.name.replaceAll('_', ' ');
    const categories = getMobCategories(entity);

    mobs.push({
      name: displayName,
      roleId,
      shortId: entity.name,
      slug: entity.name.toLowerCase(),
      image: getWikiMobImageUrl(displayName),
      categories,
      isNew: NEW_121_MOBS.has(entity.name),
      verifiedInServer: true,
    });
  }

  // Asegurar que el Creaking (1.21.4 Pale Garden) esté incluido
  if (!seenIds.has('minecraft:creaking')) {
    mobs.push({
      name: 'Creaking',
      roleId: 'minecraft:creaking',
      shortId: 'creaking',
      slug: 'creaking',
      image: getWikiMobImageUrl('Creaking'),
      categories: ['Hostiles'],
      isNew: true,
      verifiedInServer: true,
    });
  }

  // Ordenar: Hostiles y Jefes primero, luego alfabéticamente
  mobs.sort((a, b) => {
    const aHostile = a.categories.includes('Jefes (Bosses)') ? 0 : a.categories.includes('Hostiles') ? 1 : 2;
    const bHostile = b.categories.includes('Jefes (Bosses)') ? 0 : b.categories.includes('Hostiles') ? 1 : 2;
    if (aHostile !== bHostile) return aHostile - bHostile;
    return a.name.localeCompare(b.name);
  });

  try {
    fs.writeFileSync(MOBS_CACHE_FILE, JSON.stringify(mobs, null, 2), 'utf-8');
  } catch {
    // No bloquear si falla el guardado en caché
  }

  return mobs;
}

/**
 * Obtiene dinámicamente todos los Ítems de Minecraft Java Edition (1,384+ ítems en 1.21.4+)
 * con su nombre, ID de comando (`minecraft:<id>`), categorías e icono oficial.
 */
export async function fetchMinecraftItems(forceRefresh = false) {
  ensureCacheDir();

  if (!forceRefresh && fs.existsSync(ITEMS_CACHE_FILE)) {
    try {
      const cached = JSON.parse(fs.readFileSync(ITEMS_CACHE_FILE, 'utf-8'));
      if (Array.isArray(cached) && cached.length > 0) {
        return cached;
      }
    } catch {
      // Continuar con descarga fresca
    }
  }

  const res = await fetch(`${MC_DATA_BASE}/items.json`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} al consultar items.json de Minecraft`);
  }

  const rawItems = await res.json();
  const seenIds = new Set();
  const items = [];

  for (const entry of rawItems) {
    if (!entry?.name || entry.name === 'air') continue;
    const itemId = `minecraft:${entry.name}`;
    if (seenIds.has(itemId)) continue;
    seenIds.add(itemId);

    const displayName = entry.displayName || entry.name.replaceAll('_', ' ');
    const categories = categorizeMinecraftItem(entry.name);
    const isNew = /(mace|breeze|wind_charge|heavy_core|trial_key|ominous|wolf_armor|armadillo|bogged|crafter|pale_oak|resin|creaking)/.test(
      entry.name
    );

    items.push({
      name: displayName,
      itemId,
      shortId: entry.name,
      slug: entry.name.toLowerCase(),
      image: getWikiItemImageUrl(displayName),
      fallbackImage: `https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.21.4/assets/minecraft/textures/item/${entry.name}.png`,
      stackSize: entry.stackSize || 64,
      categories,
      isNew,
      verifiedInServer: true,
      _priority: getItemPriorityScore(entry.name, categories),
    });
  }

  items.sort((a, b) => a._priority - b._priority || a.name.localeCompare(b.name));
  for (const it of items) {
    delete it._priority;
  }

  try {
    fs.writeFileSync(ITEMS_CACHE_FILE, JSON.stringify(items, null, 2), 'utf-8');
  } catch {
    // No bloquear si falla el guardado en caché
  }

  return items;
}

/**
 * Descarga regalos desde streamtoearn.io/gifts (más de 2500 regalos con nombre, monedas e imagen)
 */
async function fetchStreamToEarnGifts() {
  try {
    const res = await fetch('https://streamtoearn.io/gifts', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
      },
    });
    if (!res.ok) return [];
    const html = await res.text();
    const regex =
      /<div class="gift"[^>]*>\s*<img\s+src="([^"]+)"[^>]*>\s*<p class="gift-name">([^<]+)<\/p>\s*<p class="gift-price">(\d+)/g;
    const list = [];
    for (const m of html.matchAll(regex)) {
      const image = m[1].trim();
      const name = m[2].trim();
      const coins = Number(m[3]) || 1;
      list.push({
        id: `ste_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
        name,
        coins,
        image: image.startsWith('http') ? image : `https://streamtoearn.io${image}`,
      });
    }
    return list;
  } catch {
    return [];
  }
}

/**
 * Descarga regalos directamente de la API pública de Webcast de TikTok (sin firma de pago)
 */
async function fetchTikTokWebcastGifts() {
  try {
    const conn = new TikTokLiveConnection('tiktok', {});
    const res = await conn.webClient.getJsonObjectFromWebcastApi(
      'gift/list/',
      { ...conn.webClient.clientParams },
      false
    );
    const rawGifts = res?.data?.gifts || [];
    return rawGifts
      .filter((g) => g && g.name)
      .map((g) => ({
        id: g.id,
        name: g.name.trim(),
        coins: Number(g.diamond_count) || 1,
        image: g.image?.url_list?.[0] || g.icon?.url_list?.[0] || '',
      }));
  } catch {
    return [];
  }
}

/**
 * Obtiene dinámicamente todos los regalos de TikTok combinando streamtoearn.io/gifts y la API de TikTok Webcast
 */
export async function fetchTikTokGifts(forceRefresh = false) {
  ensureCacheDir();

  if (!forceRefresh && fs.existsSync(GIFTS_CACHE_FILE)) {
    try {
      const cached = JSON.parse(fs.readFileSync(GIFTS_CACHE_FILE, 'utf-8'));
      if (Array.isArray(cached) && cached.length > 0) {
        return cached;
      }
    } catch {
      // Continuar con descarga fresca
    }
  }

  const [steGifts, webcastGifts] = await Promise.all([
    fetchStreamToEarnGifts(),
    fetchTikTokWebcastGifts(),
  ]);

  const byName = new Map();

  for (const gift of steGifts) {
    const key = gift.name.toLowerCase();
    if (!byName.has(key)) {
      byName.set(key, gift);
    }
  }

  for (const gift of webcastGifts) {
    const key = gift.name.toLowerCase();
    if (!byName.has(key)) {
      byName.set(key, gift);
    } else {
      const existing = byName.get(key);
      if (!existing.image && gift.image) existing.image = gift.image;
      if (gift.id && typeof gift.id === 'number') existing.id = gift.id;
    }
  }

  const merged = Array.from(byName.values()).sort((a, b) => a.coins - b.coins || a.name.localeCompare(b.name));

  try {
    fs.writeFileSync(GIFTS_CACHE_FILE, JSON.stringify(merged, null, 2), 'utf-8');
  } catch {
    // Ignorar error de escritura de caché
  }

  return merged;
}

