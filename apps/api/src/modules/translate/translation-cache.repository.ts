import { Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { InjectDb, type Db } from "../db/db.module.js";
import { translationCache } from "../db/schema.js";

const MAX_TEXT_LEN = 2000;

// Готовые переводы строк интерфейса — как server/data/translationCache.js.
@Injectable()
export class TranslationCacheRepository {
  public constructor(@InjectDb() private readonly db: Db) {}

  /** Уже переведённые строки: текст → перевод. */
  public find(lang: string, texts: string[]): Map<string, string> {
    const out = new Map<string, string>();
    for (const text of texts) {
      const row = this.db
        .select({ translated: translationCache.translated })
        .from(translationCache)
        .where(and(eq(translationCache.lang, lang), eq(translationCache.text, text)))
        .get();
      if (row) out.set(text, row.translated);
    }
    return out;
  }

  /** Длинные строки и пустые переводы не сохраняются. */
  public save(lang: string, entries: [string, string][]): void {
    if (!entries.length) return;
    this.db.transaction((tx) => {
      for (const [text, translated] of entries) {
        if (text.length > MAX_TEXT_LEN || !translated) continue;
        tx.insert(translationCache)
          .values({ lang, text, translated })
          .onConflictDoUpdate({ target: [translationCache.lang, translationCache.text], set: { translated } })
          .run();
      }
    });
  }
}
