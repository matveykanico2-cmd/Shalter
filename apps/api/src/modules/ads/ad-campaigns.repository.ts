import { Injectable } from "@nestjs/common";
import { and, asc, desc, eq, gt, ne, sql } from "drizzle-orm";
import { InjectDb, type Db } from "../db/db.module.js";
import { adCampaigns, adDaily } from "../db/schema.js";
import { CPM_MIN, joinPlacements, toCampaign } from "./lib/ad-campaign.mapper.js";
import type { AdCampaign, AdCampaignPatch, AdDailyRow } from "./model/domain.js";

// Рекламные кампании и их статистика по дням — таблицы ad_campaigns и ad_daily, как
// server/data/adCampaigns.js.
const PATCHABLE = ["title", "text", "url", "imageUrl", "placement", "status", "rejectReason", "budgetStars", "cpmStars"] as const;

/** Кампания идёт в этом месте: placement — список через запятую. */
const runsIn = (placement: string) => sql`(',' || ${adCampaigns.placement} || ',') LIKE ('%,' || ${placement} || ',%')`;
const hasBudget = gt(adCampaigns.budgetStars, adCampaigns.spentStars);

@Injectable()
export class AdCampaignsRepository {
  public constructor(@InjectDb() private readonly db: Db) {}

  public listByOwner(ownerId: string): AdCampaign[] {
    return this.db.select().from(adCampaigns).where(eq(adCampaigns.ownerId, ownerId)).orderBy(desc(adCampaigns.createdAt)).all().map(toCampaign);
  }

  public findById(id: string): AdCampaign | undefined {
    const row = this.db.select().from(adCampaigns).where(eq(adCampaigns.id, id)).get();
    return row && toCampaign(row);
  }

  public listForReview(): AdCampaign[] {
    return this.db.select().from(adCampaigns).where(eq(adCampaigns.status, "review")).orderBy(asc(adCampaigns.createdAt)).all().map(toCampaign);
  }

  /** Случайная активная кампания с бюджетом в этом месте, кроме кампаний excludeOwnerId. */
  public pickForPlacement(placement: string, excludeOwnerId: string | null): AdCampaign | undefined {
    const row = this.db
      .select()
      .from(adCampaigns)
      .where(and(eq(adCampaigns.status, "active"), runsIn(placement), hasBudget, excludeOwnerId == null ? undefined : ne(adCampaigns.ownerId, excludeOwnerId)))
      .orderBy(sql`RANDOM()`)
      .limit(1)
      .get();
    return row && toCampaign(row);
  }

  /** Своя активная кампания рекламодателя — для места profile. */
  public pickForOwner(placement: string, ownerId: string): AdCampaign | undefined {
    const row = this.db
      .select()
      .from(adCampaigns)
      .where(and(eq(adCampaigns.status, "active"), eq(adCampaigns.ownerId, ownerId), runsIn(placement), hasBudget))
      .orderBy(sql`RANDOM()`)
      .limit(1)
      .get();
    return row && toCampaign(row);
  }

  public create(c: { ownerId: string; title: string; text: string; url: string | null; imageUrl: string | null; placement: string[]; cpmStars: number }): AdCampaign {
    const id = `ad_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    this.db
      .insert(adCampaigns)
      .values({
        id,
        status: "review",
        ownerId: c.ownerId,
        title: c.title || "Без названия",
        text: c.text || "",
        url: c.url || null,
        imageUrl: c.imageUrl || null,
        placement: joinPlacements(c.placement),
        cpmStars: Math.max(CPM_MIN, Number(c.cpmStars) || 20),
        createdAt: new Date().toISOString(),
      })
      .run();
    return this.findById(id)!;
  }

  public update(id: string, patch: AdCampaignPatch): AdCampaign | undefined {
    const set: Record<string, unknown> = {};
    for (const key of PATCHABLE) if (key in patch) set[key] = key === "placement" ? joinPlacements(patch.placement) : patch[key];
    if (Object.keys(set).length) {
      this.db
        .update(adCampaigns)
        .set({ ...set, updatedAt: new Date().toISOString() })
        .where(eq(adCampaigns.id, id))
        .run();
    }
    return this.findById(id);
  }

  public delete(id: string): void {
    this.db.delete(adCampaigns).where(eq(adCampaigns.id, id)).run();
  }

  /**
   * Показ: оплата за тысячу показов (cpmStars, по умолчанию — цена кампании) в пределах бюджета,
   * статистика дня; бюджет кончился — кампания finished. Сколько звёзд списано; нет кампании — null.
   */
  public recordImpression(id: string, cpmStars?: number): number | null {
    return this.db.transaction((tx) => {
      const day = new Date().toISOString().slice(0, 10);
      const row = tx
        .select({ impressions: adCampaigns.impressions, spentStars: adCampaigns.spentStars, budgetStars: adCampaigns.budgetStars, cpmStars: adCampaigns.cpmStars })
        .from(adCampaigns)
        .where(eq(adCampaigns.id, id))
        .get();
      if (!row) return null;
      const impressions = row.impressions + 1;
      const due = Math.floor((impressions * (cpmStars ?? row.cpmStars)) / 1000);
      const spent = Math.min(row.budgetStars, Math.max(row.spentStars, due));
      const charged = spent - row.spentStars;
      tx.update(adCampaigns).set({ impressions, spentStars: spent }).where(eq(adCampaigns.id, id)).run();
      tx.insert(adDaily)
        .values({ campaignId: id, day, impressions: 1, spentStars: charged })
        .onConflictDoUpdate({
          target: [adDaily.campaignId, adDaily.day],
          set: { impressions: sql`${adDaily.impressions} + 1`, spentStars: sql`${adDaily.spentStars} + ${charged}` },
        })
        .run();
      if (spent >= row.budgetStars) {
        tx.update(adCampaigns).set({ status: "finished" }).where(and(eq(adCampaigns.id, id), eq(adCampaigns.status, "active"))).run();
      }
      return charged;
    });
  }

  public recordClick(id: string): void {
    this.db.transaction((tx) => {
      const day = new Date().toISOString().slice(0, 10);
      tx.update(adCampaigns).set({ clicks: sql`${adCampaigns.clicks} + 1` }).where(eq(adCampaigns.id, id)).run();
      tx.insert(adDaily)
        .values({ campaignId: id, day, clicks: 1 })
        .onConflictDoUpdate({ target: [adDaily.campaignId, adDaily.day], set: { clicks: sql`${adDaily.clicks} + 1` } })
        .run();
    });
  }

  /** Статистика по дням за последние days дней, по возрастанию даты. */
  public daily(campaignId: string, days = 14): AdDailyRow[] {
    return this.db.select().from(adDaily).where(eq(adDaily.campaignId, campaignId)).orderBy(desc(adDaily.day)).limit(days).all().reverse();
  }
}
