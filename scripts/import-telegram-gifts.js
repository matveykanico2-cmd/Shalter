// Импорт данных коллекционных подарков из репозитория telegram-gifts (рядом с проектом):
//   node scripts/import-telegram-gifts.js [путь к telegram-gifts]
// Пишет:
//   public/gift-symbols/<id>.webp     — узоры (символы) для фона коллекционных подарков
//   public/js/lib/tgGiftData.js       — фоны, узоры и модели с настоящей редкостью из записей коллекций
//   public/tgs/PlushPepe.json         — анимация «Плюшевого Пепе» (только сам подарок, без фона и узора)
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.join(__dirname, "..");
const SRC = path.resolve(process.argv[2] ?? path.join(ROOT, "..", "telegram-gifts"));
const COLLECTIONS = ["plushpepe", "kissedfrog", "magicpotion", "preciouspeach", "toybear", "vintagecigar"];

// Самолётик (как логотип Telegram), чужие бренды и лица реальных людей в узоры не берём.
const EXCLUDED_SYMBOL = /^(origami|ufc.*|round(one|two|three|four|five)|theoctagon|mouthguard|punchingbag|sportsbag|squeezebottle|traininghelmet|snoop.*|213|losangeles|adesanya|chimaev|dvalishvili|jones|oliveira|omalley|pantoja|pereira|topuria|volkanovski)$/;

// Цвета фонов: центр, край, цвет узора. В данных их нет — подобраны по названию фона.
const BACKDROP_COLORS = {
  "Amber": ["#f5c66a", "#d98c1c", "#a35f00"],
  "Aquamarine": ["#7fe0c9", "#2aa891", "#16705f"],
  "Azure Blue": ["#7ab8f5", "#2f72c9", "#1b4a8a"],
  "Battleship Grey": ["#a3a9ad", "#6c7378", "#454b4f"],
  "Black": ["#4a4a4f", "#151517", "#000000"],
  "Burgundy": ["#b0485e", "#6e1a2e", "#46101d"],
  "Cappuccino": ["#c9a98c", "#8c6a4e", "#5e4532"],
  "Caramel": ["#e0a96a", "#b06f2c", "#77471a"],
  "Carrot Juice": ["#ffa05e", "#e2601f", "#9c3e10"],
  "Chestnut": ["#b9785a", "#7a3f28", "#4f2617"],
  "Chocolate": ["#a8775a", "#5e3a26", "#3a2316"],
  "Cobalt Blue": ["#6f8ff0", "#2742b3", "#172a75"],
  "Copper": ["#e0986a", "#a85a32", "#6e381c"],
  "Coral Red": ["#ff8a80", "#d9443c", "#8f2620"],
  "Cyberpunk": ["#ff6ad5", "#7a2cf5", "#3d138a"],
  "Dark Lilac": ["#b494d6", "#7a5a9e", "#4d3766"],
  "Desert Sand": ["#ead2a8", "#c4a06c", "#8a6c40"],
  "Electric Indigo": ["#9a7cff", "#5a2df0", "#33159c"],
  "Electric Purple": ["#d27cff", "#9a2de6", "#5f1594"],
  "Emerald": ["#6fdca3", "#1f9a5e", "#10603a"],
  "English Violet": ["#9a8aab", "#5e4f6e", "#3b3147"],
  "Fandango": ["#d46aa8", "#9a2f72", "#621a49"],
  "French Blue": ["#6aa7e8", "#2a66b3", "#183f73"],
  "Grape": ["#a782d9", "#6a3fa6", "#43266b"],
  "Hunter Green": ["#6fa37a", "#355e3b", "#1f3a24"],
  "Indigo Dye": ["#5a7fa8", "#1f3f63", "#11253d"],
  "Ivory White": ["#fffbea", "#e3dcc2", "#b5ac8c"],
  "Jade Green": ["#7fd6b0", "#2f9a73", "#1a6249"],
  "Khaki Green": ["#bfc48a", "#878c4f", "#575b30"],
  "Lavender": ["#cdb8f5", "#9a7fd6", "#62509a"],
  "Lemongrass": ["#e3e889", "#b0b545", "#737626"],
  "Light Olive": ["#c9cf8f", "#959c55", "#61663a"],
  "Malachite": ["#6fe3a0", "#14a85a", "#0b6a39"],
  "Midnight Blue": ["#4f5f9e", "#1a2257", "#0d1336"],
  "Mint Green": ["#a8f0cf", "#5fc99a", "#3a8a66"],
  "Moonstone": ["#9ecbd6", "#5b98a8", "#3a6670"],
  "Mystic Pearl": ["#e8d6e3", "#b49cb0", "#7a6578"],
  "Navy Blue": ["#5470b0", "#1c2f66", "#101d42"],
  "Neon Blue": ["#6f8cff", "#2a3dff", "#16209c"],
  "Onyx Black": ["#55585e", "#1f2124", "#0a0b0c"],
  "Orange": ["#ffb35e", "#f0780f", "#a14d05"],
  "Pacific Cyan": ["#6fd6e8", "#1a9ab3", "#0f6273"],
  "Pacific Green": ["#6fd6b8", "#1a9a7a", "#0f624d"],
  "Persimmon": ["#ff9a6a", "#e2561f", "#9a3510"],
  "Pine Green": ["#5fa88c", "#1f6b52", "#124433"],
  "Pistachio": ["#cbe89a", "#93c45a", "#5e8233"],
  "Platinum": ["#eceef0", "#b9bec3", "#83898f"],
  "Pure Gold": ["#ffe08a", "#d9a41c", "#946c05"],
  "Purple": ["#b77ce8", "#7a33b8", "#4d1d78"],
  "Raspberry": ["#f06a96", "#c21f5a", "#7d1239"],
  "Roman Silver": ["#b5bcc7", "#7a8494", "#4f5763"],
  "Rosewood": ["#b8676a", "#73303a", "#4a1d24"],
  "Sapphire": ["#6a8ff0", "#1f45b3", "#122c75"],
  "Satin Gold": ["#e8cc7a", "#b8963a", "#7a611e"],
  "Shamrock Green": ["#7ae09a", "#2fa85a", "#1c6b38"],
  "Silver Blue": ["#a8bcd6", "#6a82a3", "#45566e"],
  "Sky Blue": ["#9ad6ff", "#4aa8e8", "#286a9c"],
  "Steel Grey": ["#8c949c", "#525a63", "#33393f"],
  "Strawberry": ["#ff8aa0", "#e23a5e", "#9a1f3a"],
  "Turquoise": ["#7ae8dc", "#20b3a3", "#127066"],
};

const fixName = (n) => n.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
const pct = (n, total) => Math.round((n / total) * 1000) / 10;

function readCollection(name) {
  const d = JSON.parse(fs.readFileSync(path.join(SRC, `${name}.json`), "utf-8"));
  const records = d.gifts
    .trim()
    .split("\n")
    .map((line) => line.split(",").map(Number))
    .filter((r) => r.length === 4 && r.every(Number.isFinite));
  return { ...d, records };
}

function main() {
  if (!fs.existsSync(path.join(SRC, "data", "symbols"))) throw new Error(`Не нашёл telegram-gifts в ${SRC}`);
  const cols = COLLECTIONS.map(readCollection);

  const backdropCount = new Map();
  const symbolCount = new Map();
  let total = 0;
  for (const c of cols) {
    for (const [, , b, s] of c.records) {
      const bn = c.backdrops[b];
      const sn = c.symbols[s];
      if (bn) backdropCount.set(bn, (backdropCount.get(bn) ?? 0) + 1);
      if (sn) symbolCount.set(sn, (symbolCount.get(sn) ?? 0) + 1);
      total++;
    }
  }

  const backdrops = [...backdropCount.entries()]
    .filter(([name]) => BACKDROP_COLORS[name])
    .sort((a, b) => b[1] - a[1])
    .map(([name, n]) => ({ name, rarity: pct(n, total), colors: BACKDROP_COLORS[name].slice(0, 2), pattern: BACKDROP_COLORS[name][2] }));

  const symbolDir = path.join(SRC, "data", "symbols", "webp", "128");
  const outSymbols = path.join(ROOT, "public", "gift-symbols");
  fs.rmSync(outSymbols, { recursive: true, force: true });
  fs.mkdirSync(outSymbols, { recursive: true });
  const symbols = [];
  for (const [name, n] of [...symbolCount.entries()].sort((a, b) => b[1] - a[1])) {
    const id = fixName(name);
    if (EXCLUDED_SYMBOL.test(id) || symbols.some((x) => x.id === id)) continue;
    const file = path.join(symbolDir, `${id}.webp`);
    if (!fs.existsSync(file)) continue;
    fs.copyFileSync(file, path.join(outSymbols, `${id}.webp`));
    symbols.push({ id, name, rarity: pct(n, total) });
  }

  const pepe = cols[0];
  const modelCount = new Map();
  for (const [, m] of pepe.records) modelCount.set(m, (modelCount.get(m) ?? 0) + 1);
  const pepeModels = pepe.models
    .map((name, i) => ({ name, rarity: pct(modelCount.get(i) ?? 0, pepe.records.length) }))
    .filter((m) => m.rarity > 0)
    .sort((a, b) => b.rarity - a.rarity);

  const out = `// Сгенерировано scripts/import-telegram-gifts.js из telegram-gifts — не править руками.
// Редкость — доля в настоящих записях коллекций Telegram (${total} подарков), в процентах.
export const TG_BACKDROPS = ${JSON.stringify(backdrops)};
export const TG_SYMBOLS = ${JSON.stringify(symbols)};
export const TG_MODELS = { plushpepe: ${JSON.stringify(pepeModels)} };
`;
  fs.writeFileSync(path.join(ROOT, "public", "js", "lib", "tgGiftData.js"), out);

  // Анимация подарка: оставляем только слой «Gift» — фон и узор рисуем сами (как у модели в Telegram).
  const tgs = path.join(SRC, "plushpepe-1.tgs");
  if (fs.existsSync(tgs)) {
    const anim = JSON.parse(zlib.gunzipSync(fs.readFileSync(tgs)).toString("utf-8"));
    anim.layers = anim.layers.filter((l) => l.nm === "Gift");
    const used = new Set();
    const collect = (layers) => layers.forEach((l) => l.refId && used.add(l.refId));
    collect(anim.layers);
    for (let grew = true; grew; ) {
      const before = used.size;
      for (const a of anim.assets ?? []) if (used.has(a.id) && a.layers) collect(a.layers);
      grew = used.size > before;
    }
    anim.assets = (anim.assets ?? []).filter((a) => used.has(a.id));
    fs.writeFileSync(path.join(ROOT, "public", "tgs", "PlushPepe.json"), JSON.stringify(anim));
  }

  console.log(`фонов: ${backdrops.length}, узоров: ${symbols.length}, моделей Пепе: ${pepeModels.length}`);
}

main();
