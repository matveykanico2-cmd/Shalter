import { Injectable } from "@nestjs/common";
import type { Request } from "express";
import { unsupportedLanguages } from "../../legacy/legacy.js";
import { GeoService } from "../nearby/geo.service.js";
import { RealtimeService } from "../realtime/realtime.service.js";
import type { UserSettings } from "../users/model/domain.js";
import { UserSettingsService } from "../users/user-settings.service.js";
import { languageForCountry, languageFromAcceptHeader } from "./lib/country-language.js";

/** Откуда взят язык: страна по IP, заголовок Accept-Language браузера или русский по умолчанию. */
export type LanguageSource = "ip" | "accept-language" | "default";

export interface DetectedLanguage {
  language: string;
  country: string | null;
  source: LanguageSource;
}

const DEFAULT_LANGUAGE = "ru";
/** Фоновое уточнение языка после /api/bootstrap — не дольше (геосервисы и так со своими таймаутами). */
const BACKGROUND_REFRESH_MAX_MS = 15_000;

/** Ждать страну не дольше waitMs: запрос к геосервису продолжается и попадёт в кэш к следующему разу. */
function withDeadline<T>(promise: Promise<T>, waitMs: number, fallback: T): Promise<T> {
  if (!Number.isFinite(waitMs)) return promise;
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), Math.max(0, waitMs));
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      }
    );
  });
}

/** Язык интерфейса выбирается автоматически, пока пользователь не выбрал его сам. */
export function isUiLanguageAuto(settings: Partial<UserSettings>): boolean {
  if (typeof settings.uiLanguageAuto === "boolean") return settings.uiLanguageAuto;
  // Настройки из времени до автоязыка: русский (по умолчанию) — не выбран, другой — выбран сам.
  return (settings.uiLanguage ?? DEFAULT_LANGUAGE) === DEFAULT_LANGUAGE;
}

// Язык интерфейса по стране IP клиента (GET /api/geo/language, регистрация, вход, /api/bootstrap).
// Страна — GeoService (ipwho.is / get.geojs.io с кэшем); неизвестна — Accept-Language, иначе русский.
// Неподдерживаемые мессенджером языки (server/lib/unsupportedLanguages.js) пропускаются.
@Injectable()
export class UiLanguageService {
  /** Идущие фоновые уточнения по пользователю: повторный /api/bootstrap не заводит второе. */
  private readonly background = new Map<string, Promise<void>>();

  public constructor(
    private readonly geo: GeoService,
    private readonly userSettings: UserSettingsService,
    private readonly realtime: RealtimeService
  ) {}

  public async detect(req: Request, waitMs = 2500): Promise<DetectedLanguage> {
    const isUnsupported = (code: string) => unsupportedLanguages().isUnsupportedLanguage(code);
    const country = await withDeadline(this.geo.countryByIp(req.ip), waitMs, null);
    const byCountry = languageForCountry(country, isUnsupported);
    if (byCountry) return { language: byCountry, country, source: "ip" };
    const byHeader = languageFromAcceptHeader(req.headers["accept-language"], isUnsupported);
    if (byHeader) return { language: byHeader, country, source: "accept-language" };
    return { language: DEFAULT_LANGUAGE, country, source: "default" };
  }

  /** Новый аккаунт: язык по стране, браузеру или русский; режим остаётся автоматическим. */
  public async applyForNewUser(userId: string, req: Request, waitMs = 2000): Promise<void> {
    try {
      const { language } = await this.detect(req, waitMs);
      if (language !== this.userSettings.get(userId).uiLanguage) {
        this.userSettings.update(userId, { uiLanguage: language, uiLanguageAuto: true });
      }
    } catch (err) {
      console.error("ui language on signup failed:", err);
    }
  }

  /**
   * Вход и /api/bootstrap: в автоматическом режиме язык следует за страной. Меняется только
   * когда страна известна — сбой геосервиса или частный адрес язык не сбрасывают.
   */
  public async refresh(userId: string, req: Request, waitMs: number): Promise<void> {
    try {
      if (!isUiLanguageAuto(this.userSettings.get(userId))) return;
      const detected = await this.detect(req, waitMs);
      if (detected.source !== "ip") return;
      // Пока ждали страну, пользователь мог выбрать язык сам.
      const fresh = this.userSettings.get(userId);
      if (!isUiLanguageAuto(fresh) || fresh.uiLanguage === detected.language) return;
      this.userSettings.update(userId, { uiLanguage: detected.language, uiLanguageAuto: true });
      // Открытые клиенты (в том числе тот, кому /api/bootstrap уже ответил старым языком).
      this.realtime.broadcastToUsers([userId], { type: "settings:updated", settings: { uiLanguage: detected.language, uiLanguageAuto: true } });
    } catch (err) {
      console.error("ui language refresh failed:", err);
    }
  }

  /**
   * /api/bootstrap: ответ ждёт страну не дольше waitMs (из кэша она приходит сразу). Узнанная
   * позже всё равно применяется (не дольше BACKGROUND_REFRESH_MAX_MS), и открытый клиент
   * получает settings:updated — первый экран не стоит.
   */
  public async refreshWithin(userId: string, req: Request, waitMs: number): Promise<void> {
    let running = this.background.get(userId);
    if (!running) {
      running = this.refresh(userId, req, BACKGROUND_REFRESH_MAX_MS).finally(() => this.background.delete(userId));
      this.background.set(userId, running);
    }
    await withDeadline(running, waitMs, undefined);
  }
}
