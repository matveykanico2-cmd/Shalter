import type { donationOrder } from "@shalter/shared/schemas/ads";
import type { businessMe, businessRequestChat } from "@shalter/shared/schemas/business";
import type { patchProfileBody } from "@shalter/shared/schemas/users";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";

import type { Settings } from "@/entities/settings";

import { http } from "@/shared/api";

export type BusinessInfo = z.infer<typeof businessMe>;
/** Как в настройках (GET /api/settings): быстрые ответы там уже с id от сервера. */
export type BusinessSettings = Settings["business"];

export const businessQueries = {
  /** Подписка, тарифы и настройки бизнеса (GET /api/business/me). */
  me: () => queryOptions({ queryKey: ["business", "me"], queryFn: ({ signal }) => http.get<BusinessInfo>("/api/business/me", signal) }),
};

export const requestBusiness = (plan: string) =>
  http.post<Partial<z.infer<typeof businessRequestChat>> & Partial<z.infer<typeof donationOrder>>>("/api/business/request", { plan });

/** Адрес на профиле — поле профиля (PATCH /api/users/:id). */
export const saveBusinessAddress = (userId: string, businessAddress: string | null) =>
  http.patch<z.infer<typeof patchProfileBody>>(`/api/users/${encodeURIComponent(userId)}`, { businessAddress });
