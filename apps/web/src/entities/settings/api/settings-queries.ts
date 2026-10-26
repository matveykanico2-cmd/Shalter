import type { settings } from "@shalter/shared/schemas/settings";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";

import { http } from "@/shared/api";

export type Settings = z.infer<typeof settings>;

const baseKey = ["settings"] as const;

export const settingsQueries = {
  baseKey,
  /** Настройки пользователя (GET /api/settings); при старте кэш заполняет /api/bootstrap. */
  current: () =>
    queryOptions({
      queryKey: [...baseKey, "current"],
      queryFn: async ({ signal }) => (await http.get<{ settings: Settings }>("/api/settings", signal)).settings,
      staleTime: 5 * 60_000,
    }),
};

/** PATCH /api/settings: сервер сливает вложенные объекты по полям и отвечает всеми настройками. */
export const patchSettings = async (patch: object) => (await http.patch<{ settings: Settings }>("/api/settings", patch)).settings;
