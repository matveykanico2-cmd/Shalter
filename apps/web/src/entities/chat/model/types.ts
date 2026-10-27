import type { chatSummary } from "@shalter/shared/schemas/chat";
import type { chatCard } from "@shalter/shared/schemas/chats";
import type { folder } from "@shalter/shared/schemas/folders";
import type { z } from "zod";

/** Чат в списке: последнее сообщение, счётчики, собеседник (GET /api/chats, /api/bootstrap). */
export type ChatSummary = z.infer<typeof chatSummary>;
export type ChatFolder = z.infer<typeof folder>;

/** GET /api/chats/:id — чат и его участники. */
export type ChatCard = z.infer<typeof chatCard>;
export type ChatMember = ChatCard["members"][number];
