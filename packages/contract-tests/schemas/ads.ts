// Реклама: кабинет рекламы в профиле (GET /api/ads/me, /request, /content, /grant)
// и рекламные кампании (rowToCampaign, server/data/adCampaigns.js; server/routes/ads.js).
import { z } from "zod";
import { isoDate } from "./common";
import { publicUser } from "./user";

export const adAttachment = z.strictObject({
  kind: z.enum(["image", "video", "file"]),
  url: z.string(),
  name: z.string().optional(),
  size: z.number().optional(),
});

/** GET /api/ads/me — undefined-поля пользователя (adsUntil, adText, adUrl) пропадают из JSON. */
export const adsMe = z.strictObject({
  isAdsActive: z.boolean(),
  adsUntil: isoDate.optional(),
  adsForever: z.boolean(),
  adText: z.string().optional(),
  adUrl: z.string().optional(),
  adAttachments: z.array(adAttachment),
  priceRub: z.number(),
  days: z.number(),
});

/** POST /api/ads/request: заявка админу в личку (delivered — админ выдал себе сам). */
export const adsRequestChat = z.strictObject({
  chatId: z.string(),
  adminPhone: z.string(),
  priceRub: z.number(),
  delivered: z.literal(true).optional(),
});

/** POST …/request при подключённой платёжке (DonatePay/DonationAlerts): заказ с кодом. */
export const donationOrder = z.strictObject({
  code: z.string().regex(/^SHP-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/),
  donationUrl: z.string(),
  provider: z.enum(["donationalerts", "donatepay"]),
  amountRub: z.number(),
});

export const userBody = z.strictObject({ user: publicUser });

export const placementId = z.enum(["chats", "chat", "discover", "profile"]);
export const placements = z.strictObject({ chats: z.string(), chat: z.string(), discover: z.string(), profile: z.string() });

export const campaign = z.strictObject({
  id: z.string().regex(/^ad_\d+_[a-z0-9]{1,4}$/),
  ownerId: z.string(),
  title: z.string(),
  text: z.string(),
  url: z.string().nullable(),
  imageUrl: z.string().nullable(),
  /** Места через запятую — как хранится в базе. */
  placement: z.string(),
  placements: z.array(placementId),
  status: z.enum(["review", "paused", "active", "finished", "rejected"]),
  rejectReason: z.string().nullable(),
  budgetStars: z.number().int(),
  spentStars: z.number().int(),
  cpmStars: z.number().int(),
  impressions: z.number().int(),
  clicks: z.number().int(),
  createdAt: isoDate,
  updatedAt: isoDate.nullable(),
  remainingStars: z.number().int(),
});

export const campaignBody = z.strictObject({ campaign });
export const campaignsBody = z.strictObject({
  campaigns: z.array(campaign),
  balanceStars: z.number().int(),
  placements,
  cpmMin: z.number().int(),
});
export const budgetBody = z.strictObject({ campaign, balanceStars: z.number().int() });

export const dailyRow = z.strictObject({
  campaignId: z.string(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  impressions: z.number().int(),
  clicks: z.number().int(),
  spentStars: z.number().int(),
});
export const statsBody = z.strictObject({ campaign, daily: z.array(dailyRow) });

/** Объявление для показа — publicCampaign. */
export const servedAd = z.strictObject({
  id: z.string(),
  title: z.string(),
  text: z.string(),
  url: z.string().nullable(),
  imageUrl: z.string().nullable(),
});
export const serveBody = z.strictObject({ ad: servedAd.nullable(), premium: z.literal(true).optional() });
export const clickBody = z.strictObject({ ok: z.literal(true), url: z.string().nullable() });

export const reviewCampaign = z.strictObject({
  ...campaign.shape,
  owner: z.union([
    z.strictObject({ id: z.string(), name: z.string(), username: z.string().nullable() }),
    z.strictObject({ id: z.string() }),
  ]),
});
export const reviewListBody = z.strictObject({ campaigns: z.array(reviewCampaign), placements });
