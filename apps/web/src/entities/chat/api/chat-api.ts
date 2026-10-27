import type { chatBody } from "@shalter/shared/schemas/chats";
import type { z } from "zod";

import { http } from "@/shared/api";

/** Личка с человеком — существующая или новая (POST /api/chats). */
export const openDm = (userId: string, title: string, avatarColor?: string | null) =>
  http.post<z.infer<typeof chatBody>>("/api/chats", { userId, title, avatarColor });

/** Служебные чаты: поддержка Hugo, Shalter AI и «Сообщить об ошибке» — сервер создаёт или находит. */
const SERVICE_CHATS = { support: "/api/support/chat", ai: "/api/ai/chat", bug: "/api/support/report" } as const;

export const openServiceChat = (kind: keyof typeof SERVICE_CHATS) => http.post<{ chatId: string }>(SERVICE_CHATS[kind]);
