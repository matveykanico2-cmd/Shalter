import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { mapWithConcurrency, splitIntoChunks, translateChunk, translateOne } from "./lib/google-translate.js";
import type { TranslateBatchDto, TranslateDto } from "./model/schemas/translate.schema.js";
import { TranslationCacheRepository } from "./translation-cache.repository.js";

// Перевод сообщений и строк интерфейса (/api/translate) — как server/routes/translate.js.
// Поля проверены схемой.
@Injectable()
export class TranslateService {
  public constructor(private readonly cache: TranslationCacheRepository) {}

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
}
