import { Injectable } from "@nestjs/common";

export interface ReleaseAsset {
  url: string;
  size: number;
  updatedAt: string;
}

const GITHUB_REPO = process.env.DOWNLOADS_GITHUB_REPO || "matveykanico2-cmd/Shalter";
const RELEASE_TTL_MS = 10 * 60 * 1000;

// Последний релиз на GitHub (его публикуют build-desktop.yml / build-android.yml при пуше тега
// v*): сборки, которых нет на сервере, берём оттуда. Кэш на 10 минут, один запрос на всех.
@Injectable()
export class ReleaseStore {
  private at = 0;
  private assets = new Map<string, ReleaseAsset>();
  private versionTag = "";
  private pending: Promise<Map<string, ReleaseAsset>> | null = null;

  /** Версия из тега последнего релиза ("" — не узнали). Актуальна после latestAssets(). */
  public get version(): string {
    return this.versionTag;
  }

  public async latestAssets(): Promise<Map<string, ReleaseAsset>> {
    if (Date.now() - this.at < RELEASE_TTL_MS) return this.assets;
    this.pending ??= this.fetchLatest();
    return this.pending;
  }

  private async fetchLatest(): Promise<Map<string, ReleaseAsset>> {
    const assets = new Map<string, ReleaseAsset>();
    let version = "";
    try {
      const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
        headers: { Accept: "application/vnd.github+json", "User-Agent": "shalter-server" },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const release = (await res.json()) as { tag_name?: string; assets?: { name: string; size: number; browser_download_url: string; updated_at: string }[] };
        version = String(release.tag_name ?? "").replace(/^v/i, "");
        for (const a of release.assets ?? []) {
          if (a.size > 0) assets.set(a.name, { url: a.browser_download_url, size: a.size, updatedAt: a.updated_at });
        }
      }
    } catch {
      // GitHub недоступен — просто показываем то, что есть на сервере.
    }
    this.at = Date.now();
    this.assets = assets;
    this.versionTag = version;
    this.pending = null;
    return assets;
  }
}
