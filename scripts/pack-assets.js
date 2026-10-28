// Упаковка папок с тысячами мелких картинок (эмодзи, узоры подарков, анимации) в
// один файл на папку: в репозитории и при выкладке — 4 файла вместо ~4700.
// Сервер отдаёт картинки из архивов по прежним адресам (server/lib/assetPacks.js).
//
//   node scripts/pack-assets.js                 — после изменения картинок в этих папках
//   node scripts/pack-assets.js gift-scenes     — только названные архивы
//
// Сжатые (compressed в PACKS, сейчас gift-scenes) пишутся как <name>.pack.br — brotli от того же.
// Формат: [4 байта — длина JSON-оглавления][оглавление {путь: [смещение, длина]}][данные].
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

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

const only = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
for (const pack of PACKS.filter((p) => !only.length || only.includes(p.name))) {
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
  const data = Buffer.concat([len, head, ...chunks]);
  let target = path.join(OUT, `${pack.name}.pack`);
  if (pack.compressed) {
    // В git — только сжатый; несжатый рядом удаляем, сервер распакует свежий (assetPacks.js).
    fs.rmSync(target, { force: true });
    target += ".br";
    const params = { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_LGWIN]: 24, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: data.length };
    fs.writeFileSync(target, zlib.brotliCompressSync(data, { params }));
  } else {
    fs.writeFileSync(target, data);
  }
  console.log(`${path.basename(target)}: ${files.length} файлов, ${(fs.statSync(target).size / 1048576).toFixed(1)} МБ`);
}
