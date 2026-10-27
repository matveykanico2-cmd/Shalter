import { z } from "zod";
import { raw, requestBody } from "../../../../common/lib/zod.js";

// userId и role сравниваются со списками участников и ролями как пришли (не строка — ни с кем
// не совпадёт), until сохраняется как есть: проверки — в сервисе, после проверок прав.

export const memberRoleSchema = requestBody({ userId: raw(), role: raw() });
export type MemberRoleDto = z.infer<typeof memberRoleSchema>;

export const memberTitleSchema = requestBody({ userId: raw(), title: z.unknown().optional().transform((v) => String(v ?? "").trim().slice(0, 24)) });
export type MemberTitleDto = z.infer<typeof memberTitleSchema>;

export const restrictSchema = requestBody({ userId: raw(), until: raw() });
export type RestrictDto = z.infer<typeof restrictSchema>;
