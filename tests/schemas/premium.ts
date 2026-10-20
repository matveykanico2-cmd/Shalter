// Shalter Premium (server/routes/premium.js): тарифы с ценой в звёздах, покупка
// за звёзды, заявка админу и выдача/снятие админом.
import { z } from "zod";
import { isoDate } from "./common";
import { publicUser } from "./user";

export const premiumPlan = z.strictObject({ days: z.number(), priceRub: z.number(), label: z.string(), stars: z.number() });

/** GET /api/premium/me. premiumUntil нет, если Premium нет или он навсегда. */
export const premiumMeBody = z.strictObject({
  isPremium: z.boolean(),
  premiumUntil: isoDate.optional(),
  premiumForever: z.boolean(),
  isAdmin: z.boolean(),
  plans: z.record(z.string(), premiumPlan),
  starsBalance: z.number(),
});

/** POST /buy-with-stars. chatId — «Избранное» покупателя, куда пишется квитанция. */
export const buyWithStarsBody = z.strictObject({ delivered: z.literal(true), stars: z.number(), balance: z.number(), chatId: z.string() });
/** POST /request от главного админа — Premium выдаётся себе сразу. */
export const premiumSelfGrantBody = z.strictObject({ chatId: z.string(), adminPhone: z.string(), delivered: z.literal(true) });
/** POST /grant. */
export const premiumGrantBody = z.strictObject({ user: publicUser });
