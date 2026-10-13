// Упаковка папок с тысячами мелких картинок (эмодзи, узоры подарков, анимации) в
// один файл на папку: в репозитории и при выкладке — 4 файла вместо ~4700.
// Сервер отдаёт картинки из архивов по прежним адресам (server/lib/assetPacks.js).
//
//   node scripts/pack-assets.js        — после изменения картинок в этих папках
//
// Формат: [4 байта — длина JSON-оглавления][оглавление {путь: [смещение, длина]}][данные].
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const { PACKS } = require("../server/lib/assetPacks");
const OUT = path.join(ROOT, "server", "assets", "packs");

function walk(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, base));
    else if (entry.isFile()) out.push(path.relative(base, full).split(path.sep).join("/"));
  }
  return out.sort();
}

fs.mkdirSync(OUT, { recursive: true });
for (const pack of PACKS) {
  const dir = path.join(ROOT, "public", pack.dir);
  if (!fs.existsSync(dir)) {
    console.log(`пропуск: нет папки public/${pack.dir}`);
    continue;
  }
  const files = walk(dir);
  const index = {};
  const chunks = [];
  let offset = 0;
  for (const rel of files) {
    const buf = fs.readFileSync(path.join(dir, rel));
    index[rel] = [offset, buf.length];
    chunks.push(buf);
    offset += buf.length;
  }
  const head = Buffer.from(JSON.stringify(index));
  const len = Buffer.alloc(4);
  len.writeUInt32LE(head.length);
  const target = path.join(OUT, `${pack.name}.pack`);
  fs.writeFileSync(target, Buffer.concat([len, head, ...chunks]));
  console.log(`${pack.name}.pack: ${files.length} файлов, ${(fs.statSync(target).size / 1048576).toFixed(1)} МБ`);
}
