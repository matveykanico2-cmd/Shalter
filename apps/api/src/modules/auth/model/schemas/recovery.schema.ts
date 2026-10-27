import { z } from "zod";
import { requestBody, text } from "../../../../common/lib/zod.js";
import { EMAIL_RE, PHONE_RE, normalizePhone } from "../../../../common/lib/validators.js";

// Как server/routes/auth.js: при сбросе пароля сначала его длина, затем почта и номер —
// всё до поиска аккаунта. Порядок полей — порядок проверок.

const email = () =>
  text()
    .transform((v) => v.trim().toLowerCase())
    .refine((v) => EMAIL_RE.test(v), { error: "Введите корректный адрес почты" });
const phone = () => text().transform(normalizePhone);
const fullPhone = () => phone().refine((v) => PHONE_RE.test(v), { error: "Введите номер телефона полностью" });
const newPassword = () => text().refine((v) => v.length >= 6, { error: "Пароль — не короче 6 символов" });

export const pairCheckSchema = requestBody({ email: email(), phone: fullPhone() });
export type PairCheckDto = z.infer<typeof pairCheckSchema>;

export const pairResetSchema = requestBody({ password: newPassword(), email: email(), phone: fullPhone(), code: text() });
export type PairResetDto = z.infer<typeof pairResetSchema>;

export const phoneStartSchema = requestBody({ phone: fullPhone() });
export type PhoneStartDto = z.infer<typeof phoneStartSchema>;

// Формат номера здесь не проверяется: неверный номер — «Неверный или устаревший код».
export const phoneResetSchema = requestBody({ password: newPassword(), phone: phone(), code: text() });
export type PhoneResetDto = z.infer<typeof phoneResetSchema>;
