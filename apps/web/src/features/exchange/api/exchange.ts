import type { exchangeBody, exchangeCoinBody, exchangeCreatorsBody } from "@shalter/shared/schemas/exchange";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";

import { http } from "@/shared/api";

export type ExchangeData = z.infer<typeof exchangeBody>;
export type ExchangeCoin = z.infer<typeof exchangeCoinBody>["coin"];
export type ExchangeCreator = z.infer<typeof exchangeCreatorsBody>["creators"][number];

export const exchangeQueries = {
  list: () => queryOptions({ queryKey: ["exchange", "coins"], queryFn: ({ signal }) => http.get<ExchangeData>("/api/exchange", signal), refetchInterval: 30_000 }),
  creators: (enabled: boolean) => queryOptions({ queryKey: ["exchange", "creators"], queryFn: async ({ signal }) => (await http.get<z.infer<typeof exchangeCreatorsBody>>("/api/exchange/creators", signal)).creators, enabled }),
};

export const createCoin = (body: { symbol: string; name: string; description: string; color: string; rate: number }) => http.post<z.infer<typeof exchangeCoinBody>>("/api/exchange/coins", body);
export const updateCoinRate = (id: string, rate: number) => http.put<z.infer<typeof exchangeCoinBody>>(`/api/exchange/coins/${encodeURIComponent(id)}/rate`, { rate });
export const setExchangeCreator = (userId: string, enabled: boolean) => http.put<z.infer<typeof exchangeCreatorsBody>>("/api/exchange/creators", { userId, enabled });
