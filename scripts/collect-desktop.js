// После `tauri build` раскладывает готовые сборки в public/downloads под теми именами,
// которые ждут страница загрузок (public/download.html) и server/routes/downloads.js.
// Tauri собирает только под ту ОС, на которой запущен, — поэтому берём то, что нашлось.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const BUNDLE = path.join(ROOT, "src-tauri", "target", "release", "bundle");
const OUT = path.join(ROOT, "public", "downloads");

function firstFile(dir, test) {
  try {
    const name = fs.readdirSync(dir).find(test);
    return name ? path.join(dir, name) : null;
  } catch {
    return null;
  }
}

function copy(from, toName) {
  if (!from) return;
  const to = path.join(OUT, toName);
  fs.copyFileSync(from, to);
  console.log(`${path.relative(ROOT, from)} → ${path.relative(ROOT, to)}`);
}

fs.mkdirSync(OUT, { recursive: true });

copy(firstFile(path.join(BUNDLE, "appimage"), (n) => n.endsWith(".AppImage")), "Shalter.AppImage");
copy(firstFile(path.join(BUNDLE, "deb"), (n) => n.endsWith(".deb")), "Shalter.deb");
copy(firstFile(path.join(BUNDLE, "nsis"), (n) => n.endsWith("-setup.exe")), "Shalter-Windows-Setup.exe");

// macOS: .app в zip (ditto сохраняет права и подписи внутри пакета).
const app = path.join(BUNDLE, "macos", "Shalter.app");
if (process.platform === "darwin" && fs.existsSync(app)) {
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  const zip = path.join(OUT, `Shalter-macOS-${arch}.zip`);
  fs.rmSync(zip, { force: true });
  execFileSync("ditto", ["-c", "-k", "--keepParent", app, zip]);
  console.log(`${path.relative(ROOT, app)} → ${path.relative(ROOT, zip)}`);
}
