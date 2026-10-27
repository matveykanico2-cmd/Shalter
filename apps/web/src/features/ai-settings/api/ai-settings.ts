import type { aiSettings, aiStateBody } from "@shalter/shared/schemas/integrations";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";

import { http } from "@/shared/api";

export type AiState = z.infer<typeof aiStateBody>;
export type AiSettings = z.infer<typeof aiSettings>;

const baseKey = ["ai-settings"] as const;

export const aiSettingsQueries = {
  baseKey,
  /** Тариф Shalter AI, расход за сегодня и «крутилки» ответов (GET /api/ai/settings). */
  current: () => queryOptions({ queryKey: [...baseKey, "current"], queryFn: ({ signal }) => http.get<AiState>("/api/ai/settings", signal) }),
};

export const updateAiSettings = (patch: Partial<AiSettings>) => http.patch<AiState>("/api/ai/settings", patch);
