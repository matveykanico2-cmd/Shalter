import { z } from "zod";
import { isoDate } from "./common";

export const exchangePoint = z.strictObject({ rate: z.number().positive(), at: isoDate });
export const exchangeCoin = z.strictObject({
  id: z.string(),
  symbol: z.string(),
  name: z.string(),
  description: z.string(),
  color: z.string(),
  currentRate: z.number().positive(),
  changePercent: z.number(),
  createdBy: z.string(),
  createdAt: isoDate,
  updatedAt: isoDate,
  history: z.array(exchangePoint),
});

export const exchangeBody = z.strictObject({
  coins: z.array(exchangeCoin),
  permissions: z.strictObject({ canCreate: z.boolean(), isAdmin: z.boolean() }),
});
export const exchangeCoinBody = z.strictObject({ coin: exchangeCoin });
export const exchangeCreator = z.strictObject({ userId: z.string(), name: z.string(), username: z.string().nullable(), createdAt: isoDate });
export const exchangeCreatorsBody = z.strictObject({ creators: z.array(exchangeCreator) });
