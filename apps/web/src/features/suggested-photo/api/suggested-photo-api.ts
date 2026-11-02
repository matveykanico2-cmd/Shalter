import type { publicUser } from "@shalter/shared/schemas/user";
import type { z } from "zod";

import { http } from "@/shared/api";

type AvatarsResult = { avatars: { url: string; kind: "image" | "video"; poster?: string }[]; user: z.infer<typeof publicUser> };

export const suggestedPhotoApi = {
  /** «Установить как фото профиля» под фото, которое предложил собеседник: сервер ставит свою копию. */
  apply: (messageId: string, poster: string) => http.post<AvatarsResult>("/api/avatars/from-suggestion", { messageId, poster }),
};
