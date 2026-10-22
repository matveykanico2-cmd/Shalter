// Звёзды: баланс, наборы, начисление админом, цена входящих, буст/удаление за
// звёзды и переводы (server/routes/stars.js, data/stars.js, data/pricing.js).
import { z } from "zod";
import { message } from "./message";
import { publicUser } from "./user";

export const starPack = z.strictObject({ id: z.string(), stars: z.number(), priceRub: z.number() });

/** GET /api/stars. */
export const starsInfoBody = z.strictObject({
  balance: z.number(),
  userId: z.string(),
  messagePriceStars: z.number(),
  packs: z.array(starPack),
  costs: z.strictObject({ boost: z.number(), boostMinutes: z.number(), delete: z.number(), maxMessagePrice: z.number() }),
});

/** POST /request от главного админа — звёзды начисляются сразу. */
export const starsGrantedSelfBody = z.strictObject({ balance: z.number(), granted: z.literal(true) });
/** POST /grant. */
export const starsGrantBody = z.strictObject({ user: publicUser, balance: z.number() });
/** POST /price. */
export const messagePriceBody = z.strictObject({ messagePriceStars: z.number() });
/** POST /boost/:messageId. */
export const boostBody = z.strictObject({ message, balance: z.number() });
/** POST /delete/:messageId. */
export const paidDeleteBody = z.strictObject({ ok: z.literal(true), balance: z.number() });
/** POST /transfer. */
export const transferBody = z.strictObject({ ok: z.literal(true), amount: z.number(), balance: z.number(), to: publicUser, from: z.string() });
/** 402 у буста, удаления, перевода — текст и текущий баланс. */
export const notEnoughWithBalance = z.strictObject({ error: z.string(), balance: z.number() });

/** WS chat:updated после смены цены — только id чата, клиент перезапрашивает сам. */
export const wsChatPing = z.strictObject({ type: z.literal("chat:updated"), chat: z.strictObject({ id: z.string() }) });
