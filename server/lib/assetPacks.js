// Отдача мелких картинок из архивов (scripts/pack-assets.js) по прежним адресам:
// /img/emoji/…, /gift-symbols/…, /gift-emoji/…, /tgs/…, /gift-scenes/…. Тысячи файлов в
// репозитории замедляли выкладку; теперь это 5 файлов. Читаем кусок файла по смещению — в память
// архив целиком не грузится.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const PACKS = [
  { name: "emoji", dir: "img/emoji", prefix: "/img/emoji/" },
  { name: "gift-symbols", dir: "gift-symbols", prefix: "/gift-symbols/" },
  { name: "gift-emoji", dir: "gift-emoji", prefix: "/gift-emoji/" },
  { name: "tgs", dir: "tgs", prefix: "/tgs/" },
  // Сцены подарков (scripts/gift-scenes.js): их пересобирают генераторы — кэш на час, а не на неделю.
  // 56 МБ JSON — в git лежит сжатым (gift-scenes.pack.br, ~11 МБ), см. unpackPack.
  { name: "gift-scenes", dir: "gift-scenes", prefix: "/gift-scenes/", maxAge: 3600, compressed: true },
];
const PACK_DIR = path.join(__dirname, "..", "assets", "packs");

const TYPES = { ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".json": "application/json", ".tgs": "application/gzip", ".gif": "image/gif", ".jpg": "image/jpeg" };

// Сжатый архив (<name>.pack.br) распаковывается рядом в <name>.pack, если того нет или он
// старше: при сборке (scripts/build.js, в Docker — на этапе build) или при первом обращении.
// Сам .pack в git не хранится (.gitignore).
function unpackPack(pack) {
  const file = path.join(PACK_DIR, `${pack.name}.pack`);
  if (!pack.compressed) return file;
  const src = `${file}.br`;
  if (!fs.existsSync(src)) return file;
  if (fs.existsSync(file) && fs.statSync(file).mtimeMs >= fs.statSync(src).mtimeMs) return file;
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, zlib.brotliDecompressSync(fs.readFileSync(src)));
  fs.renameSync(tmp, file);
  return file;
}

const opened = new Map();
function openPack(pack) {
  if (opened.has(pack.name)) return opened.get(pack.name);
  let entry = null;
  try {
    const file = unpackPack(pack);
    const fd = fs.openSync(file, "r");
    const lenBuf = Buffer.alloc(4);
    fs.readSync(fd, lenBuf, 0, 4, 0);
    const headLen = lenBuf.readUInt32LE(0);
    const head = Buffer.alloc(headLen);
    fs.readSync(fd, head, 0, headLen, 4);
    entry = { fd, index: JSON.parse(head.toString("utf8")), base: 4 + headLen, etag: `"${pack.name}-${fs.fstatSync(fd).mtimeMs.toString(36)}` };
  } catch {
    entry = null; // архива нет (локальная разработка без упаковки) — отдаст обычная раздача public/
  }
  opened.set(pack.name, entry);
  return entry;
}

function assetPacks() {
  return (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    const pack = PACKS.find((p) => req.path.startsWith(p.prefix));
    if (!pack) return next();
    const entry = openPack(pack);
    let rel;
    try {
      rel = decodeURIComponent(req.path.slice(pack.prefix.length));
    } catch {
      return next();
    }
    // Только свои ключи индекса: «constructor» или «__proto__» — не файлы архива.
    const hit = entry && Object.hasOwn(entry.index, rel) ? entry.index[rel] : undefined;
    if (!hit) return next();
    const etag = `${entry.etag}-${hit[0].toString(36)}"`;
    res.setHeader("ETag", etag);
    res.setHeader("Cache-Control", `public, max-age=${pack.maxAge ?? 604800}`);
    res.setHeader("Content-Type", TYPES[path.extname(rel).toLowerCase()] ?? "application/octet-stream");
    if (req.headers["if-none-match"] === etag) return res.status(304).end();
    res.setHeader("Content-Length", hit[1]);
    if (req.method === "HEAD") return res.end();
    const buf = Buffer.alloc(hit[1]);
    fs.read(entry.fd, buf, 0, hit[1], entry.base + hit[0], (err) => (err ? next(err) : res.end(buf)));
  };
}

// Все файлы архива по одному — для распаковки на диск при сборке (scripts/build.js),
// откуда их отдаёт nginx.
function* packFiles(pack) {
  const entry = openPack(pack);
  if (!entry) return;
  for (const [rel, [offset, length]] of Object.entries(entry.index)) {
    const buf = Buffer.alloc(length);
    fs.readSync(entry.fd, buf, 0, length, entry.base + offset);
    yield [rel, buf];
  }
}

// Распаковать все сжатые архивы заранее — при сборке (scripts/build.js), чтобы в образ
// Docker уже попал готовый .pack и сервер не писал его при первом запросе.
function unpackPacks() {
  for (const pack of PACKS) if (pack.compressed) unpackPack(pack);
}

module.exports = { assetPacks, packFiles, unpackPacks, PACKS };
