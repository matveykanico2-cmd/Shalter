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
    splitting: true,
    outdir: DIST_DIR,
    entryNames: "app",
    chunkNames: "chunk-[hash]",
    logLevel: "info",
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

  const stamp = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").slice(0, 10);
  const jsV = stamp(path.join(DIST_DIR, "app.js"));
  const baseV = stamp(path.join(DIST_DIR, "styles", "base.css"));
  const compV = stamp(path.join(DIST_DIR, "styles", "components.css"));

  const appSource = fs.readFileSync(path.join(DIST_DIR, "app.js"), "utf-8");
  const eagerChunks = [...new Set([...appSource.matchAll(/from"\.\/(chunk-[A-Z0-9]+\.js)"/g)].map((m) => m[1]))];
  const preloads = eagerChunks.map((c) => `  <link rel="modulepreload" href="/dist/${c}" />`).join("\n");

  const html = fs
    .readFileSync(path.join(PUBLIC_DIR, "index.html"), "utf-8")
    .replace('href="/styles/base.css"', `href="/dist/styles/base.css?v=${baseV}"`)
    .replace('href="/styles/components.css"', `href="/dist/styles/components.css?v=${compV}"`)
    .replace('src="/js/app.js"', `src="/dist/app.js?v=${jsV}"`)
    .replace("</head>", `${preloads}\n</head>`);
  fs.writeFileSync(path.join(DIST_DIR, "index.html"), html);
  fs.writeFileSync(
    path.join(DIST_DIR, "build.json"),
    JSON.stringify({ version: jsV, builtAt: new Date().toISOString(), sourceStamp: sourceStamp() })
  );

  for (const f of fs.readdirSync(DIST_DIR)) if (f.endsWith(".js")) precompress(path.join(DIST_DIR, f));
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
