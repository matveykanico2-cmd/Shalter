import type { labelsBody } from "@shalter/shared/schemas/admin";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";

import { http } from "@/shared/api";

export type SafetyLabel = z.infer<typeof labelsBody>["labels"][number];

const baseKey = ["safety-labels"] as const;

export const safetyLabelQueries = {
  baseKey,
  /** Каталог меток (GET /api/labels): админ правит его в «Модерации», остальные только читают. */
  list: () =>
    queryOptions({
      queryKey: baseKey,
      queryFn: async ({ signal }) => (await http.get<z.infer<typeof labelsBody>>("/api/labels", signal)).labels,
      // Каталог меняется редко — как loadSafetyLabels в public/js/app.js, раз за сеанс.
      staleTime: Infinity,
    }),
};
