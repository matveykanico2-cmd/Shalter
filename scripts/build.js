// Сборка клиента для выкладки (npm run build): apps/web через Vite, затем то, что нужно
// серверу и nginx, — заранее сжатые файлы сборки, build.json с версией (GET /api/version)
// и картинки из архивов обычными файлами (nginx отдаёт их с диска).
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const WEB_DIR = path.join(ROOT, "apps", "web");
const WEB_DIST = path.join(WEB_DIR, "dist");
const PACKS_DIR = path.join(ROOT, "public", "dist", "packs");

function build() {
  // SKIP_WEB_BUILD=1 — сборка уже есть (CI собрал её отдельным шагом), только дообработка.
  if (process.env.SKIP_WEB_BUILD !== "1") {
    execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build", "-w", "@shalter/web"], { cwd: ROOT, stdio: "inherit" });
  }
  if (!fs.existsSync(path.join(WEB_DIST, "index.html"))) throw new Error(`нет сборки клиента: ${WEB_DIST}/index.html`);

  const assets = path.join(WEB_DIST, "assets");
  const precache = writePrecacheList(assets);
  const files = fs.readdirSync(assets).filter((f) => /\.(js|css|svg|json)$/.test(f));
  for (const f of files) precompress(path.join(assets, f));

  // Версия — по index.html: он ссылается на файлы с хешем, значит, меняется с любым из них.
  const version = crypto.createHash("sha256").update(fs.readFileSync(path.join(WEB_DIST, "index.html"))).digest("hex").slice(0, 10);
  // precache — для запуска без сети в Android-приложении: OfflineShell.java отдаёт эти файлы из APK.
  fs.writeFileSync(path.join(WEB_DIST, "build.json"), JSON.stringify({ version, builtAt: new Date().toISOString(), precache }));

  unpackAssets();
  report(assets, files);
}

// Все файлы сборки — чтобы без сети приложение открывалось целиком, а не только уже открытые
// экраны: service worker (public/sw.js) скачивает их заранее по списку
// /assets/precache-<хеш>.json, ссылка на который — в <meta name="shalter-precache"> страницы.
// Имя с хешем: /assets отдаётся как неизменяемый (1 год), список новой сборки — новый файл.
function writePrecacheList(assets) {
  for (const f of fs.readdirSync(assets)) if (/^precache-.*\.json(\.gz|\.br)?$/.test(f)) fs.rmSync(path.join(assets, f));
  const list = fs
    .readdirSync(assets)
    .filter((f) => !/\.(gz|br)$/.test(f))
    .sort()
    .map((f) => `/assets/${f}`);
  const json = JSON.stringify(list);
  const name = `precache-${crypto.createHash("sha256").update(json).digest("hex").slice(0, 10)}.json`;
  fs.writeFileSync(path.join(assets, name), json);
  const indexPath = path.join(WEB_DIST, "index.html");
  const html = fs.readFileSync(indexPath, "utf8").replace(/\s*<meta name="shalter-precache"[^>]*>/, "");
  fs.writeFileSync(indexPath, html.replace("</head>", `  <meta name="shalter-precache" content="/assets/${name}" />\n</head>`));
  return list;
}

// Brotli q11 / gzip 9 — минуты на сборку; по умолчанию быстрые уровни,
// максимальное сжатие для выкладки: BUILD_FULL=1 npm run build
const FULL = process.env.BUILD_FULL === "1";
function precompress(file) {
  const content = fs.readFileSync(file);
  fs.writeFileSync(`${file}.gz`, zlib.gzipSync(content, { level: FULL ? 9 : 6 }));
  fs.writeFileSync(`${file}.br`, zlib.brotliCompressSync(content, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: FULL ? 11 : 5 } }));
}

// Картинки из архивов server/assets/packs — обычными файлами в public/dist/packs/<папка>/…:
// nginx отдаёт их с диска по прежним адресам (deploy/nginx.conf.example), Node их
// больше не читает. Без nginx (Docker) не нужны — UNPACK_ASSETS=0 их не пишет.
function unpackAssets() {
  if (process.env.UNPACK_ASSETS === "0") return;
  const { PACKS, packFiles } = require("../server/lib/assetPacks");
  fs.rmSync(PACKS_DIR, { recursive: true, force: true });
  let count = 0;
  for (const pack of PACKS) {
    for (const [rel, buf] of packFiles(pack)) {
      const target = path.join(PACKS_DIR, pack.dir, rel);
      if (!target.startsWith(PACKS_DIR + path.sep)) continue;
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, buf);
      count++;
    }
  }
  console.log(`Картинки из архивов: ${count} файлов в public/dist/packs`);
}

function report(dir, files) {
  const sized = files.map((f) => ({ f, raw: fs.statSync(path.join(dir, f)).size })).sort((a, b) => b.raw - a.raw).slice(0, 5);
  console.log("\nСамые большие файлы сборки (raw / br):");
  for (const { f, raw } of sized) {
    const br = fs.statSync(path.join(dir, `${f}.br`)).size;
    console.log(`  ${f}: ${(raw / 1024).toFixed(1)}KB / ${(br / 1024).toFixed(1)}KB`);
  }
}

module.exports = { build, WEB_DIST };

if (require.main === module) {
  try {
    build();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
