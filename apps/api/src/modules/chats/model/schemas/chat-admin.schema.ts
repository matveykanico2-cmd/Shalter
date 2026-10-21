import { z } from "zod";
import { raw, requestBody, requestQuery } from "../../../../common/lib/zod.js";

export const chatSettingsSchema = requestBody({ approveJoins: raw(), signMessages: raw(), commentsOff: raw(), anonymousAdmins: raw() });
export type ChatSettingsDto = z.infer<typeof chatSettingsSchema>;

export const permissionsSchema = requestBody({ permissions: raw() });
export type PermissionsDto = z.infer<typeof permissionsSchema>;

export const reactionsSchema = requestBody({ reactions: raw() });
export type ReactionsDto = z.infer<typeof reactionsSchema>;

export const discussionSchema = requestBody({ action: raw(), groupId: raw() });
export type DiscussionDto = z.infer<typeof discussionSchema>;

export const slowModeSchema = requestBody({ seconds: raw() });
export type SlowModeDto = z.infer<typeof slowModeSchema>;

export const commentPriceSchema = requestBody({ stars: raw() });
export type CommentPriceDto = z.infer<typeof commentPriceSchema>;

export const welcomeSchema = requestBody({ text: raw() });
export type WelcomeDto = z.infer<typeof welcomeSchema>;

export const publicSchema = requestBody({ isPublic: raw(), username: raw() });
export type PublicDto = z.infer<typeof publicSchema>;

export const adminLogQuerySchema = requestQuery({ beforeId: raw() });
export type AdminLogQueryDto = z.infer<typeof adminLogQuerySchema>;
