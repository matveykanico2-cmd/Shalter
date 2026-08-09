// Generates a chat-wallpaper doodle tile (Telegram's own tiled line-art
// background style) as a CSS data URI. Parameterized by theme so the same
// generator produces the default 40-icon mix and any themed variant (see
// THEMES below) — public/styles/components.css's .wallpaper-<theme> classes
// each embed one of these tiles' output verbatim.
//
// Usage: node scripts/gen-doodle.js [theme]   (default: "default")
const ALL_ICONS = {
  star: `<path d="M10 0 L12.5 7 L20 7 L14 11.5 L16 19 L10 14.5 L4 19 L6 11.5 L0 7 L7.5 7 Z"/>`,
  sparkle: `<path d="M6 0 L7.5 4.5 L12 6 L7.5 7.5 L6 12 L4.5 7.5 L0 6 L4.5 4.5 Z"/>`,
  heart: `<path d="M10 20 C-6 8 0 -4 10 4 C20 -4 26 8 10 20 Z"/>`,
  plane: `<g><path d="M0 14 L28 0 L18 28 L14 16 Z"/><path d="M14 16 L0 14"/></g>`,
  gift: `<g><rect x="0" y="8" width="24" height="18" rx="2"/><path d="M0 14 H24"/><path d="M12 8 V26"/><path d="M12 8 C6 8 6 0 12 3 C18 0 18 8 12 8 Z"/></g>`,
  cloud: `<path d="M4 20 a8 8 0 0 1 0 -16 a10 10 0 0 1 19 -2 a7 7 0 0 1 -2 18 Z"/>`,
  bulb: `<g><path d="M8 0 C14 4 14 16 8 22 C2 16 2 4 8 0 Z"/><circle cx="8" cy="9" r="2.5"/><path d="M8 22 L4 28 M8 22 L12 28"/><path d="M2 14 L-4 18 M14 14 L20 18"/></g>`,
  balloon: `<g><ellipse cx="10" cy="10" rx="9" ry="11"/><path d="M10 21 L10 34"/><path d="M10 21 L7 24 L10 27 L13 24 Z"/></g>`,
  moon: `<path d="M18 10 A10 10 0 1 1 8 0 A8 8 0 0 0 18 10 Z"/>`,
  cactus: `<g><path d="M6 26 V6 a4 4 0 0 1 8 0 V26"/><path d="M6 12 h-5 a3 3 0 0 0 0 8 h5"/><path d="M14 16 h5 a3 3 0 0 1 0 8 h-5"/><path d="M2 30 H18"/></g>`,
  envelope: `<g><rect x="0" y="0" width="26" height="18" rx="2"/><path d="M0 2 L13 12 L26 2"/></g>`,
  camera: `<g><rect x="0" y="6" width="24" height="16" rx="2"/><path d="M8 6 L10 2 H16 L18 6"/><circle cx="12" cy="14" r="5"/></g>`,
  music: `<g><circle cx="3" cy="20" r="3"/><circle cx="16" cy="17" r="3"/><path d="M6 20 V4 L19 1 V17"/><path d="M6 6 L19 3"/></g>`,
  umbrella: `<g><path d="M0 12 A12 12 0 0 1 24 12 C24 8 18 8 12 12 C6 8 0 8 0 12 Z"/><path d="M12 12 V26 a3 3 0 0 1 -5 2"/></g>`,
  sun: `<g><circle cx="10" cy="10" r="5"/><path d="M10 0 V-4 M10 20 V24 M0 10 H-4 M20 10 H24 M3 3 L0 0 M17 3 L20 0 M3 17 L0 20 M17 17 L20 20"/></g>`,
  rainbow: `<g><path d="M0 20 A16 16 0 0 1 32 20"/><path d="M6 20 A10 10 0 0 1 26 20"/><path d="M12 20 A4 4 0 0 1 20 20"/></g>`,
  key: `<g><circle cx="6" cy="6" r="6"/><path d="M11 10 L24 23"/><path d="M18 17 L22 13 M21 20 L25 16"/></g>`,
  bell: `<g><path d="M2 18 C2 8 4 2 10 2 C16 2 18 8 18 18 H2 Z"/><path d="M0 18 H20"/><path d="M8 22 a2 2 0 0 0 4 0"/></g>`,
  cup: `<g><path d="M2 4 H18 L16 22 a2 2 0 0 1 -2 2 H8 a2 2 0 0 1 -2 -2 Z"/><path d="M18 6 h4 a3 3 0 0 1 0 8 h-3"/><path d="M0 4 H20"/></g>`,
  anchor: `<g><circle cx="10" cy="4" r="3"/><path d="M10 7 V26"/><path d="M2 16 a8 8 0 0 0 16 0"/><path d="M2 12 H18"/></g>`,
  feather: `<g><path d="M18 0 C18 12 8 22 0 24 C4 14 8 6 18 0 Z"/><path d="M14 4 L2 16"/><path d="M0 24 L4 20"/></g>`,
  glasses: `<g><circle cx="5" cy="10" r="5"/><circle cx="19" cy="10" r="5"/><path d="M10 10 H14"/><path d="M0 8 H-3 M24 8 H27"/></g>`,
  headphones: `<g><path d="M0 16 a10 10 0 0 1 20 0"/><rect x="-2" y="14" width="6" height="9" rx="2"/><rect x="16" y="14" width="6" height="9" rx="2"/></g>`,
  controller: `<g><rect x="0" y="6" width="26" height="14" rx="7"/><path d="M6 13 H10 M8 11 V15"/><circle cx="18" cy="11" r="1.6"/><circle cx="21" cy="14" r="1.6"/></g>`,
  kite: `<g><path d="M10 0 L20 10 L10 26 L0 10 Z"/><path d="M0 10 H20"/><path d="M10 0 V26"/><path d="M10 26 L6 32 M10 26 L14 34"/></g>`,
  diamond: `<path d="M0 8 L6 0 H18 L24 8 L12 24 Z M0 8 H24 M6 0 L12 8 L18 0"/>`,
  crown: `<path d="M0 22 L2 6 L8 14 L12 2 L16 14 L22 6 L24 22 Z"/>`,
  flower: `<g><circle cx="10" cy="10" r="3"/><circle cx="10" cy="2" r="3.5"/><circle cx="18" cy="10" r="3.5"/><circle cx="10" cy="18" r="3.5"/><circle cx="2" cy="10" r="3.5"/><path d="M10 21 V30"/></g>`,
  leaf: `<g><path d="M0 20 C0 6 14 0 20 0 C20 12 12 20 0 20 Z"/><path d="M0 20 L20 0"/></g>`,
  paw: `<g><circle cx="10" cy="16" r="6"/><circle cx="1" cy="7" r="2.6"/><circle cx="8" cy="2" r="2.6"/><circle cx="15" cy="2" r="2.6"/><circle cx="20" cy="8" r="2.6"/></g>`,
  clock: `<g><circle cx="10" cy="10" r="10"/><path d="M10 4 V10 L15 13"/></g>`,
  snowflake: `<g><path d="M10 0 V20 M0 10 H20 M2.5 2.5 L17.5 17.5 M2.5 17.5 L17.5 2.5"/><path d="M10 0 L7 3 M10 0 L13 3 M10 20 L7 17 M10 20 L13 17"/></g>`,
  lightning: `<path d="M12 0 L2 14 H9 L6 24 L18 8 H11 Z"/>`,
  pin: `<g><path d="M10 0 A8 8 0 0 1 18 8 C18 15 10 24 10 24 C10 24 2 15 2 8 A8 8 0 0 1 10 0 Z"/><circle cx="10" cy="8" r="3"/></g>`,
  ribbon: `<g><path d="M10 0 L18 6 L10 12 L2 6 Z"/><path d="M6 9 L2 22 L10 18 L18 22 L14 9"/></g>`,
  magnet: `<g><path d="M2 0 V12 a8 8 0 0 0 16 0 V0"/><path d="M2 0 H8 M12 0 H18"/><path d="M2 5 H8 M12 5 H18"/></g>`,
  telescope: `<g><path d="M0 10 L20 2 L23 9 L3 17 Z"/><path d="M3 17 L0 26 M0 22 L6 24"/><circle cx="20" cy="20" r="4"/></g>`,
  satellite: `<g><rect x="6" y="6" width="8" height="8" rx="1" transform="rotate(45 10 10)"/><path d="M2 2 L6 6 M18 2 L14 6 M10 14 L4 24 M13 17 L18 22"/></g>`,
  planet: `<g><circle cx="10" cy="10" r="6"/><ellipse cx="10" cy="10" rx="14" ry="4" transform="rotate(-20 10 10)"/></g>`,
  ghost: `<g><path d="M0 24 V10 a10 10 0 0 1 20 0 V24 L16 20 L12 24 L8 20 L4 24 Z"/><circle cx="6" cy="9" r="1.4" fill="%238774e1"/><circle cx="14" cy="9" r="1.4" fill="%238774e1"/></g>`,
  book: `<g><path d="M10 4 C7 1 2 1 0 2 V22 C2 21 7 21 10 24 C13 21 18 21 20 22 V2 C18 1 13 1 10 4 Z"/><path d="M10 4 V24"/></g>`,
  rocket: `<g><path d="M10 0 C16 4 16 16 10 24 C4 16 4 4 10 0 Z"/><circle cx="10" cy="9" r="2.5"/><path d="M10 24 L6 30 M10 24 L14 30"/><path d="M4 16 L-2 20 M16 16 L22 20"/></g>`,

  // Лес (forest)
  pine: `<g><path d="M10 0 L18 12 H14 L20 22 H0 L6 12 H2 Z"/><path d="M8 22 V28 H12 V22"/></g>`,
  mushroom: `<g><path d="M0 10 A10 10 0 0 1 20 10 Z"/><path d="M6 10 V22 a4 4 0 0 0 8 0 V10"/><circle cx="6" cy="5" r="1.4" fill="%238774e1"/><circle cx="13" cy="4" r="1.4" fill="%238774e1"/></g>`,
  acorn: `<g><path d="M4 10 a6 6 0 0 1 12 0 C16 18 12 24 10 24 C8 24 4 18 4 10 Z"/><path d="M2 10 C2 4 6 2 10 2 C14 2 18 4 18 10 H2 Z"/></g>`,
  owl: `<g><ellipse cx="10" cy="14" rx="10" ry="11"/><circle cx="6" cy="11" r="3.4"/><circle cx="14" cy="11" r="3.4"/><circle cx="6" cy="11" r="1.3" fill="%238774e1"/><circle cx="14" cy="11" r="1.3" fill="%238774e1"/><path d="M10 14 L8 18 H12 Z"/><path d="M2 4 L6 7 M18 4 L14 7"/></g>`,
  campfire: `<g><path d="M0 24 H20"/><path d="M4 24 L8 18 M16 24 L12 18 M2 24 L6 20"/><path d="M10 4 C6 10 6 14 10 18 C14 14 14 10 10 4 Z"/><path d="M10 10 C8 13 8 15 10 17 C12 15 12 13 10 10 Z"/></g>`,
  deerhead: `<g><path d="M10 8 a6 6 0 1 1 0 12 a6 6 0 0 1 0 -12 Z"/><path d="M6 6 C4 2 0 2 -1 -1 M6 6 C7 1 5 -2 3 -4 M14 6 C16 2 20 2 21 -1 M14 6 C13 1 15 -2 17 -4"/><circle cx="7" cy="12" r="1" fill="%238774e1"/><circle cx="13" cy="12" r="1" fill="%238774e1"/></g>`,
  berry: `<g><circle cx="5" cy="14" r="4.5"/><circle cx="12" cy="10" r="4.5"/><circle cx="14" cy="17" r="4.5"/><path d="M10 4 C10 1 12 0 14 0"/><path d="M10 4 L8 8"/></g>`,
  fox: `<g><path d="M10 22 C2 22 0 14 0 8 L6 12 L10 2 L14 12 L20 8 C20 14 18 22 10 22 Z"/><circle cx="7" cy="12" r="1.2" fill="%238774e1"/><circle cx="13" cy="12" r="1.2" fill="%238774e1"/><path d="M8 17 Q10 19 12 17"/></g>`,
  hedgehog: `<g><path d="M2 18 C0 10 6 4 12 4 C18 4 20 12 18 18 Z"/><path d="M4 4 L6 8 M8 1 L9 6 M12 0 L12 6 M16 1 L15 6 M19 4 L17 8"/><circle cx="15" cy="10" r="1" fill="%238774e1"/></g>`,
  wood_log: `<g><rect x="0" y="6" width="24" height="10" rx="5"/><ellipse cx="24" cy="11" rx="4" ry="5"/><circle cx="24" cy="11" r="2" fill="%238774e1"/></g>`,

  // Школа (school)
  pencil: `<g><path d="M2 22 L0 28 L6 26 L22 10 L18 6 Z"/><path d="M15 9 L19 13"/></g>`,
  ruler: `<g><rect x="0" y="0" width="26" height="10" rx="1"/><path d="M4 0 V4 M8 0 V4 M12 0 V4 M16 0 V4 M20 0 V4"/></g>`,
  apple2: `<g><path d="M10 6 C4 6 2 12 2 16 a6 6 0 0 0 12 0 C18 20 20 16 20 12 C20 8 16 5 12 8 C11 6 10 6 10 6 Z"/><path d="M11 6 C11 2 14 1 15 0"/></g>`,
  backpack: `<g><rect x="1" y="8" width="18" height="16" rx="4"/><path d="M5 8 V4 a5 5 0 0 1 10 0 V8"/><rect x="6" y="12" width="8" height="5" rx="1"/><path d="M1 14 H-2 M19 14 H22"/></g>`,
  alarm: `<g><circle cx="10" cy="12" r="9"/><path d="M10 7 V12 L14 15"/><path d="M3 3 L6 6 M17 3 L14 6"/><path d="M2 21 L5 23 M18 21 L15 23"/></g>`,
  globe2: `<g><circle cx="10" cy="10" r="10"/><ellipse cx="10" cy="10" rx="4.5" ry="10"/><path d="M0 10 H20"/><path d="M2 5 H18 M2 15 H18"/></g>`,
  notebook: `<g><rect x="0" y="0" width="18" height="24" rx="2"/><path d="M4 6 H14 M4 11 H14 M4 16 H10"/><path d="M0 4 h2 M0 9 h2 M0 14 h2 M0 19 h2"/></g>`,
  palette: `<g><path d="M11 0 C3 0 -1 6 1 12 C2 15 5 15 6 13 C7 11 10 12 10 15 a5 5 0 0 0 5 5 C21 20 22 12 20 8 C18 3 15 0 11 0 Z"/><circle cx="5" cy="6" r="1.4" fill="%238774e1"/><circle cx="10" cy="4" r="1.4" fill="%238774e1"/><circle cx="15" cy="6" r="1.4" fill="%238774e1"/></g>`,
  scissors: `<g><circle cx="3" cy="3" r="3"/><circle cx="3" cy="19" r="3"/><path d="M5 5 L21 19 M5 19 L21 3"/></g>`,
  calculator: `<g><rect x="0" y="0" width="16" height="22" rx="2"/><rect x="3" y="3" width="10" height="5" rx="1"/><circle cx="4.5" cy="13" r="1.4"/><circle cx="8" cy="13" r="1.4"/><circle cx="11.5" cy="13" r="1.4"/><circle cx="4.5" cy="18" r="1.4"/><circle cx="8" cy="18" r="1.4"/><circle cx="11.5" cy="18" r="1.4"/></g>`,

  // Универ (university)
  gradcap: `<g><path d="M0 8 L16 2 L32 8 L16 14 Z"/><path d="M8 10 V16 C8 19 24 19 24 16 V10"/><path d="M28 8 V18"/><circle cx="28" cy="20" r="1.6" fill="%238774e1"/></g>`,
  diploma: `<g><rect x="2" y="0" width="16" height="20" rx="1"/><path d="M0 4 a2 2 0 0 1 0 -4 M20 4 a2 2 0 0 0 0 -4 M0 4 V0 M20 4 V0"/><path d="M6 6 H14 M6 10 H14 M6 14 H10"/></g>`,
  bookstack: `<g><rect x="0" y="16" width="22" height="5" rx="1"/><rect x="2" y="9" width="18" height="5" rx="1" transform="rotate(-2 11 11)"/><rect x="1" y="2" width="16" height="5" rx="1" transform="rotate(3 9 4)"/></g>`,
  laptop: `<g><rect x="0" y="0" width="22" height="14" rx="1"/><path d="M-2 14 H24 L21 18 H1 Z"/><path d="M4 4 H18 V10 H4 Z"/></g>`,
  microscope: `<g><path d="M6 24 H18"/><path d="M9 24 V18"/><rect x="4" y="16" width="10" height="3" rx="1"/><path d="M9 16 V8 L16 2"/><circle cx="17" cy="1" r="2.4"/><path d="M6 12 H14"/></g>`,
  chart: `<g><path d="M0 22 H22"/><rect x="2" y="14" width="4" height="8"/><rect x="9" y="8" width="4" height="14"/><rect x="16" y="4" width="4" height="18"/></g>`,
  compass2: `<g><circle cx="10" cy="10" r="10"/><path d="M13 6 L8 12 L7 14 L12 8 Z" fill="%238774e1" stroke="none"/></g>`,

  // Снег (snow)
  icicle: `<g><path d="M0 0 V0 H18"/><path d="M2 0 L2 14 L0 20 L4 16 Z"/><path d="M9 0 L9 18 L7 26 L11 20 Z"/><path d="M16 0 L16 12 L14 18 L18 15 Z"/></g>`,
  mitten: `<g><path d="M2 20 V8 a6 6 0 0 1 12 0 V20 Z"/><path d="M2 12 h-4 a3 3 0 0 0 0 8 h4"/><path d="M0 20 H16"/></g>`,
  sled: `<g><rect x="2" y="8" width="18" height="8" rx="1"/><path d="M2 8 C0 8 0 4 4 4 H16 C20 4 20 8 18 8"/><path d="M0 18 H22"/><path d="M2 18 L4 22 M20 18 L18 22"/></g>`,
  pinecone: `<g><path d="M10 0 C4 0 2 8 2 14 C2 20 6 24 10 24 C14 24 18 20 18 14 C18 8 16 0 10 0 Z"/><path d="M4 6 H16 M3 11 H17 M3 16 H17 M5 21 H15"/></g>`,

  // Зима (winter)
  snowman: `<g><circle cx="10" cy="20" r="8"/><circle cx="10" cy="8" r="5.5"/><circle cx="8" cy="7" r="0.8" fill="%238774e1"/><circle cx="12" cy="7" r="0.8" fill="%238774e1"/><path d="M10 9 L14 10"/><path d="M4 20 H-1 M16 20 H21 M3 24 H-2 M17 24 H22"/></g>`,
  scarf: `<g><path d="M0 4 H20"/><path d="M0 4 C0 10 4 8 4 14 C4 18 0 18 0 22"/><path d="M20 4 C20 10 16 8 16 14 C16 18 20 18 20 22"/><path d="M0 18 H4 M16 18 H20"/></g>`,
  hotcocoa: `<g><path d="M2 10 H18 L16 22 a2 2 0 0 1 -2 2 H6 a2 2 0 0 1 -2 -2 Z"/><path d="M18 12 h3 a3 3 0 0 1 0 7 h-2"/><path d="M6 6 C6 3 9 3 8 0 M12 6 C12 3 15 3 14 0"/></g>`,
  skis: `<g><path d="M2 24 L0 22 L2 4 a2 2 0 0 1 4 0 L4 22 L6 24"/><path d="M14 24 L12 22 L14 4 a2 2 0 0 1 4 0 L16 22 L18 24"/><rect x="0" y="10" width="6" height="4" rx="1"/><rect x="12" y="10" width="6" height="4" rx="1"/></g>`,

  // Весна (spring)
  tulip: `<g><path d="M10 20 V10"/><path d="M10 10 C4 10 4 2 10 4 C16 2 16 10 10 10 Z"/><path d="M10 14 C6 14 4 18 2 18 M10 14 C14 14 16 18 18 18"/></g>`,
  butterfly: `<g><path d="M10 4 V20"/><path d="M10 8 C4 2 -2 6 2 12 C6 16 10 12 10 8 Z"/><path d="M10 8 C16 2 22 6 18 12 C14 16 10 12 10 8 Z"/><path d="M10 4 L8 1 M10 4 L12 1"/></g>`,
  raindrop: `<path d="M8 0 C8 8 0 12 0 18 a8 8 0 0 0 16 0 C16 12 8 8 8 0 Z"/>`,
  sprout: `<g><path d="M10 24 V12"/><path d="M10 12 C4 12 2 6 2 2 C8 2 10 8 10 12 Z"/><path d="M10 8 C16 8 18 3 18 0 C13 0 10 4 10 8 Z"/></g>`,

  // Лето (summer)
  icecream: `<g><path d="M4 8 a6 6 0 0 1 12 0 Z"/><path d="M4 8 L10 24 L16 8"/><path d="M4 8 H16"/></g>`,
  beachball: `<g><circle cx="10" cy="10" r="10"/><path d="M10 0 C4 4 4 16 10 20 M10 0 C16 4 16 16 10 20 M0 10 H20"/></g>`,
  watermelon: `<g><path d="M0 10 A10 10 0 0 1 20 10 Z"/><path d="M2 10 A8 8 0 0 1 18 10"/><circle cx="7" cy="7" r="0.8" fill="%238774e1"/><circle cx="13" cy="7" r="0.8" fill="%238774e1"/><circle cx="10" cy="4" r="0.8" fill="%238774e1"/></g>`,
  seashell: `<g><path d="M10 0 C2 4 2 16 10 20 C18 16 18 4 10 0 Z"/><path d="M10 0 V20 M6 3 V17 M14 3 V17"/></g>`,

  // Осень (autumn)
  mapleleaf: `<g><path d="M10 0 L12 6 L18 4 L14 9 L20 11 L13 12 L15 18 L10 14 L5 18 L7 12 L0 11 L6 9 L2 4 L8 6 Z"/><path d="M10 14 V22"/></g>`,
  pumpkin: `<g><path d="M2 14 C2 8 6 6 10 6 C14 6 18 8 18 14 C18 19 14 22 10 22 C6 22 2 19 2 14 Z"/><path d="M6 8 V20 M10 6 V22 M14 8 V20"/><path d="M10 6 C10 2 12 1 13 0"/></g>`,
  chestnut: `<g><ellipse cx="10" cy="12" rx="8" ry="9"/><path d="M4 8 L16 8 M3 12 L17 12 M4 16 L16 16"/></g>`,

  // Любовь (love)
  rose: `<g><circle cx="10" cy="8" r="5"/><path d="M6 6 a4 4 0 0 1 8 0"/><path d="M10 13 V24"/><path d="M10 17 C6 17 4 19 2 19 M10 19 C14 19 16 21 18 21"/></g>`,
  ring: `<g><circle cx="10" cy="14" r="6"/><path d="M10 8 L7 2 H13 Z"/></g>`,
  loveletter: `<g><rect x="0" y="0" width="26" height="18" rx="2"/><path d="M0 2 L13 12 L26 2"/><path d="M13 5 C11 2 8 3 8 6 C8 8.5 13 11 13 11 C13 11 18 8.5 18 6 C18 3 15 2 13 5 Z" fill="%238774e1" stroke="none"/></g>`,
  cupidarrow: `<g><circle cx="5" cy="5" r="5"/><path d="M8 8 L22 22"/><path d="M22 22 L16 22 M22 22 L22 16"/><path d="M14 14 L18 10 L20 12 Z"/></g>`,
  dove: `<g><path d="M2 14 C2 8 8 4 14 6 C12 4 12 1 14 0 C16 3 16 6 14 8 C18 8 20 12 18 16 C14 14 10 14 8 16 C6 18 3 18 2 14 Z"/><circle cx="15" cy="6" r="0.9" fill="%238774e1"/></g>`,
};

const THEMES = {
  default: [
    "star", "sparkle", "heart", "plane", "gift", "cloud", "bulb", "balloon", "moon", "cactus",
    "envelope", "camera", "music", "umbrella", "sun", "rainbow", "key", "bell", "cup", "anchor",
    "feather", "glasses", "headphones", "controller", "kite", "diamond", "crown", "flower", "leaf", "paw",
    "clock", "snowflake", "lightning", "pin", "ribbon", "magnet", "telescope", "satellite", "planet", "ghost",
  ],
  forest: [
    "pine", "leaf", "mushroom", "acorn", "owl", "campfire", "deerhead", "berry", "fox", "hedgehog",
    "moon", "star", "cloud", "wood_log", "feather", "snowflake", "sun", "pine", "mushroom", "leaf",
  ],
  school: [
    "pencil", "ruler", "book", "apple2", "backpack", "alarm", "globe2", "notebook", "palette", "scissors",
    "calculator", "bell", "star", "clock", "bulb", "pencil", "book", "ruler", "apple2", "notebook",
  ],
  university: [
    "gradcap", "diploma", "bookstack", "laptop", "cup", "bulb", "owl", "pencil", "microscope", "clock",
    "backpack", "chart", "star", "compass2", "gradcap", "bookstack", "diploma", "laptop", "cup", "bulb",
  ],

  // 20 seasonal/mood wallpapers — Настройки → Внешний вид → «Фон чата», and
  // the per-chat picker (chatView.js's "Фон чата" menu item). Several named
  // variants per category share the same icon pool but get a different
  // layout because generate()'s seed is derived from the theme name string
  // itself (see mulberry32 call below) — "snow-1" vs "snow-2" hash to
  // different seeds even with identical ALL_ICONS input.
  "snow-1": ["snowflake", "icicle", "mitten", "sled", "pinecone", "cloud", "star", "snowflake", "icicle", "cloud"],
  "snow-2": ["snowflake", "icicle", "mitten", "sled", "pinecone", "cloud", "star", "snowflake", "icicle", "cloud"],
  "snow-3": ["snowflake", "icicle", "mitten", "sled", "pinecone", "cloud", "star", "snowflake", "icicle", "cloud"],
  "winter-1": ["snowman", "scarf", "hotcocoa", "skis", "mitten", "snowflake", "star", "snowman", "scarf", "hotcocoa"],
  "winter-2": ["snowman", "scarf", "hotcocoa", "skis", "mitten", "snowflake", "star", "snowman", "scarf", "hotcocoa"],
  "winter-3": ["snowman", "scarf", "hotcocoa", "skis", "mitten", "snowflake", "star", "snowman", "scarf", "hotcocoa"],
  "spring-1": ["tulip", "butterfly", "raindrop", "sprout", "flower", "umbrella", "rainbow", "tulip", "butterfly", "sprout"],
  "spring-2": ["tulip", "butterfly", "raindrop", "sprout", "flower", "umbrella", "rainbow", "tulip", "butterfly", "sprout"],
  "spring-3": ["tulip", "butterfly", "raindrop", "sprout", "flower", "umbrella", "rainbow", "tulip", "butterfly", "sprout"],
  "summer-1": ["sun", "icecream", "beachball", "watermelon", "seashell", "glasses", "sun", "icecream", "beachball", "seashell"],
  "summer-2": ["sun", "icecream", "beachball", "watermelon", "seashell", "glasses", "sun", "icecream", "beachball", "seashell"],
  "summer-3": ["sun", "icecream", "beachball", "watermelon", "seashell", "glasses", "sun", "icecream", "beachball", "seashell"],
  "summer-4": ["sun", "icecream", "beachball", "watermelon", "seashell", "glasses", "sun", "icecream", "beachball", "seashell"],
  "autumn-1": ["mapleleaf", "pumpkin", "chestnut", "leaf", "acorn", "umbrella", "mushroom", "mapleleaf", "pumpkin", "leaf"],
  "autumn-2": ["mapleleaf", "pumpkin", "chestnut", "leaf", "acorn", "umbrella", "mushroom", "mapleleaf", "pumpkin", "leaf"],
  "autumn-3": ["mapleleaf", "pumpkin", "chestnut", "leaf", "acorn", "umbrella", "mushroom", "mapleleaf", "pumpkin", "leaf"],
  "love-1": ["heart", "rose", "ring", "loveletter", "cupidarrow", "dove", "heart", "rose", "loveletter", "heart"],
  "love-2": ["heart", "rose", "ring", "loveletter", "cupidarrow", "dove", "heart", "rose", "loveletter", "heart"],
  "love-3": ["heart", "rose", "ring", "loveletter", "cupidarrow", "dove", "heart", "rose", "loveletter", "heart"],
  "love-4": ["heart", "rose", "ring", "loveletter", "cupidarrow", "dove", "heart", "rose", "loveletter", "heart"],
};

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A chat bubble can run up to 70% of the message column's width (see
// components.css's .message-column max-width), starting flush from
// whichever edge its sender's side hugs — so the two edges of the tile are
// what actually stays visible behind bubbles, not the middle. Icons are
// placed in a left and a right band only (each 30% of the tile), leaving
// the center 40% empty, instead of the old even 8-column spread across the
// whole width (which mostly ended up hidden under bubble text).
function generate(themeName) {
  const names = THEMES[themeName];
  if (!names) throw new Error(`unknown theme "${themeName}" — options: ${Object.keys(THEMES).join(", ")}`);
  const rand = mulberry32(themeName === "default" ? 42 : [...themeName].reduce((a, c) => a + c.charCodeAt(0), 0));

  const TILE = 640;
  const cols = 2; // icon columns per band
  const perRow = cols * 2; // left band + right band
  const rows = Math.ceil(names.length / perRow);
  const cellH = TILE / rows;
  const bandW = TILE * 0.3;
  const bandMargin = TILE * 0.015;
  const bandX = [bandMargin, TILE - bandW - bandMargin]; // left band, right band
  const cellW = bandW / cols;

  let groups = "";
  let i = 0;
  for (let r = 0; r < rows; r++) {
    for (let slot = 0; slot < perRow; slot++) {
      if (i >= names.length) break;
      const name = names[i % names.length];
      i++;
      const side = slot < cols ? 0 : 1;
      const colInSide = slot < cols ? slot : slot - cols;
      const jitterX = (rand() - 0.5) * cellW * 0.4;
      const jitterY = (rand() - 0.5) * cellH * 0.5;
      const x = Math.round(bandX[side] + colInSide * cellW + cellW / 2 + jitterX - 10);
      const y = Math.round(r * cellH + cellH / 2 + jitterY - 10);
      const rot = Math.round((rand() - 0.5) * 40);
      const scale = (0.7 + rand() * 0.5).toFixed(2);
      groups += `<g transform="translate(${x},${y}) rotate(${rot}) scale(${scale})">${ALL_ICONS[name]}</g>`;
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE}" height="${TILE}" viewBox="0 0 ${TILE} ${TILE}"><g fill="none" stroke="%238774e1" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.15">${groups}</g></svg>`;
  const encoded = svg.replace(/#/g, "%23").replace(/"/g, "'").replace(/</g, "%3C").replace(/>/g, "%3E");
  return { encoded: "data:image/svg+xml," + encoded, count: i };
}

if (require.main === module) {
  const theme = process.argv[2] || "default";
  const { encoded, count } = generate(theme);
  console.error(`theme "${theme}": ${count} icons placed`);
  process.stdout.write(encoded + "\n");
}

module.exports = { generate, THEMES };
