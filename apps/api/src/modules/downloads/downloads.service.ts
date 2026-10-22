import fs from "node:fs";
import path from "node:path";
import { Injectable } from "@nestjs/common";
import { PUBLIC_DIR, REPO_ROOT } from "../../common/config/paths.js";
import { apkIsDebugSigned } from "./lib/apk-signature.js";
import { ReleaseStore, type ReleaseAsset } from "./stores/release.store.js";

// Сборки приложения для /download и обновление нативной оболочки — как server/routes/downloads.js.
const DOWNLOAD_DIR = path.join(PUBLIC_DIR, "downloads");
const PACKAGE_JSON = path.join(REPO_ROOT, "package.json");

const ARTIFACTS = [
  { id: "windows", file: "Shalter-Windows-Setup.exe" },
  { id: "android", file: "Shalter.apk" },
  { id: "linux", file: "Shalter.AppImage" },
  { id: "linux-deb", file: "Shalter.deb" },
  { id: "macos-arm64", file: "Shalter-macOS-arm64.zip" },
];

const UPDATE_FILES: Record<string, string> = {
  android: "Shalter.apk",
  windows: "Shalter-Windows-Setup.exe",
  linux: "Shalter.AppImage",
  "linux-deb": "Shalter.deb",
  "macos-arm64": "Shalter-macOS-arm64.zip",
};

function localArtifact(file: string): ReleaseAsset | null {
  try {
    const stat = fs.statSync(path.join(DOWNLOAD_DIR, file));
    if (!stat.isFile() || stat.size === 0) return null;
    return { url: `/downloads/${file}`, size: stat.size, updatedAt: stat.mtime.toISOString() };
  } catch {
    return null;
  }
}

const isDebugApk = (file: string) => apkIsDebugSigned(path.join(DOWNLOAD_DIR, file));

/**
 * Версии сборок из public/downloads: { "windows": "1.0.143", … } (пишется при замене сборок из
 * CI; номер — из Shalter-desktop-version.txt в архиве).
 */
function localVersions(): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(path.join(DOWNLOAD_DIR, "versions.json"), "utf8")) ?? {};
  } catch {
    return {};
  }
}

function appVersion(): string {
  try {
    return JSON.parse(fs.readFileSync(PACKAGE_JSON, "utf8")).version ?? "";
  } catch {
    return "";
  }
}

@Injectable()
export class DownloadsService {
  public constructor(private readonly release: ReleaseStore) {}

  /**
   * Что есть для скачивания. Десктопные сборки не хранятся в git: недостающее берём из
   * последнего релиза на GitHub.
   */
  public async list() {
    const local = ARTIFACTS.map(({ id, file }) => ({ id, file, found: localArtifact(file) }));
    const debugApk = local.some((a) => a.id === "android" && a.found) && isDebugApk("Shalter.apk");
    const release = local.some((a) => !a.found) || debugApk ? await this.release.latestAssets() : new Map<string, ReleaseAsset>();
    // Отладочный APK отдаём, только если подписанной release-сборки нет совсем.
    if (debugApk && release.has("Shalter.apk")) local.find((a) => a.id === "android")!.found = null;

    const artifacts = local.map(({ id, file, found }) => {
      const hit = found ?? release.get(file);
      return hit ? { id, available: true, ...hit } : { id, available: false };
    });
    return { version: appVersion(), artifacts };
  }

  /**
   * Обновление нативной оболочки (APK, десктоп, iOS): интерфейс обновляется сам, а оболочку
   * нужно поставить заново. Последняя версия — NATIVE_LATEST_VERSION или тег последнего релиза.
   */
  public async latest(platformParam: unknown) {
    const platform = String(platformParam ?? "");
    // Своя сборка с известной версией — обновляемся с нашего сервера (быстрее GitHub).
    const versions = localVersions();
    const own = versions[platform] ?? (platform === "linux-deb" ? versions.linux : undefined);
    const ownFile = UPDATE_FILES[platform] && localArtifact(UPDATE_FILES[platform]);
    if (own && ownFile && !(platform === "android" && isDebugApk(UPDATE_FILES[platform]!))) {
      return { version: own, url: ownFile.url, size: ownFile.size, page: "/download" };
    }
    const release = await this.release.latestAssets();
    const version = process.env.NATIVE_LATEST_VERSION || this.release.version;
    if (!version) return { version: null };
    let url: string | null = null;
    if (platform === "ios") {
      url = process.env.IOS_APP_URL || null;
    } else if (UPDATE_FILES[platform]) {
      const file = UPDATE_FILES[platform];
      const localUrl = platform === "android" && isDebugApk(file) ? null : localArtifact(file)?.url;
      url = release.get(file)?.url ?? localUrl ?? null;
      // Нет подписанной сборки для обновления — не предлагаем: отладочный APK поверх
      // release-версии не встанет («конфликт пакетов»).
      if (!url) return { version: null };
    }
    return { version, url, page: "/download" };
  }
}
