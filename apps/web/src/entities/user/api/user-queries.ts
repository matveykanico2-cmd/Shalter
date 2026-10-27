import type { contactListItem } from "@shalter/shared/schemas/contacts";
import type { otherProfileBody, ownProfileBody } from "@shalter/shared/schemas/users";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";

import { http } from "@/shared/api";

export type UserProfile = z.infer<typeof otherProfileBody> | z.infer<typeof ownProfileBody>;
export type Contact = z.infer<typeof contactListItem>["user"];

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
  /** Свои контакты (GET /api/contacts) — из них выбирают участников и собеседника. */
  contacts: () =>
    queryOptions({
      queryKey: [...baseKey, "contacts"],
      queryFn: async ({ signal }) => (await http.get<{ contacts: z.infer<typeof contactListItem>[] }>("/api/contacts", signal)).contacts.map((c) => c.user),
    }),
};
