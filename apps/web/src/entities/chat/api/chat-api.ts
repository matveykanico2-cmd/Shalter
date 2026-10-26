import type { chatBody } from "@shalter/shared/schemas/chats";
import type { z } from "zod";

import { http } from "@/shared/api";

/** Личка с человеком — существующая или новая (POST /api/chats). */
export const openDm = (userId: string, title: string, avatarColor?: string | null) =>
  http.post<z.infer<typeof chatBody>>("/api/chats", { userId, title, avatarColor });
