import { z } from "zod";
import { optionalText, requestBody, text } from "../../../../common/lib/zod.js";

// Все проверки второго шага идут после поиска аккаунта или билета — они в сервисе.

/** Способ «код в чат» или приложение-аутентификатор (всё, что не "chat"). */
export const twoFactorSetupSchema = requestBody({ method: optionalText().transform((v) => (v === "chat" ? "chat" : "totp")) });
export type TwoFactorSetupDto = z.infer<typeof twoFactorSetupSchema>;

const MAX_CLOUD_HINT = 100;

export const cloudPasswordSchema = requestBody({
  accountPassword: text(),
  currentPassword: text(),
  password: text(),
  hint: text().transform((v) => v.trim().slice(0, MAX_CLOUD_HINT)),
});
export type CloudPasswordDto = z.infer<typeof cloudPasswordSchema>;

export const twoFactorLoginSchema = requestBody({ ticket: text(), code: text().transform((v) => v.trim()) });
export type TwoFactorLoginDto = z.infer<typeof twoFactorLoginSchema>;
