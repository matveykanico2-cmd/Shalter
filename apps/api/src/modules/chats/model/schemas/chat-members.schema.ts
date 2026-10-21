import { z } from "zod";
import { raw, requestBody } from "../../../../common/lib/zod.js";

export const memberRoleSchema = requestBody({ userId: raw(), role: raw() });
export type MemberRoleDto = z.infer<typeof memberRoleSchema>;

export const memberTitleSchema = requestBody({ userId: raw(), title: raw() });
export type MemberTitleDto = z.infer<typeof memberTitleSchema>;

export const restrictSchema = requestBody({ userId: raw(), until: raw() });
export type RestrictDto = z.infer<typeof restrictSchema>;
