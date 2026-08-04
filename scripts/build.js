// Production build: bundle+minify the client JS/CSS and precompress the
// output (gzip + brotli) so the server never has to spend CPU compressing
// static assets on the fly — it just streams the right precomputed file.
// Dev keeps using the raw ES modules in public/ (see npm run dev); this only
// affects what NODE_ENV=production serves (see server/index.js).
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const esbuild = require("esbuild");

const ROOT = path.join(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const DIST_DIR = path.join(PUBLIC_DIR, "dist");

async function main() {
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

  // index.html is identical except it points at the built asset paths.
  const html = fs
    .readFileSync(path.join(PUBLIC_DIR, "index.html"), "utf-8")
    .replace('href="/styles/base.css"', 'href="/dist/styles/base.css"')
    .replace('href="/styles/components.css"', 'href="/dist/styles/components.css"')
    .replace('src="/js/app.js"', 'src="/dist/app.js"');
  fs.writeFileSync(path.join(DIST_DIR, "index.html"), html);

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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
