import { z } from "zod";
import { optionalText, requestBody, requestQuery, text } from "../../../../common/lib/zod.js";
import { EMAIL_RE, normalizePhone } from "../../../../common/lib/validators.js";

/** Номер без пробелов, скобок и дефисов; соответствие формату проверяет тот, кому он нужен. */
const phone = () => text().transform(normalizePhone);
/** Юзернейм без пробелов по краям и без «@» в начале. */
const handle = () => text().transform((v) => v.trim().replace(/^@/, ""));

export const loginEmailSchema = requestBody({ email: text(), password: text() });
export type LoginEmailDto = z.infer<typeof loginEmailSchema>;

// Имя, почта и пароль проверяются до всего остального, как в server/routes/auth.js; юзернейм
// (занятость — запрос в базу) и затем формат номера — в сервисе.
export const registerEmailSchema = requestBody({
  name: text()
    .refine((v) => v.trim() !== "", { error: "Введите имя" })
    .transform((v) => v.trim()),
  lastName: text().transform((v) => v.trim().slice(0, 60)),
  email: text().refine((v) => EMAIL_RE.test(v), { error: "Некорректный email" }),
  password: text().refine((v) => v.length >= 6, { error: "Пароль должен быть не короче 6 символов" }),
  phone: phone(),
  username: handle(),
  referralCode: text(),
  birthday: text(),
});
export type RegisterEmailDto = z.infer<typeof registerEmailSchema>;

export const switchAccountSchema = requestBody({ userId: text() });
export type SwitchAccountDto = z.infer<typeof switchAccountSchema>;

export const logoutSchema = requestBody({ uid: optionalText() });
export type LogoutDto = z.infer<typeof logoutSchema>;

export const qrConfirmSchema = requestBody({ token: text() });
export type QrConfirmDto = z.infer<typeof qrConfirmSchema>;

export const qrPollQuerySchema = requestQuery({ token: text() });
export type QrPollQuery = z.infer<typeof qrPollQuerySchema>;

export const codeStartSchema = requestBody({ phone: phone() });
export type CodeStartDto = z.infer<typeof codeStartSchema>;

export const codeVerifySchema = requestBody({ phone: phone(), code: text().transform((v) => v.trim()) });
export type CodeVerifyDto = z.infer<typeof codeVerifySchema>;

export const usernameQuerySchema = requestQuery({ u: handle() });
export type UsernameQuery = z.infer<typeof usernameQuerySchema>;
