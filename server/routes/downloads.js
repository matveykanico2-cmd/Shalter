const fs = require("fs");
const path = require("path");
const express = require("express");

const DOWNLOAD_DIR = path.join(__dirname, "..", "..", "public", "downloads");
const PACKAGE_JSON = path.join(__dirname, "..", "..", "package.json");

const ARTIFACTS = [
  { id: "windows", file: "Shalter-Windows-Setup.exe" },
  { id: "android", file: "Shalter.apk" },
  { id: "linux", file: "Shalter.AppImage" },
  { id: "linux-deb", file: "Shalter.deb" },
  { id: "macos-arm64", file: "Shalter-macOS-arm64.zip" },
];

// Десктопные сборки не хранятся в git и попадали на сервер только ручной выгрузкой
// (scripts/upload-downloads.sh) — без неё кнопки на /download висели «Скоро», хотя
// сборки уже были. Теперь недостающее берём из последнего релиза на GitHub: его
// публикуют workflows build-desktop.yml / build-android.yml при пуше тега v*.
const GITHUB_REPO = process.env.DOWNLOADS_GITHUB_REPO || "matveykanico2-cmd/Shalter";
const RELEASE_TTL_MS = 10 * 60 * 1000;
let releaseCache = { at: 0, assets: new Map(), pending: null };

async function latestReleaseAssets() {
  if (Date.now() - releaseCache.at < RELEASE_TTL_MS) return releaseCache.assets;
  releaseCache.pending ??= (async () => {
    const assets = new Map();
    try {
      const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
        headers: { Accept: "application/vnd.github+json", "User-Agent": "shalter-server" },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const release = await res.json();
        for (const a of release.assets ?? []) {
          if (a.size > 0) assets.set(a.name, { url: a.browser_download_url, size: a.size, updatedAt: a.updated_at });
        }
      }
    } catch {
      // GitHub недоступен — просто показываем то, что есть на сервере.
    }
    releaseCache = { at: Date.now(), assets, pending: null };
    return assets;
  })();
  return releaseCache.pending;
}

function localArtifact(file) {
  try {
    const stat = fs.statSync(path.join(DOWNLOAD_DIR, file));
    if (!stat.isFile() || stat.size === 0) return null;
    return { url: `/downloads/${file}`, size: stat.size, updatedAt: stat.mtime.toISOString() };
  } catch {
    return null;
  }
}

const router = express.Router();

router.get("/", async (_req, res) => {
  let version = "";
  try {
    version = require(PACKAGE_JSON).version ?? "";
  } catch {
  }

  const local = ARTIFACTS.map(({ id, file }) => ({ id, file, found: localArtifact(file) }));
  const release = local.some((a) => !a.found) ? await latestReleaseAssets() : new Map();

  const artifacts = local.map(({ id, file, found }) => {
    const hit = found ?? release.get(file);
    return hit ? { id, available: true, ...hit } : { id, available: false };
  });

  res.setHeader("Cache-Control", "no-store");
  res.json({ version, artifacts });
});

module.exports = router;
