import type { remainingBody } from "@shalter/shared/schemas/auth";
import type { z } from "zod";

import { http } from "@/shared/api";

/** Выход из аккаунта uid на этом устройстве (остальные остаются); без uid — из всех. */
export const signOut = (uid?: string) => http.post<z.infer<typeof remainingBody>>("/api/auth/logout", uid ? { uid } : {});
