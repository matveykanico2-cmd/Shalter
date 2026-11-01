import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { mapWithConcurrency, splitIntoChunks, translateChunk, translateOne } from "./lib/google-translate.js";
import type { TranslateBatchDto, TranslateDto } from "./model/schemas/translate.schema.js";
import { GuestTranslationBudgetStore } from "./stores/guest-translation-budget.store.js";
import { TranslationCacheRepository } from "./translation-cache.repository.js";

const HAS_CYRILLIC = /[а-яё]/i;
const GUEST_MAX_LENGTH = 200;

// Перевод сообщений и строк интерфейса (/api/translate) — как server/routes/translate.js.
// Поля проверены схемой.
@Injectable()
export class TranslateService {
  public constructor(
    private readonly cache: TranslationCacheRepository,
    private readonly budget: GuestTranslationBudgetStore
  ) {}

  public async translate({ text, target }: TranslateDto) {
    try {
      return await translateOne(text, target);
    } catch (err) {
      console.error("translate upstream failed:", err);
      throw new ApiError(502, "Сервис перевода сейчас недоступен, попробуйте позже");
    }
  }

  /** Строки интерфейса пачкой: сначала из кэша, недостающие — у Google, и в кэш. */
  public async batch({ texts: capped, target: lang }: TranslateBatchDto) {
    return { translations: await this.translateTexts(capped, lang, Number.POSITIVE_INFINITY) };
  }

  /**
   * Строки интерфейса без входа (экраны входа и регистрации на языке страны). Переводятся только
   * надписи интерфейса — короткие строки с кириллицей, остальное — null; у Google — не больше
   * лимита на адрес (GuestTranslationBudgetStore), сверх него — только то, что уже есть в кэше.
   */
  public async guestBatch({ texts: capped, target: lang }: TranslateBatchDto, ip: string) {
    const eligible = capped.map((t) => (!t || (t.length <= GUEST_MAX_LENGTH && HAS_CYRILLIC.test(t)) ? t : null));
    const translations = await this.translateTexts(
      eligible.filter((t): t is string => t !== null),
      lang,
      (wanted) => this.budget.take(ip, wanted)
    );
    let i = 0;
    return { translations: eligible.map((t) => (t === null ? null : translations[i++]!)) };
  }

  /** Из кэша, недостающие — у Google (не больше, чем разрешит allowUpstream), и в кэш. */
  private async translateTexts(capped: string[], lang: string, allowUpstream: number | ((wanted: number) => number)) {
    const known = this.cache.find(lang, [...new Set(capped.filter(Boolean))]);
    const missingAll = [...new Set(capped.filter((t) => t && !known.has(t)))];
    const allowed = typeof allowUpstream === "number" ? allowUpstream : missingAll.length ? allowUpstream(missingAll.length) : 0;
    const missing = missingAll.slice(0, allowed);

    if (missing.length) {
      const chunks = splitIntoChunks(missing);
      const results = await mapWithConcurrency(chunks, 4, (chunk) => translateChunk(chunk, lang));
      const fresh: [string, string][] = [];
      chunks.forEach((chunk, ci) =>
        chunk.forEach((text, i) => {
          const translated = results[ci][i];
          if (!translated) return;
          known.set(text, translated);
          fresh.push([text, translated]);
        })
      );
      this.cache.save(lang, fresh);
    }

    return capped.map((t) => (t ? (known.get(t) ?? null) : t));
  }
}
