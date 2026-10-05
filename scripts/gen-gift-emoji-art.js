// Генерация картинок подарков-эмодзи: public/gift-emoji/<кодовые точки>.png.
//
// Подарок рисуется по порядку: своя сцена → загруженная картинка (mediaUrl) →
// анимация из public/tgs → картинка эмодзи → сам эмодзи. Анимации есть только у
// 74 подарков каталога, у остальных 260 картинки не было — в сетке и в профиле
// такие подарки показывались символом шрифта, а ZWJ-последовательности вроде
// «Пиратский флага» 🏴‍☠️ частью браузеров рисовалась квадратами.
//
// Рисует headless Chromium системным Noto Color Emoji, поэтому картинка не
// зависит от шрифта на устройстве. Уже существующие файлы не трогает.
//
//   node scripts/gen-gift-emoji-art.js [--force] [--size 96]

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const sharp = require("sharp");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "public", "gift-emoji");
const GIFTS_SRC = path.join(ROOT, "server", "data", "gifts.js");
const LOTTIE_SRC = path.join(ROOT, "public", "js", "lib", "lottie.js");

const argv = process.argv.slice(2);
const force = argv.includes("--force");
const sizeArg = argv.indexOf("--size");
const SIZE = sizeArg >= 0 ? Number(argv[sizeArg + 1]) : 96;
const TILE = 96;
const COLUMNS = 5;
const ROWS = 5;

function browser() {
  const candidates = [
    process.env.CHROME_BIN,
    "chromium",
    "chromium-browser",
    "google-chrome",
    "google-chrome-stable",
  ].filter(Boolean);
  for (const bin of candidates) {
    try {
      execFileSync(bin, ["--version"], { stdio: "ignore" });
      return bin;
    } catch {
    }
  }
  throw new Error("не найден Chromium: укажите путь в CHROME_BIN");
}

const codepoints = (emoji) => [...String(emoji ?? "").trim()].map((ch) => ch.codePointAt(0).toString(16)).join("");

// Каталог подарков и список анимаций разбираем из исходников: gift_catalog живёт
// в SQLite, а править нужно файлы репозитория.
function catalogEmojis() {
  const gifts = [...fs.readFileSync(GIFTS_SRC, "utf8").matchAll(/id:\s*"([^"]+)"[^}]*?emoji:\s*"([^"]+)"/g)].map((m) => ({
    id: m[1],
    emoji: m[2],
  }));
  const lottie = fs.readFileSync(LOTTIE_SRC, "utf8");
  const [, byId] = lottie.split("const BY_ID");
  const [ids, rest] = byId.split("const BY_EMOJI");
  const [, byEmoji] = rest.split("export function lottieNameFor");
  const animatedIds = new Set([...ids.matchAll(/^\s*(\w+):/gm)].map((m) => m[1]));
  const animatedEmojis = new Set([...byEmoji.matchAll(/"([^"]+)":/g)].map((m) => m[1]));
  const seen = new Set();
  const todo = [];
  for (const g of gifts) {
    if (animatedIds.has(g.id) || animatedEmojis.has(g.emoji)) continue;
    const cp = codepoints(g.emoji);
    if (!cp || seen.has(cp)) continue;
    seen.add(cp);
    todo.push({ emoji: g.emoji, cp });
  }
  return todo;
}

function shoot(bin, page, out) {
  execFileSync(
    bin,
    [
      "--headless",
      "--disable-gpu",
      "--no-sandbox",
      "--hide-scrollbars",
      "--default-background-color=00000000",
      "--force-device-scale-factor=1",
      `--window-size=${COLUMNS * TILE},${ROWS * TILE}`,
      `--screenshot=${out}`,
      page,
    ],
    { stdio: "ignore" }
  );
}

async function main() {
  const todo = catalogEmojis().filter((t) => force || !fs.existsSync(path.join(OUT_DIR, `${t.cp}.png`)));
  fs.mkdirSync(OUT_DIR, { recursive: true });
  if (!todo.length) return console.log("все картинки на месте");
  const bin = browser();
  // Каталог без точки в имени: Chromium из snap не пишет в скрытые каталоги.
  const work = fs.mkdtempSync(path.join(os.homedir(), "gift-art-"));
  const page = path.join(work, "page.html");
  let done = 0;
  try {
    for (let i = 0; i < todo.length; i += COLUMNS * ROWS) {
      const batch = todo.slice(i, i + COLUMNS * ROWS);
      const cells = batch
        .map(
          (t, n) =>
            `<div style="width:${TILE}px;height:${TILE}px;display:flex;align-items:center;justify-content:center;font-size:${SIZE}px;line-height:1">${t.emoji}</div>`
        )
        .join("");
      fs.writeFileSync(page, `<html><body style="margin:0;background:transparent;display:flex;flex-wrap:wrap;width:${COLUMNS * TILE}px">${cells}</body></html>`);
      const shot = path.join(work, "shot.png");
      shoot(bin, `file://${page}`, shot);
      for (let n = 0; n < batch.length; n++) {
        const target = path.join(OUT_DIR, `${batch[n].cp}.png`);
        await sharp(shot)
          .extract({ left: (n % COLUMNS) * TILE, top: Math.floor(n / COLUMNS) * TILE, width: TILE, height: TILE })
          .resize(SIZE, SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png({ compressionLevel: 9 })
          .toFile(target);
        done++;
      }
      console.log(`${done}/${todo.length}`);
    }
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
  console.log(`готово: ${done} картинок в public/gift-emoji`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});