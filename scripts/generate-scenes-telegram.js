#!/usr/bin/env node
/**
 * Generate Telegram-style BUILTIN_GIFT_SCENES for giftTraits.scenes.js
 * Creates sophisticated animations mimicking Telegram gift visual style:
 * - Gradient backgrounds with animated shimmers
 * - Particle systems with physics-like motion
 * - Color-shifting glows and blooms
 * - Spiral/drawing animations
 * - Multi-layered depth with parallax
 * - Smooth easing curves (cubic-bezier)
 * 
 * Run: node scripts/generate-scenes-telegram.js [count]
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const SCENES_FILE = path.join(PROJECT_ROOT, 'public/js/lib/giftTraits.scenes.js');

// Telegram-style color palettes (purples, blues, pinks, golds, cyans)
const TG_PALETTES = {
  purpleGold: {
    bg: ['#1a0a2e', '#16213e', '#0f3460'],
    accent: ['#e94560', '#ff6b6b', '#ffd700', '#ff8c00'],
    glow: ['#e94560', '#ff6b6b', '#ffd700'],
    particles: ['#ff6b6b', '#ffd700', '#ff8c00', '#e94560', '#fff']
  },
  blueCyan: {
    bg: ['#0c0c1f', '#1a1a2e', '#16213e'],
    accent: ['#00d4ff', '#00ffcc', '#7b68ee', '#9b59b6'],
    glow: ['#00d4ff', '#7b68ee', '#00ffcc'],
    particles: ['#00d4ff', '#00ffcc', '#7b68ee', '#fff', '#9b59b6']
  },
  pinkMagenta: {
    bg: ['#1f0c1f', '#2d0c2e', '#3d0c3e'],
    accent: ['#ff2d95', '#ff6b9d', '#ff1493', '#ff69b4'],
    glow: ['#ff2d95', '#ff6b9d', '#fff'],
    particles: ['#ff2d95', '#ff6b9d', '#ff1493', '#fff', '#ff69b4']
  },
  sunsetOrange: {
    bg: ['#1f1008', '#2d1a0a', '#3d250a'],
    accent: ['#ff8c00', '#ff6b35', '#ff4500', '#ffd700'],
    glow: ['#ff8c00', '#ff6b35', '#ffd700'],
    particles: ['#ff8c00', '#ff6b35', '#ffd700', '#fff', '#ff4500']
  },
  emeraldGold: {
    bg: ['#081f0e', '#0a2d12', '#0c3d16'],
    accent: ['#00ff7f', '#32cd32', '#ffd700', '#ff8c00'],
    glow: ['#00ff7f', '#32cd32', '#ffd700'],
    particles: ['#00ff7f', '#32cd32', '#ffd700', '#fff', '#ff8c00']
  },
  cosmicViolet: {
    bg: ['#0d082e', '#1a0a3e', '#2d1a4e'],
    accent: ['#bb86fc', '#9b59b6', '#8a2be2', '#da70d6'],
    glow: ['#bb86fc', '#9b59b6', '#da70d6'],
    particles: ['#bb86fc', '#9b59b6', '#da70d6', '#fff', '#8a2be2']
  },
  fireRose: {
    bg: ['#2e0808', '#3e0a0a', '#4e0c0c'],
    accent: ['#ff2d2d', '#ff6b6b', '#ffd700', '#ff4500'],
    glow: ['#ff2d2d', '#ff6b6b', '#ffd700'],
    particles: ['#ff2d2d', '#ff6b6b', '#ffd700', '#fff', '#ff4500']
  },
  auroraTeal: {
    bg: ['#081f1f', '#0a2e2e', '#0c3d3d'],
    accent: ['#00ffcc', '#40e0d0', '#ffd700', '#7b68ee'],
    glow: ['#00ffcc', '#40e0d0', '#ffd700'],
    particles: ['#00ffcc', '#40e0d0', '#ffd700', '#fff', '#7b68ee']
  }
};

const THEMES = Object.keys(TG_PALETTES);

const HATS = [
  { emoji: '🎩', name: 'цилиндр', x: 50, y: 10, size: 32, z: 10 },
  { emoji: '👑', name: 'корона', x: 50, y: 8, size: 34, z: 10 },
  { emoji: '🧢', name: 'кепка', x: 50, y: 12, size: 28, z: 10 },
  { emoji: '👒', name: 'широкополый', x: 50, y: 10, size: 36, z: 10 },
  { emoji: '🎓', name: 'академическая', x: 50, y: 12, size: 28, z: 10 },
  { emoji: '🪖', name: 'шлем', x: 50, y: 12, size: 30, z: 10 },
  { emoji: '🧣', name: 'шарф', x: 50, y: 58, size: 24, z: 5 },
  { emoji: '🕶️', name: 'очки', x: 50, y: 28, size: 28, z: 10 },
  { emoji: '🎭', name: 'маска', x: 50, y: 28, size: 26, z: 10 },
  { emoji: '🤠', name: 'ковбойский', x: 50, y: 10, size: 32, z: 10 },
  { emoji: '🧙', name: 'волшебная шляпа', x: 50, y: 8, size: 36, z: 10 },
];

const HAND_ITEMS = [
  { emoji: '🎁', name: 'подарок', x: 72, y: 38, size: 26, z: 8 },
  { emoji: '🍰', name: 'торт', x: 68, y: 38, size: 28, z: 8 },
  { emoji: '🍩', name: 'пончик', x: 70, y: 40, size: 26, z: 8 },
  { emoji: '🍫', name: 'шоколадка', x: 70, y: 42, size: 26, z: 8 },
  { emoji: '🍭', name: 'леденец', x: 70, y: 38, size: 26, z: 8 },
  { emoji: '🎈', name: 'шар', x: 72, y: 26, size: 28, z: 8 },
  { emoji: '🌟', name: 'звезда', x: 72, y: 26, size: 26, z: 8 },
  { emoji: '💎', name: 'алмаз', x: 70, y: 36, size: 24, z: 8 },
  { emoji: '💝', name: 'сердце в коробке', x: 70, y: 38, size: 26, z: 8 },
  { emoji: '🌹', name: 'роза', x: 70, y: 40, size: 28, z: 8 },
  { emoji: '✨', name: 'искра', x: 72, y: 30, size: 20, z: 8 },
  { emoji: '🪄', name: 'волшебная палочка', x: 68, y: 30, size: 24, z: 8 },
];

// Telegram-style animation easings (cubic-bezier approximations via keyframes)
const EASINGS = {
  easeOut: [0.25, 0.46, 0.45, 0.94],
  easeIn: [0.55, 0.055, 0.675, 0.19],
  easeInOut: [0.645, 0.045, 0.355, 1],
  bounce: [0.68, -0.55, 0.265, 1.55],
  elastic: [0.68, -0.6, 0.32, 1.6],
  sharp: [0.4, 0, 0.2, 1],
  smooth: [0.25, 0.1, 0.25, 1],
};

const PARTICLE_TYPES = [
  { emoji: '✨', weight: 0.3 },
  { emoji: '💫', weight: 0.2 },
  { emoji: '⭐', weight: 0.15 },
  { emoji: '🌟', weight: 0.15 },
  { emoji: '💖', weight: 0.1 },
  { emoji: '💎', weight: 0.05 },
  { emoji: '❄️', weight: 0.05 },
];

function round2(n) { return Math.round(n * 100) / 100; }
function round3(n) { return Math.round(n * 1000) / 1000; }
function rand(min, max) { return min + Math.random() * (max - min); }
function randInt(min, max) { return Math.floor(min + Math.random() * (max - min + 1)); }
function pick(arr) { return arr[randInt(0, arr.length - 1)]; }
function weightedPick(arr) {
  const total = arr.reduce((sum, item) => sum + item.weight, 0);
  let r = Math.random() * total;
  for (const item of arr) {
    r -= item.weight;
    if (r <= 0) return item.emoji;
  }
  return arr[arr.length - 1].emoji;
}

function generateScene(giftId, config) {
  const { theme, hat, handItem, palette, variant, index } = config;
  const layers = [];
  
  // ===== LAYER 1: Deep Background Gradient (animated) =====
  const bgColors = palette.bg;
  layers.push({
    type: 'ellipse',
    x: 50, y: 50, w: 120, h: 120,
    fill: bgColors[0],
    opacity: 1,
    anim: 'pulse',
    dur: rand(8, 12),
    delay: 0,
    z: -10
  });
  
  // Gradient overlay with slow color shift
  layers.push({
    type: 'ellipse',
    x: 50, y: 50, w: 110, h: 110,
    fill: bgColors[1],
    opacity: 0.7,
    anim: 'float',
    dur: rand(10, 15),
    delay: rand(0, 2),
    z: -9
  });
  
  // Outer glow ring
  layers.push({
    type: 'ellipse',
    x: 50, y: 50, w: 100, h: 100,
    fill: palette.glow[0],
    opacity: 0.15,
    anim: 'pulse',
    dur: rand(4, 6),
    delay: rand(0, 1),
    z: -8
  });
  
  // ===== LAYER 2: Animated Gradient Mesh (simulated via rotating ellipses) =====
  for (let i = 0; i < 3; i++) {
    const color = palette.accent[i % palette.accent.length];
    layers.push({
      type: 'ellipse',
      x: rand(30, 70),
      y: rand(30, 70),
      w: rand(40, 80),
      h: rand(30, 60),
      fill: color,
      opacity: rand(0.08, 0.18),
      anim: 'spin',
      dur: rand(15, 25),
      delay: rand(0, 5),
      rot: rand(0, 360),
      z: -5 - i
    });
  }
  
  // ===== LAYER 3: Spiral/Drawing Lines (Telegram-style) =====
  const spiralCount = randInt(2, 4);
  for (let i = 0; i < spiralCount; i++) {
    const color = palette.accent[i % palette.accent.length];
    const startDelay = rand(0.5, 3);
    layers.push({
      type: 'emoji',
      emoji: '✨',
      x: rand(15, 85),
      y: rand(15, 85),
      size: rand(8, 16),
      fill: color,
      opacity: rand(0.6, 1),
      anim: 'spin',
      dur: rand(2, 4),
      delay: startDelay + rand(0, 1),
      z: 20 + i
    });
  }
  
  // ===== LAYER 4: Main Crab Character =====
  const crabX = rand(35, 65);
  const crabY = rand(45, 60);
  const crabSize = rand(38, 48);
  const crabAnim = pick(['float', 'bounce', 'wave', 'wiggle']);
  const crabDur = rand(2.5, 4);
  
  layers.push({
    type: 'emoji',
    emoji: '🦀',
    x: crabX,
    y: crabY,
    size: crabSize,
    anim: crabAnim,
    dur: crabDur,
    delay: rand(0.2, 1),
    z: 50
  });
  
  // Crab glow aura
  layers.push({
    type: 'ellipse',
    x: crabX,
    y: crabY,
    w: crabSize * 1.5,
    h: crabSize * 1.5,
    fill: palette.glow[0],
    opacity: 0.12,
    anim: 'pulse',
    dur: crabDur * 0.8,
    delay: rand(0.3, 1.2),
    z: 49
  });
  
  // ===== LAYER 5: Hat/Accessory =====
  if (hat) {
    layers.push({
      type: 'emoji',
      emoji: hat.emoji,
      x: hat.x + rand(-3, 3),
      y: hat.y + rand(-3, 3),
      size: hat.size + randInt(-2, 4),
      anim: pick(['bounce', 'float', 'spin']),
      dur: rand(2, 3.5),
      delay: rand(0.5, 2),
      z: hat.z + 10
    });
    
    // Hat sparkle
    layers.push({
      type: 'emoji',
      emoji: '✨',
      x: hat.x + rand(-10, 10),
      y: hat.y - rand(5, 15),
      size: rand(10, 14),
      anim: 'spin',
      dur: rand(1.5, 2.5),
      delay: rand(0.8, 2),
      z: hat.z + 11
    });
  }
  
  // ===== LAYER 6: Hand Item =====
  if (handItem) {
    layers.push({
      type: 'emoji',
      emoji: handItem.emoji,
      x: handItem.x + rand(-5, 5),
      y: handItem.y + rand(-5, 5),
      size: handItem.size + randInt(-2, 4),
      anim: pick(['pop', 'float', 'rise', 'bounce']),
      dur: rand(1.8, 3),
      delay: rand(0.6, 2),
      z: handItem.z + 10
    });
    
    // Item trail particles
    for (let i = 0; i < 3; i++) {
      layers.push({
        type: 'emoji',
        emoji: weightedPick(PARTICLE_TYPES),
        x: handItem.x + rand(-15, 15),
        y: handItem.y + rand(-20, 10),
        size: rand(8, 14),
        anim: pick(['rise', 'float', 'spin']),
        dur: rand(1.5, 2.5),
        delay: rand(0.8 + i * 0.3, 2.5 + i * 0.3),
        z: handItem.z + 11 + i
      });
    }
  }
  
  // ===== LAYER 7: Particle System (Telegram-style) =====
  const particleCount = randInt(12, 20);
  for (let i = 0; i < particleCount; i++) {
    const pType = weightedPick(PARTICLE_TYPES);
    const startX = rand(5, 95);
    const startY = rand(5, 95);
    const endX = startX + rand(-30, 30);
    const endY = startY + rand(-40, -10); // Rise up
    const delay = rand(0, 4);
    const dur = rand(2, 5);
    
    layers.push({
      type: 'emoji',
      emoji: pType,
      x: startX,
      y: startY,
      size: rand(6, 14),
      anim: 'rise',
      dur: rand(2.5, 4.5),
      delay: rand(0, 3),
      z: randInt(5, 20),
      // Custom keyframes would go here for more control
    });
  }
  
  // ===== LAYER 8: Shimmer/Sweep Effect (Telegram-style) =====
  for (let i = 0; i < 2; i++) {
    const color = palette.accent[i % palette.accent.length];
    layers.push({
      type: 'ellipse',
      x: 50,
      y: 50,
      w: rand(60, 100),
      h: rand(4, 10),
      fill: palette.accent[i % palette.accent.length],
      opacity: 0.18,
      anim: 'spin',
      dur: rand(8, 14),
      delay: rand(0, 3),
      rot: i * 180,
      z: 2
    });
  }
  
  // ===== LAYER 9: Central Glow/Bloom =====
  layers.push({
    type: 'ellipse',
    x: 50,
    y: 50,
    w: 80,
    h: 80,
    fill: palette.glow[0],
    opacity: 0.08,
    anim: 'pulse',
    dur: rand(3, 5),
    delay: 0,
    z: 0
  });
  
  // ===== LAYER 10: Floating Sparkles (continuous) =====
  for (let i = 0; i < 8; i++) {
    const color = palette.particles[i % palette.particles.length];
    layers.push({
      type: 'emoji',
      emoji: weightedPick(PARTICLE_TYPES),
      x: rand(10, 90),
      y: rand(10, 90),
      size: rand(6, 12),
      anim: pick(['blink', 'spin', 'float']),
      dur: rand(1.2, 2.5),
      delay: rand(0, 2),
      z: randInt(3, 15)
    });
  }
  
  // ===== LAYER 11: Color-shifting Border Glow =====
  layers.push({
    type: 'ellipse',
    x: 50,
    y: 50,
    w: 100,
    h: 100,
    fill: palette.accent[0],
    opacity: 0.04,
    anim: 'spin',
    dur: rand(20, 30),
    delay: 0,
    z: -7
  });
  
  // ===== COMPOSE SCENE =====
  const loop = round2(3 + Math.random() * 2); // 3-5s loop
  
  const layerStrings = layers.map((l, idx) => {
    const props = Object.entries(l).map(([k, v]) => {
      if (typeof v === 'string') return `${k}: "${v}"`;
      if (typeof v === 'number') return `${k}: ${v}`;
      return `${k}: ${v}`;
    }).join(', ');
    return `{ ${props} }`;
  }).join(',\n      ');
  
  const loopDur = round2(3.5 + Math.random() * 1.5); // 3.5-5s
  
  return `${giftId}: {
    v: 1,
    loop: ${loopDur},
    bg: null,
    layers: [
      ${layerStrings}
    ],
  }`;
}

// ===== Main Generation =====
function generateId(theme, index, variant) {
  return `crab_${theme}_${variant}_${index}`;
}

function generateAllScenes(count) {
  const scenes = {};
  
  for (let i = 0; i < count; i++) {
    const theme = THEMES[i % THEMES.length];
    const palette = TG_PALETTES[theme];
    const variant = Math.floor(i / THEMES.length);
    
    const hasHat = Math.random() > 0.35;
    const hasHandItem = Math.random() > 0.3;
    
    const hat = hasHat ? pick(HATS) : null;
    const handItem = hasHandItem ? pick(HAND_ITEMS) : null;
    
    const giftId = `crab_${theme}_${variant}_${i}`;
    const config = { theme, hat, handItem, palette, variant, index: i };
    scenes[giftId] = generateScene(giftId, config);
  }
  
return scenes;
}

// ===== Main =====
const count = parseInt(process.argv[2]) || 20000;
console.log(`Generating ${count} Telegram-style crab gift scenes...`);

const scenes = generateAllScenes(count);
console.log(`Generated ${Object.keys(scenes).length} scenes`);

// Read existing base file
const existing = fs.readFileSync(SCENES_FILE, 'utf8');

// Find insertion marker
  const marker = '  // Additional Telegram-style scenes would be inserted here by build script';
const idx = existing.indexOf(marker);
if (idx === -1) throw new Error('Marker not found in scenes file');

const sceneStrings = Object.values(scenes).map(s => '  ' + s).join(',\n');

const newContent = existing.slice(0, idx) + '\n' + sceneStrings + ',\n' + existing.slice(idx);

fs.writeFileSync(SCENES_FILE, newContent);
console.log(`Scenes file updated with ${Object.keys(scenes).length} new scenes`);