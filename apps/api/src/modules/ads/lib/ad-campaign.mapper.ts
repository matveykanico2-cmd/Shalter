import type { AdCampaign, AdCampaignRow } from "../model/domain.js";

// Кампания из строки ad_campaigns — rowToCampaign в server/data/adCampaigns.js.
export const CPM_MIN = 5;

/** Места показа и подписи к ним. */
export const PLACEMENTS: Record<string, string> = {
  chats: "Верх списка чатов",
  chat: "В каналах — рекламное сообщение",
  discover: "Каталог каналов",
  profile: "Своя страница профиля",
};
export const isPlacement = (p: unknown): p is string => typeof p === "string" && Object.hasOwn(PLACEMENTS, p);

export function toCampaign(row: AdCampaignRow): AdCampaign {
  return {
    id: row.id,
    ownerId: row.ownerId,
    title: row.title,
    text: row.text,
    url: row.url ?? null,
    imageUrl: row.imageUrl ?? null,
    // Колонка через запятую, чтобы кампания шла в нескольких местах сразу; у старых строк
    // в ней одно место — получается список из одного.
    placement: row.placement,
    placements: String(row.placement || "discover").split(",").filter(Boolean),
    status: row.status,
    rejectReason: row.rejectReason ?? null,
    budgetStars: row.budgetStars,
    spentStars: row.spentStars,
    cpmStars: row.cpmStars,
    impressions: row.impressions,
    clicks: row.clicks,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt ?? null,
    remainingStars: Math.max(0, row.budgetStars - row.spentStars),
  };
}

/** Значение колонки placement: места через запятую без повторов; пусто — discover. */
export function joinPlacements(p: unknown): string {
  const list = [...new Set((Array.isArray(p) ? p : [p]).filter(Boolean).map(String))];
  return list.length ? list.join(",") : "discover";
}

/** Карточка объявления для показа. */
export const publicCampaign = (c: AdCampaign) => ({ id: c.id, title: c.title, text: c.text, url: c.url, imageUrl: c.imageUrl });
