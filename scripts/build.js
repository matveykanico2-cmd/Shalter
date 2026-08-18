// Production build: bundle+minify the client JS/CSS and precompress the
// output (gzip + brotli) so the server never has to spend CPU compressing
// static assets on the fly — it just streams the right precomputed file.
// Dev keeps using the raw ES modules in public/ (see npm run dev); this only
// affects what NODE_ENV=production serves (see server/index.js).
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");
const esbuild = require("esbuild");

const ROOT = path.join(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const DIST_DIR = path.join(PUBLIC_DIR, "dist");

async function build() {
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
  fs.mkdirSync(path.join(DIST_DIR, "styles"), { recursive: true });

  await esbuild.build({
    entryPoints: [path.join(PUBLIC_DIR, "js", "app.js")],
    bundle: true,
    minify: true,
    format: "esm",
    target: "es2022",
    outfile: path.join(DIST_DIR, "app.js"),
    logLevel: "info",
    // lib/codeEditor.js imports CodeMirror straight from esm.sh (see that
    // file's comment) — esbuild has no business trying to fetch/bundle a
    // remote URL, and can't resolve it as a local path either. `external`
    // leaves the import statement exactly as written; the browser resolves
    // it at runtime the same way it does in `npm run dev`.
    external: ["https://esm.sh/*"],
  });

  await esbuild.build({
    entryPoints: [
      path.join(PUBLIC_DIR, "styles", "base.css"),
      path.join(PUBLIC_DIR, "styles", "components.css"),
    ],
    minify: true,
    outdir: path.join(DIST_DIR, "styles"),
    logLevel: "info",
  });

  // Метка содержимого в адресе. Без неё файл называется /dist/app.js всегда, а
  // отдаётся он с «хранить год, не перепроверять» (server/index.js) — то есть
  // после выкладки человек продолжал бы работать со старой сборкой, пока сам не
  // сбросит кэш. Метка меняется вместе с содержимым, поэтому браузер видит
  // другой адрес и забирает новое, а неизменившееся по-прежнему берёт из кэша.
  const stamp = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").slice(0, 10);
  const jsV = stamp(path.join(DIST_DIR, "app.js"));
  const baseV = stamp(path.join(DIST_DIR, "styles", "base.css"));
  const compV = stamp(path.join(DIST_DIR, "styles", "components.css"));

  // index.html is identical except it points at the built asset paths.
  const html = fs
    .readFileSync(path.join(PUBLIC_DIR, "index.html"), "utf-8")
    .replace('href="/styles/base.css"', `href="/dist/styles/base.css?v=${baseV}"`)
    .replace('href="/styles/components.css"', `href="/dist/styles/components.css?v=${compV}"`)
    .replace('src="/js/app.js"', `src="/dist/app.js?v=${jsV}"`);
  fs.writeFileSync(path.join(DIST_DIR, "index.html"), html);
  // Метка сборки — по ней сервер понимает, что собранное отстало от исходников,
  // и по ней же служебный воркер отличает свежий набор файлов от старого.
  fs.writeFileSync(
    path.join(DIST_DIR, "build.json"),
    JSON.stringify({ version: jsV, builtAt: new Date().toISOString(), sourceStamp: sourceStamp() })
  );

  precompress(path.join(DIST_DIR, "app.js"));
  precompress(path.join(DIST_DIR, "styles", "base.css"));
  precompress(path.join(DIST_DIR, "styles", "components.css"));
  precompress(path.join(DIST_DIR, "index.html"));

  report();
}

function precompress(file) {
  const content = fs.readFileSync(file);
  fs.writeFileSync(`${file}.gz`, zlib.gzipSync(content, { level: 9 }));
  fs.writeFileSync(`${file}.br`, zlib.brotliCompressSync(content, {
    params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 },
  }));
}

function report() {
  const files = ["app.js", path.join("styles", "base.css"), path.join("styles", "components.css")];
  console.log("\nBuilt sizes (raw / gz / br):");
  for (const f of files) {
    const full = path.join(DIST_DIR, f);
    const raw = fs.statSync(full).size;
    const gz = fs.statSync(`${full}.gz`).size;
    const br = fs.statSync(`${full}.br`).size;
    console.log(`  ${f}: ${(raw / 1024).toFixed(1)}KB / ${(gz / 1024).toFixed(1)}KB / ${(br / 1024).toFixed(1)}KB`);
  }
}

// Отпечаток исходников: время последнего изменения любого файла, попадающего в
// сборку. Сервер сравнивает его с записанным в build.json и пересобирает сам,
// если кто-то выложил новый код и забыл `npm run build` — забытая сборка
// означала бы, что «/» отдаёт сотню отдельных модулей вместо одного файла.
function sourceStamp() {
  let newest = 0;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "dist" || entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(js|css|html)$/.test(entry.name)) newest = Math.max(newest, fs.statSync(full).mtimeMs);
    }
  };
  walk(PUBLIC_DIR);
  return Math.round(newest);
}

// Собрано ли актуальное. Сервер вызывает это при запуске.
function isStale() {
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(DIST_DIR, "build.json"), "utf-8"));
    return !fs.existsSync(path.join(DIST_DIR, "index.html")) || meta.sourceStamp !== sourceStamp();
  } catch {
    return true;
  }
}

module.exports = { build, isStale, sourceStamp, DIST_DIR };

if (require.main === module) {
  build().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
