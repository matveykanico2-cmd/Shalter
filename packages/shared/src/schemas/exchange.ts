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

export const exchangeBalance = z.strictObject({ coin: exchangeCoin.omit({ history: true }), amount: z.number().nonnegative() });
export const exchangeWalletBody = z.strictObject({ balances: z.array(exchangeBalance) });
export const exchangeTransaction = z.strictObject({
  id: z.string(),
  kind: z.enum(["mint", "transfer", "convert"]),
  coinId: z.string(),
  targetCoinId: z.string().nullable(),
  fromUserId: z.string().nullable(),
  toUserId: z.string().nullable(),
  amount: z.number().positive(),
  targetAmount: z.number().positive().nullable(),
  chatId: z.string().nullable(),
  createdAt: isoDate,
});
export const exchangeTransactionBody = z.strictObject({ transaction: exchangeTransaction, wallet: exchangeWalletBody });
