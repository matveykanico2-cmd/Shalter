// Shalter для бизнеса: server/routes/business.js и настройки business
// (DEFAULT_SETTINGS.business, server/data/settings.js).
import { z } from "zod";
import { anyJson, isoDate } from "./common";
import { publicUser } from "./user";

const dayHours = z.strictObject({ closed: z.boolean(), open: z.string(), close: z.string() });
const autoReply = z.strictObject({ enabled: z.boolean(), text: z.string(), attachments: z.array(anyJson) });

/** settings.business по умолчанию (пока пользователь его не менял). */
export const businessSettings = z.strictObject({
  enabled: z.boolean(),
  hours: z.strictObject({ mon: dayHours, tue: dayHours, wed: dayHours, thu: dayHours, fri: dayHours, sat: dayHours, sun: dayHours }),
  timeZone: z.string().nullable(),
  showHours: z.boolean(),
  greeting: autoReply,
  away: autoReply,
  quickReplies: z.array(anyJson),
});

export const businessPlan = z.strictObject({ days: z.number().int(), priceRub: z.number().int(), label: z.string() });

/** GET /api/business/me — businessUntil нет, если бизнес не выдан или выдан навсегда. */
export const businessMe = z.strictObject({
  isBusiness: z.boolean(),
  businessUntil: isoDate.optional(),
  businessForever: z.boolean(),
  businessAddress: z.string().nullable(),
  businessLat: z.number().nullable(),
  businessLng: z.number().nullable(),
  isAdmin: z.boolean(),
  plans: z.record(z.string(), businessPlan),
  business: businessSettings,
});

/** POST /api/business/request без платёжки: заявка в личку админу (delivered — админ выдал себе сам). */
export const businessRequestChat = z.strictObject({
  chatId: z.string(),
  adminPhone: z.string(),
  delivered: z.literal(true).optional(),
});

export const businessUserBody = z.strictObject({ user: publicUser });
export const wsSelfUpdated = z.strictObject({ type: z.literal("self:updated"), user: publicUser });
