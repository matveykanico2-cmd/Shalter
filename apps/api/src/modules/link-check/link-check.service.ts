import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { buildInstantView, checkFrameable } from "../../legacy/legacy.js";

// Встроенный браузер (/api/link-check) — как server/routes/linkCheck.js. Сами проверки
// страницы и режим чтения — в server/lib (linkPreview.js, instantView.js).
const URL_RE = /^https?:\/\//i;
const IV_WINDOW_MS = 60_000;
const IV_MAX_HITS = 20;

@Injectable()
export class LinkCheckService {
  // Режим чтения качает чужие страницы — не чаще IV_MAX_HITS в минуту на пользователя.
  private readonly ivHits = new Map<string, number[]>();

  /** Можно ли открыть страницу во встроенном браузере. */
  public check(rawUrl: unknown, origin: string) {
    return checkFrameable(this.url(rawUrl), origin);
  }

  /** Статья по ссылке для режима чтения. */
  public async instantView(uid: string, rawUrl: unknown) {
    const url = this.url(rawUrl);
    const now = Date.now();
    const hits = (this.ivHits.get(uid) ?? []).filter((t) => now - t < IV_WINDOW_MS);
    if (hits.length >= IV_MAX_HITS) throw new ApiError(429, "Слишком часто, подождите минуту");
    this.ivHits.set(uid, [...hits, now]);
    try {
      return { view: await buildInstantView(url) };
    } catch (err) {
      const status = (err as { status?: number }).status;
      throw new ApiError(status ?? 502, status ? (err as Error).message : "Не удалось открыть статью");
    }
  }

  private url(raw: unknown): string {
    const url = String(raw ?? "");
    if (!URL_RE.test(url) || url.length > 2048) throw new ApiError(400, "Некорректная ссылка");
    return url;
  }
}
