#!/usr/bin/env node
/**
 * Procedural Crab Gift Generator
 * Generates thousands of unique crab-themed gifts with animations
 * Run: node scripts/generate-crab-gifts.js [count]
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const GIFTS_FILE = path.join(PROJECT_ROOT, 'server/data/gifts.js');
const TRAITS_FILE = path.join(PROJECT_ROOT, 'public/js/lib/giftTraits.js');
const BIRTHDAY_FILE = path.join(PROJECT_ROOT, 'server/lib/birthdaySweep.js');

/**
 * Animation presets for different moods/actions
 */
const ANIMATION_PRESETS = {
  idle: { loop: 3, baseAnim: 'float', dur: 3 },
  wave: { loop: 2.5, baseAnim: 'wave', dur: 1.8 },
  bounce: { loop: 2, baseAnim: 'bounce', dur: 1.5 },
  dance: { loop: 2.2, baseAnim: 'wiggle', dur: 1.4 },
  sleep: { loop: 4, baseAnim: 'breathe', dur: 3.5 },
  eat: { loop: 2.8, baseAnim: 'pulse', dur: 2 },
  party: { loop: 2.5, baseAnim: 'pulse', dur: 2.2 },
  code: { loop: 3, baseAnim: 'float', dur: 2.8 },
  read: { loop: 3.5, baseAnim: 'settle', dur: 3 },
  workout: { loop: 2, baseAnim: 'bounce', dur: 1.3 },
  magic: { loop: 3, baseAnim: 'twinkle', dur: 2.5 },
  travel: { loop: 3.2, baseAnim: 'float', dur: 3 },
  celebrate: { loop: 2.2, baseAnim: 'pop', dur: 1.6 },
  love: { loop: 3, baseAnim: 'heartbeat', dur: 2.5 },
  chill: { loop: 4, baseAnim: 'float', dur: 3.5 },
};

/**
 * Color palettes for different themes
 */
const PALETTES = {
  default: ['#e6f7ff', '#ffe6e6', '#fff0f6', '#f3e5f5', '#e8f5e9', '#fff9c4', '#fff3e0', '#e1f5fe', '#fff0f6'],
  ocean: ['#e1f5fe', '#b3e5fc', '#81d4fa', '#4fc3f7', '#29b6f6', '#039be5', '#0288d1', '#0277bd'],
  sunset: ['#fff3e0', '#ffe0b2', '#ffcc80', '#ffb74d', '#ffa726', '#ff9800', '#fb8c00', '#f57c00'],
  forest: ['#e8f5e9', '#c8e6c9', '#a5d6a7', '#81c784', '#66bb6a', '#4caf50', '#43a047', '#388e3c'],
  night: ['#ede7f6', '#d1c4e9', '#b39ddb', '#9575cd', '#7e57c2', '#673ab7', '#5e35b1', '#512da8'],
  fire: ['#fbe9e7', '#ffccbc', '#ffab91', '#ff8a65', '#ff7043', '#ff5722', '#f4511e', '#e64a19'],
  pastel: ['#fce4ec', '#f8bbd0', '#f48fb1', '#f06292', '#ec407a', '#e91e63', '#d81b60', '#c2185b'],
  neon: ['#f3e5f5', '#e1bee7', '#ce93d8', '#ba68c8', '#ab47bc', '#9c27b0', '#8e24aa', '#7b1fa2'],
  gold: ['#fffde7', '#fff9c4', '#fff59d', '#fff176', '#ffee58', '#ffeb3b', '#fdd835', '#fbc02d'],
  ice: ['#e8eaf6', '#c5cae9', '#9fa8da', '#7986cb', '#5c6bc0', '#3f51b5', '#3949ab', '#303f9f'],
};

/**
 * Accessory sets for different themes
 */
const ACCESSORY_SETS = {
  party: ['🎉', '🎊', '🎈', '🎂', '🍾', '🥂', '🎁', '🎀', '🪅', '🎭'],
  beach: ['🏖️', '🏝️', '🌊', '🐚', '🌴', '☀️', '🕶️', '👙', '🏄', '🍹'],
  winter: ['❄️', '☃️', '🎄', '🎁', '🧣', '🧤', '☕', '🍪', '⛷️', '🛷'],
  spring: ['🌸', '🌷', '🌼', '🦋', '🐝', '🌿', '🌱', '🌻', '🐞', '🌈'],
  halloween: ['🎃', '👻', '🕷️', '🕸️', '🧙', '🧛', '🍬', '🍭', '🦇', '🧟'],
  christmas: ['🎄', '🎅', '🤶', '🦌', '❄️', '🎁', '🔔', '⭐', '🍪', '🥛'],
  coding: ['💻', '⌨️', '🖱️', '👨‍💻', '🐛', '🔧', '⚙️', '📦', '🚀', '☕'],
  music: ['🎵', '🎶', '🎸', '🎹', '🥁', '🎺', '🎷', '🎤', '🎧', '🎧'],
  sports: ['⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🏓', '🏸', '🥅', '🏆'],
  food: ['🍕', '🍔', '🍟', '🌭', '🍿', '🌮', '🍣', '🍜', '🍰', '🍦'],
  space: ['🚀', '👨‍🚀', '🌙', '⭐', '🌟', '☄️', '🪐', '🛸', '🌌', '🛰️'],
  fantasy: ['🏰', '🧙', '🧝', '🐉', '🦄', '⚔️', '🛡️', '💎', '👑', '🔮'],
  office: ['📋', '📊', '💼', '🖋️', '☕', '📱', '💻', '📧', '📅', '✅'],
  fitness: ['💪', '🏋️', '🤸', '🏃', '🚴', '🏊', '🧘', '🥊', '🤼', '🏅'],
  travel: ['✈️', '🚂', '🚢', '🗺️', '🧳', '🏨', '🗽', '🗼', '🌉', '🌅'],
  art: ['🎨', '🖼️', '🖌️', '🎭', '🗿', '🖍️', '✏️', '📐', '📏', '✂️'],
  science: ['🔬', '🧪', '🧬', '🔭', '📡', '⚗️', '🧫', '🧬', '💊', '💉'],
  pets: ['🐱', '🐶', '🐰', '🐹', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼'],
  magic: ['✨', '🔮', '🪄', '🧙', '🧚', '🧝', '🦄', '🐉', '🏰', '💫'],
  retro: ['🕹️', '📼', '📷', '📻', '💿', '📟', '🎮', '🕰️', '📠', '☎️'],
  cyber: ['🤖', '💻', '🌐', '🔒', '🔐', '💾', '🖥️', '⌨️', '🖱️', '🔌'],
  nature: ['🌲', '🌳', '🌴', '🌿', '🍃', '🍂', '🍁', '🌾', '🌱', '🌰'],
  underwater: ['🐠', '🐟', '🐡', '🦈', '🐙', '🦞', '🦐', '🦑', '🐚', '🪸'],
  sky: ['☁️', '⛅', '🌤️', '🌈', '☀️', '🌅', '🌇', '🌙', '⭐', '🌌'],
};

/**
 * Hat/headwear options
 */
const HATS = [
  { emoji: '🎩', name: 'цилиндр', x: 50, y: 12, size: 30 },
  { emoji: '👒', name: 'широкополый', x: 50, y: 14, size: 32 },
  { emoji: '🧢', name: 'кепка', x: 50, y: 16, size: 28 },
  { emoji: '👑', name: 'корона', x: 50, y: 14, size: 30 },
  { emoji: '🎓', name: 'академическая', x: 50, y: 16, size: 26 },
  { emoji: '🪖', name: 'шлем', x: 50, y: 16, size: 28 },
  { emoji: '🧣', name: 'шарф', x: 50, y: 58, size: 24 },
  { emoji: '🕶️', name: 'очки', x: 50, y: 28, size: 28 },
  { emoji: '🎭', name: 'маска', x: 50, y: 28, size: 26 },
  { emoji: '👑', name: 'тиара', x: 50, y: 14, size: 28 },
  { emoji: '🤠', name: 'ковбойский', x: 50, y: 14, size: 30 },
  { emoji: '🧙', name: 'волшебная шляпа', x: 50, y: 12, size: 32 },
  { emoji: '👮', name: 'полицейская', x: 50, y: 16, size: 28 },
  { emoji: '👷', name: 'строительная', x: 50, y: 16, size: 28 },
  { emoji: '🍳', name: 'поварская', x: 50, y: 16, size: 26 },
];

/**
 * Hand-held items
 */
const HAND_ITEMS = [
  { emoji: '🎁', name: 'подарок', x: 72, y: 40, size: 24 },
  { emoji: '🍦', name: 'мороженое', x: 70, y: 42, size: 26 },
  { emoji: '🍰', name: 'кусочек торта', x: 68, y: 40, size: 26 },
  { emoji: '🍩', name: 'пончик', x: 70, y: 42, size: 24 },
  { emoji: '🍪', name: 'печенье', x: 72, y: 44, size: 22 },
  { emoji: '🍫', name: 'шоколадка', x: 70, y: 44, size: 24 },
  { emoji: '🍬', name: 'конфета', x: 72, y: 44, size: 20 },
  { emoji: '🍭', name: 'леденец', x: 70, y: 40, size: 24 },
  { emoji: '🎈', name: 'шар', x: 72, y: 28, size: 26 },
  { emoji: '🎀', name: 'бантик', x: 68, y: 30, size: 16 },
  { emoji: '💎', name: 'алмаз', x: 70, y: 38, size: 22 },
  { emoji: '🌟', name: 'звезда', x: 72, y: 28, size: 24 },
  { emoji: '⭐', name: 'звезда2', x: 70, y: 30, size: 22 },
  { emoji: '💝', name: 'сердце в коробке', x: 70, y: 40, size: 24 },
  { emoji: '💌', name: 'любовное письмо', x: 70, y: 42, size: 24 },
  { emoji: '🌹', name: 'роза', x: 70, y: 42, size: 26 },
  { emoji: '🌸', name: 'сакура', x: 70, y: 42, size: 24 },
  { emoji: '🌻', name: 'подсолнух', x: 70, y: 42, size: 26 },
  { emoji: '🍄', name: 'грибок', x: 70, y: 44, size: 24 },
  { emoji: '🍀', name: 'клевер', x: 72, y: 44, size: 22 },
];

/**
 * Background elements
 */
const BG_ELEMENTS = [
  { type: 'circle', emoji: null },
  { type: 'ellipse', emoji: null },
  { type: 'emoji', emoji: '✨' },
  { type: 'emoji', emoji: '💫' },
  { type: 'emoji', emoji: '⭐' },
  { type: 'emoji', emoji: '🌟' },
  { type: 'emoji', emoji: '💖' },
  { type: 'emoji', emoji: '❤️' },
  { type: 'emoji', emoji: '🎈' },
  { type: 'emoji', emoji: '🎊' },
  { type: 'emoji', emoji: '🎉' },
  { type: 'emoji', emoji: '🌸' },
  { type: 'emoji', emoji: '🌿' },
  { type: 'emoji', emoji: '🍃' },
  { type: 'emoji', emoji: '🍂' },
  { type: 'emoji', emoji: '❄️' },
  { type: 'emoji', emoji: '🌊' },
  { type: 'emoji', emoji: '🔥' },
];

/**
 * Generate a unique gift ID
 */
function generateId(base, index, variant) {
  return `crab_${base}_${variant}_${index}`;
}

/**
 * Generate gift name in Russian
 */
function generateName(theme, accessory, hat, variant) {
  const themes = {
    party: 'Вечеринка',
    beach: 'Пляж',
    winter: 'Зима',
    spring: 'Весна',
    halloween: 'Хэллоуин',
    christmas: 'Рождество',
    coding: 'Кодинг',
    music: 'Музыка',
    sports: 'Спорт',
    food: 'Еда',
    space: 'Космос',
    fantasy: 'Фэнтези',
    office: 'Офис',
    fitness: 'Фитнес',
    travel: 'Путешествие',
    art: 'Искусство',
    science: 'Наука',
    pets: 'Питомцы',
    magic: 'Магия',
    retro: 'Ретро',
    cyber: 'Кибер',
    nature: 'Природа',
    underwater: 'Подводный мир',
    sky: 'Небо',
  };
  const themeName = themes[theme] || theme;
  const parts = [`Краб ${themeName}`];
  if (hat) parts.push(`в ${hat.name}`);
  if (accessory) parts.push(`с ${accessory.name}`);
  return parts.join(' ');
}

/**
 * Generate BUILTIN_GIFT_SCENES entry as valid JS
 */
function generateScene(giftId, config) {
  const { theme, hat, accessory, handItem, bgElements, palette, animPreset, price } = config;
  const preset = ANIMATION_PRESETS[animPreset] || ANIMATION_PRESETS.idle;
  const bgColor = palette[Math.floor(Math.random() * palette.length)];
  
  const layers = [];
  
  // Base background circle/ellipse
  if (Math.random() > 0.3) {
    const isCircle = Math.random() > 0.5;
    const layer = {
      type: isCircle ? 'circle' : 'ellipse',
      x: 50,
      y: Math.random() > 0.5 ? 50 : 70,
      fill: bgColor,
      opacity: Math.round((0.3 + Math.random() * 0.4) * 100) / 100,
      anim: preset.baseAnim,
      dur: Math.round((preset.dur + (Math.random() - 0.5) * 0.5) * 100) / 100,
    };
    if (isCircle) {
      layer.r = Math.round((40 + Math.random() * 10) * 100) / 100;
    } else {
      layer.w = Math.round((90 + Math.random() * 20) * 100) / 100;
      layer.h = Math.round((18 + Math.random() * 10) * 100) / 100;
    }
    layers.push(layer);
  }
  
  // Main crab
  const crabX = 30 + Math.random() * 40;
  const crabY = 44 + Math.random() * 12;
  const crabSize = 32 + Math.random() * 12;
  layers.push({
    type: 'emoji',
    emoji: '🦀',
    x: Math.round(crabX),
    y: Math.round(crabY),
    size: Math.round(crabSize),
    anim: preset.baseAnim,
    dur: Math.round((preset.dur + (Math.random() - 0.5) * 0.3) * 100) / 100,
  });
  
  // Hat
  if (hat) {
    layers.push({
      type: 'emoji',
      emoji: hat.emoji,
      x: hat.x + Math.round((Math.random() - 0.5) * 4),
      y: hat.y + Math.round((Math.random() - 0.5) * 4),
      size: hat.size + Math.floor(Math.random() * 4),
      anim: 'bounce',
      delay: Math.round((0.3 + Math.random() * 0.4) * 1000) / 1000,
      dur: Math.round((1.5 + Math.random() * 0.5) * 100) / 100,
    });
  }
  
  // Hand item
  if (handItem) {
    layers.push({
      type: 'emoji',
      emoji: handItem.emoji,
      x: handItem.x + Math.round((Math.random() - 0.5) * 6),
      y: handItem.y + Math.round((Math.random() - 0.5) * 6),
      size: handItem.size + Math.floor(Math.random() * 4),
      anim: ['pop', 'blink', 'rise', 'float'][Math.floor(Math.random() * 4)],
      delay: Math.round((0.4 + Math.random() * 0.6) * 1000) / 1000,
      dur: Math.round((1.4 + Math.random() * 0.6) * 100) / 100,
    });
  }
  
  // Background decorative elements (2-5)
  const numBg = 2 + Math.floor(Math.random() * 4);
  for (let i = 0; i < numBg; i++) {
    const bg = bgElements[Math.floor(Math.random() * bgElements.length)];
    if (bg.type === 'emoji') {
      layers.push({
        type: 'emoji',
        emoji: bg.emoji,
        x: 10 + Math.floor(Math.random() * 80),
        y: 10 + Math.floor(Math.random() * 80),
        size: 12 + Math.floor(Math.random() * 14),
        anim: ['blink', 'rise', 'float', 'pop', 'wiggle'][Math.floor(Math.random() * 5)],
        delay: Math.round(Math.random() * 1.5 * 1000) / 1000,
        dur: Math.round((1.2 + Math.random() * 1.2) * 100) / 100,
      });
    }
  }
  
  // Sparkles
  for (let i = 0; i < 2; i++) {
    layers.push({
      type: 'emoji',
      emoji: ['✨', '💫', '⭐', '🌟', '💖'][Math.floor(Math.random() * 5)],
      x: 15 + Math.floor(Math.random() * 70),
      y: 15 + Math.floor(Math.random() * 70),
      size: 10 + Math.floor(Math.random() * 10),
      anim: 'blink',
      delay: Math.round((0.5 + Math.random() * 1.5) * 1000) / 1000,
      dur: Math.round((1 + Math.random() * 1) * 100) / 100,
    });
  }
  
  // Format as JS object string with rounded numbers
  const layerStrings = layers.map(l => {
    const props = Object.entries(l).map(([k, v]) => {
      if (typeof v === 'string') return `${k}: "${v}"`;
      if (typeof v === 'number') return `${k}: ${v}`;
      return `${k}: ${v}`;
    }).join(', ');
    return `{ ${props} }`;
  }).join(',\n      ');
  
  const loop = Math.round((preset.loop + (Math.random() - 0.5) * 0.5) * 100) / 100;
  
  return `${giftId}: {
    v: 1,
    loop: ${loop},
    bg: null,
    layers: [
      ${layerStrings}
    ],
  }`;
}

/**
 * Main generation function
 */
function generateGifts(count = 500) {
  const themes = Object.keys(ACCESSORY_SETS);
  const gifts = [];
  const scenes = {};
  const birthdaySuggestions = [];
  const twebIds = new Set([
    // existing ones from gifts.js
  ]);
  
  for (let i = 0; i < count; i++) {
    const theme = themes[i % themes.length];
    const accessories = ACCESSORY_SETS[theme];
    const palette = PALETTES[Object.keys(PALETTES)[i % Object.keys(PALETTES).length]];
    const animPreset = Object.keys(ANIMATION_PRESETS)[i % Object.keys(ANIMATION_PRESETS).length];
    
    const hasHat = Math.random() > 0.4;
    const hasHandItem = Math.random() > 0.3;
    const hasAccessory = Math.random() > 0.5;
    
    const hat = hasHat ? HATS[Math.floor(Math.random() * HATS.length)] : null;
    const handItem = hasHandItem ? HAND_ITEMS[Math.floor(Math.random() * HAND_ITEMS.length)] : null;
    const accessory = hasAccessory ? { emoji: accessories[Math.floor(Math.random() * accessories.length)], name: 'аксессуар' } : null;
    
    const variant = Math.floor(i / themes.length);
    const giftId = generateId(theme, i, variant);
    const price = 5 + Math.floor(Math.random() * 50);
    
    const config = { theme, hat, accessory, handItem, bgElements: BG_ELEMENTS, palette, animPreset, price };
    scenes[giftId] = generateScene(giftId, config);
    
    const name = generateName(theme, accessory, hat, variant);
    const emoji = '🦀';
    
    gifts.push({ id: giftId, emoji, name, priceRub: price, premiumDays: 0 });
    twebIds.add(giftId);
    
    // Add to birthday suggestions if party/celebration theme
    if (['party', 'christmas', 'halloween', 'celebrate'].includes(theme) || Math.random() > 0.7) {
      birthdaySuggestions.push({ id: giftId, emoji, name });
    }
  }
  
  return { gifts, scenes, birthdaySuggestions, twebIds };
}

/**
 * Read existing file and find insertion points
 */
function readGiftsFile() {
  return fs.readFileSync(GIFTS_FILE, 'utf8');
}

function readTraitsFile() {
  return fs.readFileSync(TRAITS_FILE, 'utf8');
}

function readBirthdayFile() {
  return fs.readFileSync(BIRTHDAY_FILE, 'utf8');
}

/**
 * Insert gifts into gifts.js
 */
function updateGiftsFile(existingContent, newGifts) {
  // Find the crab gifts section
  const marker = '// — Новые подарки с крабом для дней рождения (40+) —';
  const idx = existingContent.indexOf(marker);
  if (idx === -1) throw new Error('Marker not found in gifts.js');
  
  const insertPos = idx + marker.length;
  const giftStrings = newGifts.map(g => `  { id: "${g.id}", emoji: "${g.emoji}", name: "${g.name}", priceRub: ${g.priceRub}, premiumDays: 0 },`).join('\n');
  
  return existingContent.slice(0, insertPos) + '\n' + giftStrings + existingContent.slice(insertPos);
}

/**
 * Update TWEB_GIFT_IDS
 */
function updateTwebIds(existingContent, newIds) {
  const marker = '"crab_umbrella"';
  const idx = existingContent.indexOf(marker);
  if (idx === -1) throw new Error('TWEB_GIFT_IDS marker not found');
  
  // Find the closing bracket of the array
  let bracketCount = 0;
  let pos = idx;
  while (pos < existingContent.length) {
    if (existingContent[pos] === ']') {
      if (bracketCount === 0) break;
      bracketCount--;
    } else if (existingContent[pos] === '[') {
      bracketCount++;
    }
    pos++;
  }
  
  const idStrings = Array.from(newIds).map(id => `  "${id}",`).join('\n');
  return existingContent.slice(0, pos) + '\n' + idStrings + existingContent.slice(pos);
}

/**
 * Insert scenes into giftTraits.js
 */
function updateTraitsFile(existingContent, newScenes) {
  // Simple string replacement: find the end of BUILTIN_GIFT_SCENES object
  // Original pattern: "  },\n};\n\nexport function renderGiftArt"
  const marker = '  },\n};\n\nexport function renderGiftArt';
  const idx = existingContent.indexOf(marker);
  if (idx === -1) throw new Error('Could not find BUILTIN_GIFT_SCENES end marker');
  
  const sceneStrings = Object.values(newScenes).map(s => '  ' + s).join(',\n');
  
  // Replace the }; with new scenes + };
  const replacement = '  },\n' + sceneStrings + ',\n};\n\nexport function renderGiftArt';
  return existingContent.slice(0, idx) + replacement + existingContent.slice(idx + marker.length);
}

/**
 * Update birthday suggestions
 */
function updateBirthdayFile(existingContent, newSuggestions) {
  const marker = 'const BIRTHDAY_GIFT_SUGGESTIONS = [';
  const idx = existingContent.indexOf(marker);
  if (idx === -1) throw new Error('Birthday marker not found');
  
  // Find closing ]
  let bracketCount = 0;
  let pos = idx;
  while (pos < existingContent.length) {
    if (existingContent[pos] === '[') bracketCount++;
    else if (existingContent[pos] === ']') { bracketCount--; if (bracketCount === 0) break; }
    pos++;
  }
  
  const suggestionStrings = newSuggestions.map(s => `  { id: "${s.id}", emoji: "${s.emoji}", name: "${s.name}" },`).join('\n');
  return existingContent.slice(0, pos) + '\n' + suggestionStrings + existingContent.slice(pos);
}

// Main
const count = parseInt(process.argv[2]) || 500;
console.log(`Generating ${count} crab gifts...`);

const { gifts, scenes, birthdaySuggestions, twebIds } = generateGifts(count);
console.log(`Generated ${gifts.length} gifts, ${Object.keys(scenes).length} scenes, ${birthdaySuggestions.length} birthday suggestions`);

// Read existing files
const giftsContent = readGiftsFile();
const traitsContent = readTraitsFile();
const birthdayContent = readBirthdayFile();

// Update files
const newGiftsContent = updateGiftsFile(giftsContent, gifts);
const newTraitsContent = updateTraitsFile(traitsContent, scenes);
const newBirthdayContent = updateBirthdayFile(birthdayContent, birthdaySuggestions);

// Write back
fs.writeFileSync(GIFTS_FILE, newGiftsContent);
fs.writeFileSync(TRAITS_FILE, newTraitsContent);
fs.writeFileSync(BIRTHDAY_FILE, newBirthdayContent);

console.log('Files updated successfully!');
console.log(`Total gifts added: ${gifts.length}`);
console.log(`Total birthday suggestions: ${birthdaySuggestions.length}`);

// Also create a summary JSON for reference
const summary = {
  generated: new Date().toISOString(),
  count: gifts.length,
  themes: [...new Set(gifts.map(g => g.id.split('_')[1]))],
  priceRange: { min: Math.min(...gifts.map(g => g.priceRub)), max: Math.max(...gifts.map(g => g.priceRub)) },
};
fs.writeFileSync(path.join(PROJECT_ROOT, 'crab-gifts-summary.json'), JSON.stringify(summary, null, 2));