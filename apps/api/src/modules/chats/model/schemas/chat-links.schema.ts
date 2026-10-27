import { z } from "zod";
import { requestBody } from "../../../../common/lib/zod.js";

export const inviteSchema = requestBody({ revoke: z.unknown().optional().transform((v) => !!v) });
export type InviteDto = z.infer<typeof inviteSchema>;

// Одобрить — всё, кроме явного false.
export const decideJoinRequestSchema = requestBody({ approve: z.unknown().optional().transform((v) => v !== false) });
export type DecideJoinRequestDto = z.infer<typeof decideJoinRequestSchema>;
