import { characterFor, renderCharacter } from "./characters.js";
import { artFor, renderArt } from "./drawnArt.js";

export const SCENES = {
  bear_honey: {
    parts: [
      { anim: "wave", dur: 1.6 },
      { e: "🍯", anim: "rise", delay: 1.1, x: 34, y: 22, size: 0.42, dur: 2.1 },
      { e: "🥄", anim: "dip", delay: 1.9, x: 40, y: 4, size: 0.36, dur: 1.4 },
    ],
    loop: 3.6,
  },
  rock_blink: {
    parts: [
      { anim: "settle", dur: 3.2 },
      { e: "👀", anim: "blink", delay: 1.2, x: 0, y: -6, size: 0.3, dur: 2 },
    ],
    loop: 3.2,
  },
  cat_yarn: {
    parts: [
      { anim: "wiggle", dur: 1.4 },
      { e: "🧶", anim: "roll", delay: 0.8, x: -36, y: 24, size: 0.4, dur: 2.4 },
    ],
    loop: 3.2,
  },
  coffee_steam: {
    parts: [
      { anim: "settle", dur: 3 },
      { e: "💨", anim: "steam", delay: 0.2, x: 12, y: -30, size: 0.34, dur: 2.2 },
      { e: "💨", anim: "steam", delay: 1.1, x: -8, y: -34, size: 0.26, dur: 2.2 },
    ],
    loop: 3,
  },
  cake_candle: {
    parts: [
      { anim: "settle", dur: 3 },
      { e: "✨", anim: "twinkle", delay: 0.3, x: -30, y: -26, size: 0.3, dur: 1.6 },
      { e: "✨", anim: "twinkle", delay: 1.0, x: 30, y: -20, size: 0.24, dur: 1.6 },
    ],
    loop: 3,
  },
  rocket_launch: {
    parts: [
      { anim: "launch", dur: 2.6 },
      { e: "💨", anim: "steam", delay: 0.9, x: -18, y: 30, size: 0.3, dur: 1.8 },
    ],
    loop: 2.8,
  },
  heart_beat: {
    parts: [
      { anim: "beat", dur: 1.1 },
      { e: "💗", anim: "rise", delay: 0.7, x: 30, y: 10, size: 0.32, dur: 2 },
    ],
    loop: 2.8,
  },
  party_pop: {
    parts: [
      { anim: "tada", dur: 1.4 },
      { e: "🎊", anim: "burst", delay: 0.5, x: -34, y: -14, size: 0.34, dur: 1.8 },
      { e: "✨", anim: "burst", delay: 0.9, x: 34, y: -20, size: 0.3, dur: 1.8 },
    ],
    loop: 2.8,
  },
  crown_shine: {
    parts: [
      { anim: "float", dur: 2.6 },
      { e: "✨", anim: "twinkle", delay: 0.4, x: 32, y: -18, size: 0.28, dur: 1.6 },
      { e: "✨", anim: "twinkle", delay: 1.3, x: -30, y: -10, size: 0.22, dur: 1.6 },
    ],
    loop: 2.8,
  },
  sleep_z: {
    parts: [
      { anim: "breathe", dur: 2.8 },
      { e: "💤", anim: "rise", delay: 0.6, x: 32, y: -14, size: 0.34, dur: 2.4 },
    ],
    loop: 3.2,
  },
  fire_burn: {
    parts: [
      { anim: "flicker", dur: 0.9 },
      { e: "✨", anim: "rise", delay: 0.5, x: 22, y: 6, size: 0.24, dur: 1.6 },
    ],
    loop: 2.2,
  },
  money_rain: {
    parts: [
      { anim: "wiggle", dur: 1.6 },
      { e: "💸", anim: "fall", delay: 0.6, x: -30, y: -30, size: 0.34, dur: 2.2 },
      { e: "💸", anim: "fall", delay: 1.4, x: 28, y: -34, size: 0.28, dur: 2.2 },
    ],
    loop: 3.2,
  },
  gift_open: {
    parts: [
      { anim: "shake-hard", dur: 1.6 },
      { e: "🎀", anim: "lid", delay: 0, y: -30, size: 0.4, dur: 1.6 },
      { e: "✨", anim: "emerge", delay: 0, y: -6, size: 0.5, dur: 1.6 },
      { e: "🌟", anim: "burst", delay: 1.05, x: 34, y: -26, size: 0.3, dur: 1 },
      { e: "🌟", anim: "burst", delay: 1.2, x: -32, y: -18, size: 0.26, dur: 1 },
    ],
    loop: 2.6,
  },
  wave_hi: {
    parts: [
      { anim: "wave", dur: 1.5 },
      { e: "Hi!", anim: "hi", delay: 0.35, x: 30, y: -34, size: 0.34, dur: 2.4 },
    ],
    loop: 2.6,
  },
  gasp_open: {
    parts: [
      { anim: "gasp", dur: 1.8 },
      { e: "❗", anim: "hi", delay: 0.8, x: 32, y: -30, size: 0.3, dur: 1.8 },
    ],
    loop: 2.2,
  },
  flame_live: {
    parts: [
      { anim: "burn", dur: 1.1 },
      { e: "✨", anim: "ember", delay: 0.2, x: 10, y: -10, size: 0.24, dur: 1.8 },
      { e: "✨", anim: "ember", delay: 0.9, x: -14, y: -6, size: 0.2, dur: 1.8 },
    ],
    loop: 2.2,
  },
  laugh_tears: {
    parts: [
      { anim: "jump", dur: 1.5 },
      { e: "💧", anim: "tears", delay: 0.5, x: -26, y: -8, size: 0.24, dur: 1.6 },
      { e: "💧", anim: "tears", delay: 0.9, x: 26, y: -8, size: 0.24, dur: 1.6 },
    ],
    loop: 2.4,
  },
  cry_river: {
    parts: [
      { anim: "settle", dur: 2.4 },
      { e: "💦", anim: "tears", delay: 0.2, x: -22, y: 0, size: 0.3, dur: 1.6 },
      { e: "💦", anim: "tears", delay: 0.8, x: 22, y: 0, size: 0.3, dur: 1.6 },
    ],
    loop: 2.4,
  },
  thumbs_pop: {
    parts: [
      { anim: "pop", dur: 1.4 },
      { e: "✨", anim: "burst", delay: 0.9, x: 30, y: -24, size: 0.3, dur: 1 },
    ],
    loop: 2,
  },
  clap_hands: {
    parts: [
      { anim: "pop", dur: 1 },
      { e: "✨", anim: "burst", delay: 0.6, x: -28, y: -22, size: 0.26, dur: 0.9 },
      { e: "✨", anim: "burst", delay: 0.75, x: 28, y: -22, size: 0.26, dur: 0.9 },
    ],
    loop: 1.8,
  },
  music_notes: {
    parts: [
      { anim: "swing", dur: 1.8 },
      { e: "🎵", anim: "notes", delay: 0.2, x: 26, y: -10, size: 0.3, dur: 2.6 },
      { e: "🎶", anim: "notes", delay: 1.2, x: -22, y: -6, size: 0.28, dur: 2.6 },
    ],
    loop: 3.2,
  },
  snow_fall: {
    parts: [
      { anim: "breathe", dur: 3 },
      { e: "❄️", anim: "drift", delay: 0, x: -30, y: 0, size: 0.24, dur: 3.4 },
      { e: "❄️", anim: "drift", delay: 1.2, x: 26, y: 0, size: 0.2, dur: 3.4 },
      { e: "❄️", anim: "drift", delay: 2.2, x: 4, y: 0, size: 0.18, dur: 3.4 },
    ],
    loop: 3.6,
  },
  storm_flash: {
    parts: [
      { anim: "settle", dur: 1.5 },
      { e: "⚡", anim: "flash", delay: 0, x: 0, y: 0, size: 0.9, dur: 1.5 },
    ],
    loop: 2.2,
  },
  boom: {
    parts: [
      { anim: "shake-hard", dur: 1.6 },
      { e: "💥", anim: "flash", delay: 0.9, x: 0, y: -10, size: 1, dur: 1.5 },
    ],
    loop: 2.6,
  },
  rose_bloom: {
    parts: [
      { anim: "bloom", dur: 2.8 },
      { e: "✨", anim: "twinkle", delay: 0.9, x: 28, y: -22, size: 0.26, dur: 1.8 },
    ],
    loop: 3,
  },
  ring_shine: {
    parts: [
      { anim: "spin", dur: 3.4 },
      { e: "✨", anim: "twinkle", delay: 0.4, x: 26, y: -24, size: 0.3, dur: 1.6 },
      { e: "💫", anim: "twinkle", delay: 1.4, x: -26, y: 18, size: 0.26, dur: 1.6 },
    ],
    loop: 3.4,
  },
  champagne_pop: {
    parts: [
      { anim: "shake-hard", dur: 1.6 },
      { e: "🥂", anim: "emerge", delay: 0, x: 26, y: 10, size: 0.44, dur: 1.6 },
      { e: "🎊", anim: "burst", delay: 1.1, x: -24, y: -26, size: 0.3, dur: 1 },
    ],
    loop: 2.6,
  },
};

const SOLO = ["wave", "wiggle", "beat", "float", "tada", "swing", "flicker", "breathe", "settle"];

const BY_EMOJI = {
  "🐻": "bear_honey",
  "🍯": "bear_honey",
  "🗿": "rock_blink",
  "🪨": "rock_blink",
  "🐱": "cat_yarn",
  "🐈": "cat_yarn",
  "😺": "cat_yarn",
  "☕": "coffee_steam",
  "🍵": "coffee_steam",
  "🎂": "cake_candle",
  "🍰": "cake_candle",
  "🚀": "rocket_launch",
  "❤️": "heart_beat",
  "💖": "heart_beat",
  "😍": "heart_beat",
  "😘": "heart_beat",
  "🥳": "party_pop",
  "🎉": "party_pop",
  "🎊": "party_pop",
  "👑": "crown_shine",
  "💎": "crown_shine",
  "🌟": "crown_shine",
  "💠": "crown_shine",
  "😴": "sleep_z",
  "🥱": "sleep_z",
  "🔥": "fire_burn",
  "💰": "money_rain",
  "💵": "money_rain",
  "🤑": "money_rain",

  "🎁": "gift_open",
  "🎀": "gift_open",
  "📦": "gift_open",
  "👋": "wave_hi",
  "🤚": "wave_hi",
  "🖐️": "wave_hi",
  "😮": "gasp_open",
  "😲": "gasp_open",
  "😯": "gasp_open",
  "🤯": "gasp_open",
  "😱": "gasp_open",
  "🔥": "flame_live",
  "🕯️": "flame_live",
  "😂": "laugh_tears",
  "🤣": "laugh_tears",
  "😹": "laugh_tears",
  "😭": "cry_river",
  "😢": "cry_river",
  "👍": "thumbs_pop",
  "🙌": "thumbs_pop",
  "👏": "clap_hands",
  "🎵": "music_notes",
  "🎶": "music_notes",
  "🎧": "music_notes",
  "🎸": "music_notes",
  "❄️": "snow_fall",
  "☃️": "snow_fall",
  "⛄": "snow_fall",
  "⚡": "storm_flash",
  "🌩️": "storm_flash",
  "💥": "boom",
  "💣": "boom",
  "🌹": "rose_bloom",
  "🌸": "rose_bloom",
  "🌺": "rose_bloom",
  "🌷": "rose_bloom",
  "💍": "ring_shine",
  "💐": "rose_bloom",
  "🍾": "champagne_pop",
  "🥂": "champagne_pop",
  "🍷": "champagne_pop",
};

function soloFor(emoji) {
  let hash = 0;
  for (const ch of String(emoji ?? "")) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  return SOLO[hash % SOLO.length];
}

export function sceneFor(emoji, preferred) {
  if (preferred && SCENES[preferred]) return SCENES[preferred];
  const named = BY_EMOJI[emoji];
  if (named && SCENES[named]) return SCENES[named];
  return { parts: [{ anim: soloFor(emoji) }], loop: 0 };
}

export function renderScene(emoji, { size = 84, preferred, replay = true } = {}) {
  const artId = artFor(emoji, preferred);
  if (artId) {
    const node = renderArt(artId, { size });
    if (node) {
      node.classList.add(replay ? "anim-scene-entrance" : "no-entrance");
      return node;
    }
  }

  const charId = characterFor(emoji, preferred);
  if (charId) {
    const node = renderCharacter(charId, { size });
    if (node) {
      if (!replay) node.classList.add("no-entrance");
      else node.classList.add("anim-scene-entrance");
      return node;
    }
  }

  const scene = sceneFor(emoji, preferred);
  const root = document.createElement("div");
  root.className = `anim-scene ${replay ? "" : "no-entrance"}`;
  root.style.width = `${size}px`;
  root.style.height = `${size}px`;
  root.style.fontSize = `${size}px`;

  scene.parts.forEach((part, i) => {
    const span = document.createElement("span");
    span.className = `scene-part scene-${part.anim}`;
    span.textContent = part.e ?? emoji;
    const style = span.style;
    if (i > 0) {
      style.position = "absolute";
      style.left = "50%";
      style.top = "50%";
      style.fontSize = `${Math.round(size * (part.size ?? 0.4))}px`;
      style.setProperty("--x", `${part.x ?? 0}%`);
      style.setProperty("--y", `${part.y ?? 0}%`);
      style.marginLeft = `${((part.x ?? 0) / 100) * size}px`;
      style.marginTop = `${((part.y ?? 0) / 100) * size}px`;
      style.transform = "translate(-50%, -50%)";
    }
    if (part.delay) style.animationDelay = `${part.delay}s`;
    if (part.dur) style.animationDuration = `${part.dur}s`;
    root.appendChild(span);
  });

  return root;
}
