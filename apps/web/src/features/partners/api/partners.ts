import type { partnerInfoBody } from "@shalter/shared/schemas/reports";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";

import { http } from "@/shared/api";

export const partnersQueries = {
  /** Условия партнёрской программы (GET /api/partners/me). */
  me: () => queryOptions({ queryKey: ["partners", "me"], queryFn: ({ signal }) => http.get<z.infer<typeof partnerInfoBody>>("/api/partners/me", signal) }),
};

/** Личка с администрацией по партнёрке. */
export const openPartnerChat = () => http.post<{ chatId: string }>("/api/partners/chat");
