import { randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { and, desc, eq, sql } from "drizzle-orm";
import { InjectDb, type Db } from "../db/db.module.js";
import { promoCodeRedemptions, promoCodes } from "../db/schema.js";
import { generatePromoCode, parsePromoConfig, toPromoCode } from "./lib/promo-code.js";
import type { PromoCode, PromoConfig } from "./model/domain.js";

export type RedeemResult = { error: string } | { promo: PromoCode; config: PromoConfig };

// Промокоды и их активации — то же, что server/data/promoCodes.js.
@Injectable()
export class PromotionsRepository {
  public constructor(@InjectDb() private readonly db: Db) {}

  public list(): PromoCode[] {
    return this.db.select().from(promoCodes).orderBy(desc(promoCodes.createdAt)).all().map(toPromoCode);
  }

  public findById(id: string): PromoCode | undefined {
    const row = this.db.select().from(promoCodes).where(eq(promoCodes.id, id)).get();
    return row ? toPromoCode(row) : undefined;
  }

  public findByCode(code: string): PromoCode | undefined {
    const row = this.db.select().from(promoCodes).where(eq(promoCodes.code, code.toUpperCase())).get();
    return row ? toPromoCode(row) : undefined;
  }

  /** undefined — код уже занят. */
  public create(input: { code: string; prize: string; config: PromoConfig; usesTotal: number | null; createdBy: string }): PromoCode | undefined {
    const code = (input.code || generatePromoCode()).toUpperCase();
    const { changes } = this.db
      .insert(promoCodes)
      .values({
        id: `pc_${Date.now()}_${randomBytes(3).toString("hex")}`,
        code,
        prize: input.prize,
        config: JSON.stringify(input.config),
        usesTotal: input.usesTotal,
        used: 0,
        createdBy: input.createdBy,
        createdAt: new Date().toISOString(),
      })
      .onConflictDoNothing()
      .run();
    return changes ? this.findByCode(code) : undefined;
  }

  /**
   * Проверка и учёт активации — одной транзакцией, чтобы два параллельных запроса не провели
   * последнюю активацию дважды.
   */
  public redeem(code: string, userId: string): RedeemResult {
    return this.db.transaction((tx) => {
      const row = tx.select().from(promoCodes).where(eq(promoCodes.code, code.toUpperCase())).get();
      if (!row) return { error: "Код не найден" };
      const config = parsePromoConfig(row.config);
      if (!config) return { error: "Ошибка конфигурации кода" };
      const already = tx
        .select({ codeId: promoCodeRedemptions.codeId })
        .from(promoCodeRedemptions)
        .where(and(eq(promoCodeRedemptions.codeId, row.id), eq(promoCodeRedemptions.userId, userId)))
        .get();
      if (already) return { error: "Вы уже активировали этот код" };
      if (row.usesTotal !== null && row.used >= row.usesTotal) return { error: "Код уже использован" };
      tx.update(promoCodes).set({ used: sql`${promoCodes.used} + 1` }).where(eq(promoCodes.id, row.id)).run();
      tx.insert(promoCodeRedemptions).values({ codeId: row.id, userId, redeemedAt: new Date().toISOString() }).run();
      return { promo: toPromoCode(row), config };
    });
  }

  public delete(id: string): void {
    this.db.delete(promoCodes).where(eq(promoCodes.id, id)).run();
  }

  public setUsesTotal(id: string, usesTotal: number | null): void {
    this.db.update(promoCodes).set({ usesTotal }).where(eq(promoCodes.id, id)).run();
  }
}
