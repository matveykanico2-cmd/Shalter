import type { typingBody } from "@shalter/shared/schemas/chats";
import type { z } from "zod";

import { http } from "@/shared/api";

/** Кто сейчас печатает (GET /api/chats/:id/typing) — когда сокета нет. */
export const getTyping = (chatId: string) => http.get<z.infer<typeof typingBody>>(`/api/chats/${encodeURIComponent(chatId)}/typing`);
