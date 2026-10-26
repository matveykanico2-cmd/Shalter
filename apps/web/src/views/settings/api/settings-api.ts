import type { sessionsBody } from "@shalter/shared/schemas/auth";
import type { holidayCatalog, storageBody } from "@shalter/shared/schemas/settings";
import type { patchProfileBody } from "@shalter/shared/schemas/users";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";

import { http } from "@/shared/api";

export type DeviceSession = z.infer<typeof sessionsBody>["sessions"][number];
export type HolidayCatalog = z.infer<typeof holidayCatalog>;

export const settingsViewQueries = {
  /** Сеансы на устройствах (GET /api/sessions) — и число у «Устройства» в меню. */
  sessions: () =>
    queryOptions({
      queryKey: ["sessions", "list"],
      queryFn: async ({ signal }) => (await http.get<z.infer<typeof sessionsBody>>("/api/sessions", signal)).sessions,
    }),
  /** Сколько места занимают свои вложения (GET /api/settings/storage). */
  storage: () =>
    queryOptions({
      queryKey: ["settings", "storage"],
      queryFn: ({ signal }) => http.get<z.infer<typeof storageBody>>("/api/settings/storage", signal),
      staleTime: 0,
    }),
  /** Встроенные праздники приходят вместе с настройками (GET /api/settings). */
  holidayCatalog: () =>
    queryOptions({
      queryKey: ["settings", "holiday-catalog"],
      queryFn: async ({ signal }) => (await http.get<{ holidayCatalog: HolidayCatalog }>("/api/settings", signal)).holidayCatalog,
      staleTime: Infinity,
    }),
};

export const terminateSession = (deviceId: string) => http.delete(`/api/sessions/${deviceId}`);
export const terminateOtherSessions = () => http.post("/api/sessions/terminate-others");

/** PATCH /api/users/:id — свой профиль; ответ — selfUser. */
export const updateProfile = async (userId: string, patch: Record<string, unknown>) => {
  const { user } = await http.patch<z.infer<typeof patchProfileBody>>(`/api/users/${userId}`, patch);
  if (!user) throw new Error("Не удалось сохранить");
  return user;
};
