import type { otherProfileBody, ownProfileBody } from "@shalter/shared/schemas/users";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";

import { http } from "@/shared/api";

export type UserProfile = z.infer<typeof otherProfileBody> | z.infer<typeof ownProfileBody>;

const baseKey = ["users"] as const;

export const userQueries = {
  baseKey,
  /** Профиль (GET /api/users/:id) — поля, скрытые приватностью, сервер не присылает. */
  profile: (userId: string) =>
    queryOptions({
      queryKey: [...baseKey, "profile", userId],
      queryFn: ({ signal }) => http.get<UserProfile>(`/api/users/${encodeURIComponent(userId)}`, signal),
      // Как PROFILE_TTL_MS в public/js/components/infoPanel.js.
      staleTime: 30_000,
    }),
};
