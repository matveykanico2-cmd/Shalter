import { z } from "zod";
import { raw, requestBody, requestQuery } from "../../../../common/lib/zod.js";

// Проверок полей тут нет: в server/routes/chats.js раньше них идут проверки типа чата и прав.

/** Поле правки: нет поля — undefined (не трогать), иначе `!!x`. */
const optionalFlag = () => z.unknown().optional().transform((v) => (v === undefined ? undefined : !!v));

/** Число в пределах [0, max], дробная часть отбрасывается; не число — 0. */
const clampedInt = (max: number) => z.unknown().optional().transform((v) => Math.max(0, Math.min(max, Math.trunc(Number(v) || 0))));

export const chatSettingsSchema = requestBody({
  approveJoins: optionalFlag(),
  signMessages: optionalFlag(),
  commentsOff: optionalFlag(),
  anonymousAdmins: optionalFlag(),
});
export type ChatSettingsDto = z.infer<typeof chatSettingsSchema>;

// Права чистит sanitizePermissions.
export const permissionsSchema = requestBody({ permissions: raw() });
export type PermissionsDto = z.infer<typeof permissionsSchema>;

/** Реакции под постами (до 20, без повторов); не список — null, то есть любые. */
export const reactionsSchema = requestBody({
  reactions: z
    .unknown()
    .optional()
    .transform((v) => (Array.isArray(v) ? [...new Set(v.map((e) => String(e).trim()).filter(Boolean))].slice(0, 20) : null)),
});
export type ReactionsDto = z.infer<typeof reactionsSchema>;

export const discussionSchema = requestBody({
  action: raw(),
  groupId: z.unknown().optional().transform((v) => (typeof v === "string" ? v : undefined)),
});
export type DiscussionDto = z.infer<typeof discussionSchema>;

export const slowModeSchema = requestBody({ seconds: clampedInt(3600) });
export type SlowModeDto = z.infer<typeof slowModeSchema>;

export const commentPriceSchema = requestBody({ stars: clampedInt(90000) });
export type CommentPriceDto = z.infer<typeof commentPriceSchema>;

export const welcomeSchema = requestBody({ text: z.unknown().optional().transform((v) => String(v ?? "").trim().slice(0, 1000)) });
export type WelcomeDto = z.infer<typeof welcomeSchema>;

export const publicSchema = requestBody({
  isPublic: z.unknown().optional().transform((v) => !!v),
  username: z.unknown().optional().transform((v) => String(v ?? "").trim().replace(/^@/, "")),
});
export type PublicDto = z.infer<typeof publicSchema>;

export const adminLogQuerySchema = requestQuery({ beforeId: z.unknown().optional().transform((v) => Number(v) || null) });
export type AdminLogQueryDto = z.infer<typeof adminLogQuerySchema>;
