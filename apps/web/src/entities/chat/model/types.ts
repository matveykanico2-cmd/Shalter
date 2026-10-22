import type { chatSummary } from "@shalter/shared/schemas/chat";
import type { folder } from "@shalter/shared/schemas/folders";
import type { z } from "zod";

/** Чат в списке: последнее сообщение, счётчики, собеседник (GET /api/chats, /api/bootstrap). */
export type ChatSummary = z.infer<typeof chatSummary>;
export type ChatFolder = z.infer<typeof folder>;
