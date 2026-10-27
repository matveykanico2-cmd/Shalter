import type { switchBody } from "@shalter/shared/schemas/auth";
import type { z } from "zod";

import { http } from "@/shared/api";

/** Сделать текущим другой аккаунт этого устройства (POST /api/auth/switch). */
export const switchAccountRequest = (userId: string) => http.post<z.infer<typeof switchBody>>("/api/auth/switch", { userId });
