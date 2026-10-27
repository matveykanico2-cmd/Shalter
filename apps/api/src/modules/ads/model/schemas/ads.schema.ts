import { z } from "zod";
import { raw, requestBody, requestQuery, text } from "../../../../common/lib/zod.js";
import { CPM_MIN, isPlacement } from "../../lib/ad-campaign.mapper.js";

// Поля приводятся так же, как в server/routes/ads.js. Почти все проверки там идут после прав
// или поиска кампании (403/404), поэтому их тексты отвечает сервис; в схеме — только текст
// новой кампании, который маршрут проверяет первым делом.
// Ссылки, которые уходят в usesForeignUpload, и вложения (isSafeUrl из server/) остаются как
// пришли: их проверяет сервис.

const MAX_TEXT = 200;

/** Строка без пробелов по краям; не строка — undefined (поле не меняется). */
const trimmedIfString = () => raw().transform((v) => (typeof v === "string" ? v.trim() : undefined));

/** Места показа: `placements: [...]` или старое `placement: "id"`; ни одного — null. */
const pickPlacements = (b: { placements?: unknown; placement?: unknown }): string[] | null => {
  const list: unknown[] = Array.isArray(b.placements) ? b.placements : b.placement != null ? [b.placement] : [];
  const valid = list.filter(isPlacement);
  return valid.length ? valid : null;
};

export const adContentSchema = requestBody({
  /** Не строка — пусто: 400 в сервисе после проверки кабинета. */
  text: raw().transform((v) => (typeof v === "string" ? v.trim() : "")),
  url: raw().transform((v) => (typeof v === "string" ? v.trim() : v)),
  attachments: raw(),
});
export type AdContentDto = z.infer<typeof adContentSchema>;

export const grantAdsSchema = requestBody({
  userId: raw().transform((v) => (typeof v === "string" ? v : undefined)),
  active: raw().transform((v) => v !== false),
  /** Целое число дней; не положительное — null (срок по умолчанию из цен). */
  days: raw().transform((v) => (Number(v) > 0 ? Math.floor(Number(v)) : null)),
  forever: raw().transform((v) => !!v),
});
export type GrantAdsDto = z.infer<typeof grantAdsSchema>;

export const createCampaignSchema = requestBody({
  text: text()
    .transform((v) => v.trim().slice(0, MAX_TEXT))
    .refine((v) => !!v, { error: "Напишите текст объявления" }),
  title: text().transform((v) => v.trim().slice(0, 60)),
  url: raw(),
  imageUrl: raw(),
  placements: raw(),
  placement: raw(),
  cpmStars: raw().transform((v) => Number(v) || 20),
}).transform(({ placements, placement, ...b }) => ({ ...b, placement: pickPlacements({ placements, placement }) ?? ["discover"] }));
export type CreateCampaignDto = z.infer<typeof createCampaignSchema>;

/** Правка: undefined — поле не пришло (или не строка) и не меняется. */
export const patchCampaignSchema = requestBody({
  title: trimmedIfString().transform((v) => v?.slice(0, 60)),
  text: trimmedIfString().transform((v) => v?.slice(0, MAX_TEXT)),
  url: trimmedIfString().transform((v) => (v === undefined ? undefined : v.slice(0, 300) || null)),
  imageUrl: trimmedIfString().transform((v) => (v === undefined ? undefined : v || null)),
  placements: raw(),
  placement: raw(),
  cpmStars: raw().transform((v) => (Number.isFinite(Number(v)) ? Math.max(CPM_MIN, Number(v)) : undefined)),
}).transform(({ placements, placement, ...b }) => ({ ...b, placement: pickPlacements({ placements, placement }) }));
export type PatchCampaignDto = z.infer<typeof patchCampaignSchema>;

/** Целое число звёзд; не число — 0 (400 в сервисе после поиска кампании). */
export const budgetSchema = requestBody({ stars: raw().transform((v) => Math.floor(Number(v) || 0)) });
export type BudgetDto = z.infer<typeof budgetSchema>;

export const campaignStatusSchema = requestBody({ status: raw() });
export type CampaignStatusDto = z.infer<typeof campaignStatusSchema>;

export const reviewSchema = requestBody({
  approve: raw().transform((v) => v !== false),
  reason: text().transform((v) => v.trim().slice(0, 300)),
});
export type ReviewDto = z.infer<typeof reviewSchema>;

export const serveQuerySchema = requestQuery({
  placement: raw().transform((v) => (isPlacement(v) ? v : "discover")),
  /** Владелец страницы — только для места profile. */
  owner: raw().transform((v) => String(v || "")),
});
export type ServeQuery = z.infer<typeof serveQuerySchema>;
