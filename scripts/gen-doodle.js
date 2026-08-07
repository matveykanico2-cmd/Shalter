// Generates the 40-icon chat-wallpaper doodle tile as an SVG data URI,
// matching Telegram's tiled line-art background style.
const icons = {
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
};

const names = Object.keys(icons);
// deterministic pseudo-random layout across a large tile, scattered like Telegram's doodle.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(42);

const TILE = 640;
const cols = 8, rows = 5;
const cellW = TILE / cols, cellH = TILE / rows;
let groups = "";
let i = 0;
for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    const name = names[i % names.length];
    i++;
    const jitterX = (rand() - 0.5) * cellW * 0.5;
    const jitterY = (rand() - 0.5) * cellH * 0.5;
    const x = Math.round(c * cellW + cellW / 2 + jitterX - 10);
    const y = Math.round(r * cellH + cellH / 2 + jitterY - 10);
    const rot = Math.round((rand() - 0.5) * 40);
    const scale = (0.7 + rand() * 0.5).toFixed(2);
    groups += `<g transform="translate(${x},${y}) rotate(${rot}) scale(${scale})">${icons[name]}</g>`;
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE}" height="${TILE}" viewBox="0 0 ${TILE} ${TILE}"><g fill="none" stroke="%238774e1" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.15">${groups}</g></svg>`;

// Encode for embedding in a CSS `url("data:image/svg+xml,...")` string: single
// quotes for SVG attrs (the outer CSS string already uses double quotes) and
// percent-escape '#', '<', '>' so it's valid inside the url() token.
const encoded = svg
  .replace(/#/g, "%23")
  .replace(/"/g, "'")
  .replace(/</g, "%3C")
  .replace(/>/g, "%3E");

console.error(`used ${names.length} distinct icons, ${i} placed`);
process.stdout.write("data:image/svg+xml," + encoded + "\n");
