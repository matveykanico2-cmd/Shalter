import type { chatBody } from "@shalter/shared/schemas/chats";
import type { z } from "zod";

import { http } from "@/shared/api";

/** Буст группы или канала (Premium, раз в сутки): +1 балл к уровню. */
export const boostChat = (chatId: string) => http.post<z.infer<typeof chatBody>>(`/api/chats/${encodeURIComponent(chatId)}/vote`, {});
