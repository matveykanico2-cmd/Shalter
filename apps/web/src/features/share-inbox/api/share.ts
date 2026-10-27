import type { shareBody } from "@shalter/shared/schemas/misc";
import type { z } from "zod";

import { http, type Uploaded } from "@/shared/api";

export type SharePayload = z.infer<typeof shareBody>["share"];

/** Содержимое «Поделиться» по токену — выдаётся один раз (GET /api/share/:token). */
export const getSharePayload = (token: string) => http.get<z.infer<typeof shareBody>>(`/api/share/${encodeURIComponent(token)}`);

export const sendShared = (chatId: string, text: string, attachments: Uploaded[]) =>
  http.post<unknown>(`/api/chats/${encodeURIComponent(chatId)}/messages`, attachments.length ? { text, attachments } : { text });
