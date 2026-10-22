import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { unsupportedLanguages } from "../../legacy/legacy.js";
import { mapWithConcurrency, splitIntoChunks, translateChunk, translateOne } from "./lib/google-translate.js";
import type { TranslateBatchDto, TranslateDto } from "./model/schemas/translate.schema.js";
import { TranslationCacheRepository } from "./translation-cache.repository.js";

// Перевод сообщений и строк интерфейса (/api/translate) — как server/routes/translate.js.
const MAX_BATCH = 300;

@Injectable()
export class TranslateService {
  public constructor(private readonly cache: TranslationCacheRepository) {}

  public async translate(dto: TranslateDto) {
    const { text, target } = dto;
    if (text != null && typeof text !== "string") throw new ApiError(400, "Некорректный текст");
    if (!text?.trim()) throw new ApiError(400, "Нечего переводить");
    const lang = this.target(target);
    try {
      return await translateOne(text, lang);
    } catch (err) {
      console.error("translate upstream failed:", err);
      throw new ApiError(502, "Сервис перевода сейчас недоступен, попробуйте позже");
    }
  }

  /** Строки интерфейса пачкой: сначала из кэша, недостающие — у Google, и в кэш. */
  public async batch(dto: TranslateBatchDto) {
    const { texts } = dto;
    if (!Array.isArray(texts) || texts.length === 0) throw new ApiError(400, "texts must be a non-empty array");
    const target = this.target(dto.target);
    if (texts.length > MAX_BATCH) throw new ApiError(400, `Слишком много строк за один запрос (максимум ${MAX_BATCH})`);

    const lang = target.trim().toLowerCase();
    const capped = texts.map((t) => String(t ?? "").trim().slice(0, 2000));
    const known = this.cache.find(lang, [...new Set(capped.filter(Boolean))]);
    const missing = [...new Set(capped.filter((t) => t && !known.has(t)))];

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

    return { translations: capped.map((t) => (t ? (known.get(t) ?? null) : t)) };
  }

  private target(target: unknown): string {
    if (typeof target !== "string" || !target.trim()) throw new ApiError(400, "Не указан язык перевода");
    const { isUnsupportedLanguage, UNSUPPORTED_MESSAGE } = unsupportedLanguages();
    if (isUnsupportedLanguage(target)) throw new ApiError(400, UNSUPPORTED_MESSAGE);
    return target;
  }
}
