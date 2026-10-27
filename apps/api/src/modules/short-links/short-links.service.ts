import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { interstitialPage } from "./lib/interstitial-page.js";
import { ShortLinksRepository } from "./short-links.repository.js";

/** Куда ведёт короткая ссылка: нет такой, путь этого же сервера или страница-предупреждение. */
export type ShortLinkOutcome = { kind: "missing" } | { kind: "redirect"; path: string } | { kind: "page"; html: string };

// Переход по короткой ссылке (/s/:code) и счётчик для страницы /short — как
// server/routes/shortLinks.js и GET /api/short-links в server/app.js.
@Injectable()
export class ShortLinksService {
  public constructor(private readonly links: ShortLinksRepository) {}

  public open(code: string, requestHost: string | undefined): ShortLinkOutcome {
    const link = this.links.find(code);
    if (!link) return { kind: "missing" };
    this.links.registerClick(link.code);
    let target: URL;
    try {
      target = new URL(link.targetUrl);
    } catch {
      return { kind: "missing" };
    }
    if (target.protocol !== "http:" && target.protocol !== "https:") return { kind: "missing" };
    // Ссылка на этот же сервер Shalter — обычный редирект, на путь (не на чужой хост).
    if (target.host === requestHost) return { kind: "redirect", path: `${target.pathname}${target.search}${target.hash}` };
    return { kind: "page", html: interstitialPage(target.href) };
  }

  public count() {
    try {
      return this.links.count();
    } catch {
      throw new ApiError(500, "db error");
    }
  }
}
