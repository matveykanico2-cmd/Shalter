import type { appDataBody, appOpenBody, audienceBody } from "@shalter/shared/schemas/bots";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";

import { http } from "@/shared/api";

const botPath = (botId: string) => `/api/bots/${encodeURIComponent(botId)}`;

export const botAppQueries = {
  /** Сколько людей пользуется ботом и есть ли у него мини-приложение (GET /api/bots/audience/:id). */
  audience: (botId: string) =>
    queryOptions({
      queryKey: ["bots", "audience", botId],
      queryFn: ({ signal }) => http.get<z.infer<typeof audienceBody>>(`/api/bots/audience/${encodeURIComponent(botId)}`, signal),
    }),
};

/** Сессия мини-приложения: адрес с подписанным initData. */
export const openBotApp = (botId: string, body: { url?: string | null; chatId?: string | null; theme: "light" | "dark" }) =>
  http.post<z.infer<typeof appOpenBody>>(`${botPath(botId)}/app/open`, body);

/** sendData из мини-приложения — сообщением в чат с ботом. */
export const sendBotAppData = (botId: string, data: string) => http.post<z.infer<typeof appDataBody>>(`${botPath(botId)}/app/data`, { data });
