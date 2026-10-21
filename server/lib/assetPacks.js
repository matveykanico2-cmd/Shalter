// Отдача мелких картинок из архивов (scripts/pack-assets.js) по прежним адресам:
// /img/emoji/…, /gift-symbols/…, /gift-emoji/…, /tgs/…. Тысячи файлов в репозитории
// замедляли выкладку; теперь это 4 файла. Читаем кусок файла по смещению — в память
// архив целиком не грузится.
const fs = require("fs");
const path = require("path");

const PACKS = [
  { name: "emoji", dir: "img/emoji", prefix: "/img/emoji/" },
  { name: "gift-symbols", dir: "gift-symbols", prefix: "/gift-symbols/" },
  { name: "gift-emoji", dir: "gift-emoji", prefix: "/gift-emoji/" },
  { name: "tgs", dir: "tgs", prefix: "/tgs/" },
];
const PACK_DIR = path.join(__dirname, "..", "assets", "packs");

const TYPES = { ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".json": "application/json", ".tgs": "application/gzip", ".gif": "image/gif", ".jpg": "image/jpeg" };

const opened = new Map();
function openPack(pack) {
  if (opened.has(pack.name)) return opened.get(pack.name);
  let entry = null;
  try {
    const file = path.join(PACK_DIR, `${pack.name}.pack`);
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
    const hit = entry?.index[rel];
    if (!hit) return next();
    const etag = `${entry.etag}-${hit[0].toString(36)}"`;
    res.setHeader("ETag", etag);
    res.setHeader("Cache-Control", "public, max-age=604800");
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

module.exports = { assetPacks, packFiles, PACKS };
