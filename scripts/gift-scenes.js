// Встроенные сцены подарков: по JSON-файлу на подарок в public/gift-scenes/<id>.json
// и список имеющихся сцен в public/gift-scenes/index.json. В репозитории папки нет —
// 25 тыс. файлов лежат одним сжатым архивом server/assets/packs/gift-scenes.pack.br (pack-assets.js),
// сервер отдаёт их по тем же адресам. Генераторы распаковывают архив в папку, дописывают
// сцены и упаковывают обратно. Клиент (apps/web, entities/gift/lib/gift-traits.ts)
// грузит только сцены тех подарков, что на экране, — раньше все 25 тыс. сцен лежали
// в одном модуле на 60 МБ.
//
// Генераторы (generate-scenes*.js, generate-crab-gifts.js) пишут сцены через writeGiftScenes.
// Запуск без аргументов пересобирает index.json по содержимому папки:
//   node scripts/gift-scenes.js
// Округлить числа во всех уже записанных сценах и упаковать заново:
//   node scripts/gift-scenes.js --compact
// Разовый перенос из старого модуля сцен (был в старом клиенте, в git-истории):
//   node scripts/gift-scenes.js --from=<путь к giftTraits.scenes.js>
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { execFileSync } = require("child_process");

const SCENES_DIR = path.join(__dirname, "..", "public", "gift-scenes");
const INDEX_FILE = path.join(SCENES_DIR, "index.json");
const ID_RE = /^[A-Za-z0-9_-]+$/;

// Дробные числа — до сотых: координаты в сетке 0–100, время в секундах, глазу разницы нет,
// а 16 знаков после запятой из Math.random() раздували архив втрое.
function sceneJson(scene) {
  return JSON.stringify(scene, (_key, v) => (typeof v === "number" && !Number.isInteger(v) ? Math.round(v * 100) / 100 : v));
}

// Генераторы собирают сцену как текст JS-литерала «id: { … }» — разбираем его в объект.
function parseSceneSource(source) {
  return Function(`"use strict"; return ({ ${source} });`)();
}

// Папки нет (свежий клон) — достаём сцены из архива, иначе новый архив их потеряет.
function unpackScenes() {
  if (fs.existsSync(INDEX_FILE)) return;
  const { PACKS, packFiles } = require("../server/lib/assetPacks");
  fs.mkdirSync(SCENES_DIR, { recursive: true });
  for (const [rel, buf] of packFiles(PACKS.find((p) => p.name === "gift-scenes"))) fs.writeFileSync(path.join(SCENES_DIR, path.basename(rel)), buf);
}

function packScenes() {
  execFileSync(process.execPath, [path.join(__dirname, "pack-assets.js"), "gift-scenes"], { stdio: "inherit" });
}

function writeGiftScenes(scenes) {
  unpackScenes();
  fs.mkdirSync(SCENES_DIR, { recursive: true });
  const entries = Array.isArray(scenes) ? scenes.flatMap((s) => Object.entries(typeof s === "string" ? parseSceneSource(s) : s)) : Object.entries(scenes);
  for (const [id, scene] of entries) {
    if (!ID_RE.test(id)) throw new Error(`недопустимый id сцены: ${id}`);
    fs.writeFileSync(path.join(SCENES_DIR, `${id}.json`), sceneJson(scene));
  }
  writeIndex();
  packScenes();
  return entries.length;
}

// Перезаписать все сцены папки через sceneJson (округление) — после смены формата записи.
function compactScenes() {
  let n = 0;
  for (const f of fs.readdirSync(SCENES_DIR)) {
    if (!f.endsWith(".json") || f === "index.json") continue;
    const file = path.join(SCENES_DIR, f);
    fs.writeFileSync(file, sceneJson(JSON.parse(fs.readFileSync(file, "utf8"))));
    n++;
  }
  return n;
}

function writeIndex() {
  const ids = fs
    .readdirSync(SCENES_DIR)
    .filter((f) => f.endsWith(".json") && f !== "index.json")
    .map((f) => f.slice(0, -5))
    .sort();
  fs.writeFileSync(INDEX_FILE, JSON.stringify(ids));
  return ids.length;
}

module.exports = { SCENES_DIR, writeGiftScenes, writeIndex, parseSceneSource };

if (require.main === module) {
  (async () => {
    const from = process.argv.find((a) => a.startsWith("--from="))?.slice(7);
    if (from) {
      const { BUILTIN_GIFT_SCENES } = await import(pathToFileURL(path.resolve(from)).href);
      const n = writeGiftScenes(BUILTIN_GIFT_SCENES);
      console.log(`перенесено сцен: ${n} → ${path.relative(process.cwd(), SCENES_DIR)}`);
    } else {
      unpackScenes();
      if (process.argv.includes("--compact")) console.log(`сцен округлено: ${compactScenes()}`);
      console.log(`сцен в индексе: ${writeIndex()}`);
      packScenes();
    }
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
