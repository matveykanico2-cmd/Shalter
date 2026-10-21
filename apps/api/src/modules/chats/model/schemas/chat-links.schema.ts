import { z } from "zod";
import { raw, requestBody } from "../../../../common/lib/zod.js";

export const inviteSchema = requestBody({ revoke: raw() });
export type InviteDto = z.infer<typeof inviteSchema>;

export const decideJoinRequestSchema = requestBody({ approve: raw() });
export type DecideJoinRequestDto = z.infer<typeof decideJoinRequestSchema>;
