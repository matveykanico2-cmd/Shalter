import type { versionBody } from "@shalter/shared/schemas/misc";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";

import { http } from "@/shared/api";

export const aboutQueries = {
  /** Версия сервера (GET /api/version) — для «О приложении». */
  version: () => queryOptions({ queryKey: ["version"], queryFn: ({ signal }) => http.get<z.infer<typeof versionBody>>("/api/version", signal), staleTime: Infinity }),
};
