import type { postViewBody } from "@shalter/shared/schemas/channels";
import type { z } from "zod";

import { http } from "@/shared/api";

/** Просмотр поста подписчиком (POST /api/posts/:id/view). */
export const countPostView = (postId: string) => http.post<z.infer<typeof postViewBody>>(`/api/posts/${encodeURIComponent(postId)}/view`);
