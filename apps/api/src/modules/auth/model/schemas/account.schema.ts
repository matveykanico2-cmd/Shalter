import { z } from "zod";
import { optionalText, requestBody, text } from "../../../../common/lib/zod.js";

// Пароль от аккаунта проверяется раньше остальных полей (это запрос в базу), поэтому
// тексты ошибок длины и формата — в сервисе.

export const passwordSchema = requestBody({ password: text() });
export type PasswordDto = z.infer<typeof passwordSchema>;

export const changePasswordSchema = requestBody({ currentPassword: text(), newPassword: text() });
export type ChangePasswordDto = z.infer<typeof changePasswordSchema>;

export const emailStartSchema = requestBody({ email: text().transform((v) => v.trim().toLowerCase()), password: text() });
export type EmailStartDto = z.infer<typeof emailStartSchema>;

export const codeSchema = requestBody({ code: text() });
export type CodeDto = z.infer<typeof codeSchema>;

export const ticketSchema = requestBody({ ticket: optionalText() });
export type TicketDto = z.infer<typeof ticketSchema>;
