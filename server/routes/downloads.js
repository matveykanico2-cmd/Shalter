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
let releaseCache = { at: 0, assets: new Map(), version: "", pending: null };

async function latestReleaseAssets() {
  if (Date.now() - releaseCache.at < RELEASE_TTL_MS) return releaseCache.assets;
  releaseCache.pending ??= (async () => {
    const assets = new Map();
    let version = "";
    try {
      const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
        headers: { Accept: "application/vnd.github+json", "User-Agent": "shalter-server" },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const release = await res.json();
        version = String(release.tag_name ?? "").replace(/^v/i, "");
        for (const a of release.assets ?? []) {
          if (a.size > 0) assets.set(a.name, { url: a.browser_download_url, size: a.size, updatedAt: a.updated_at });
        }
      }
    } catch {
      // GitHub недоступен — просто показываем то, что есть на сервере.
    }
    releaseCache = { at: Date.now(), assets, version, pending: null };
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

// APK, подписанный отладочным ключом (CN=Android Debug), не ставится поверх
// release-версии (RuStore, GitHub Release) — Android пишет «конфликт пакетов».
// Читаем сертификат из APK Signing Block (v2/v3); результат кэшируем по mtime.
const debugSignedCache = new Map();
function apkIsDebugSigned(file) {
  const full = path.join(DOWNLOAD_DIR, file);
  try {
    const { mtimeMs, size } = fs.statSync(full);
    const key = `${file}:${mtimeMs}:${size}`;
    if (debugSignedCache.has(key)) return debugSignedCache.get(key);
    const b = fs.readFileSync(full);
    let e = b.length - 22;
    while (e > 0 && b.readUInt32LE(e) !== 0x06054b50) e--;
    const cd = b.readUInt32LE(e + 16);
    let debug = false;
    if (b.toString("latin1", cd - 16, cd) === "APK Sig Block 42") {
      const size64 = Number(b.readBigUInt64LE(cd - 24));
      let p = cd - size64 - 8 + 8;
      while (p < cd - 24) {
        const len = Number(b.readBigUInt64LE(p));
        const id = b.readUInt32LE(p + 8);
        if (id === 0x7109871a || id === 0xf05368c0) {
          let q = p + 12 + 12;
          q += 4 + b.readUInt32LE(q); // digests
          q += 4; // certificates seq length
          const certLen = b.readUInt32LE(q);
          const cert = new (require("crypto").X509Certificate)(b.subarray(q + 4, q + 4 + certLen));
          debug = /CN=Android Debug/.test(cert.subject);
          break;
        }
        p += 8 + len;
      }
    }
    debugSignedCache.set(key, debug);
    return debug;
  } catch {
    return false;
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
  const debugApk = local.some((a) => a.id === "android" && a.found) && apkIsDebugSigned("Shalter.apk");
  const release = local.some((a) => !a.found) || debugApk ? await latestReleaseAssets() : new Map();
  // Отладочный APK отдаём, только если подписанной release-сборки нет совсем.
  if (debugApk && release.has("Shalter.apk")) local.find((a) => a.id === "android").found = null;

  const artifacts = local.map(({ id, file, found }) => {
    const hit = found ?? release.get(file);
    return hit ? { id, available: true, ...hit } : { id, available: false };
  });

  res.setHeader("Cache-Control", "no-store");
  res.json({ version, artifacts });
});

// Обновление нативной оболочки (APK, десктоп, iOS). Интерфейс приложения грузится с
// сервера и обновляется сам (lib/appVersion.js), а оболочку — плагины, иконки, мост —
// нужно поставить заново. Последняя версия — тег последнего релиза на GitHub: его
// публикуют сборки CI, так что предложение появляется, только когда сборка уже выложена.
// Можно задать вручную: NATIVE_LATEST_VERSION (и IOS_APP_URL — ссылка на App Store/TestFlight).
const UPDATE_FILES = {
  android: "Shalter.apk",
  windows: "Shalter-Windows-Setup.exe",
  linux: "Shalter.AppImage",
  "macos-arm64": "Shalter-macOS-arm64.zip",
};

router.get("/latest", async (req, res) => {
  const platform = String(req.query.platform ?? "");
  res.setHeader("Cache-Control", "no-store");
  await latestReleaseAssets();
  const version = process.env.NATIVE_LATEST_VERSION || releaseCache.version;
  if (!version) return res.json({ version: null });
  let url = null;
  if (platform === "ios") {
    url = process.env.IOS_APP_URL || null;
  } else if (UPDATE_FILES[platform]) {
    const file = UPDATE_FILES[platform];
    const localUrl = platform === "android" && apkIsDebugSigned(file) ? null : localArtifact(file)?.url;
    url = releaseCache.assets.get(file)?.url ?? localUrl ?? null;
    // Нет подписанной сборки для обновления — не предлагаем: отладочный APK
    // поверх release-версии не встанет («конфликт пакетов»).
    if (!url) return res.json({ version: null });
  }
  res.json({ version, url, page: "/download" });
});

module.exports = router;
