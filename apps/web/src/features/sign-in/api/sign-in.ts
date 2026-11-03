import type {
  loginBody,
  pairCheckBody,
  qrPollBody,
  qrStartBody,
  scheduleDeletionBody,
  twoFactorChallenge,
  userBody,
  usernameAvailableBody,
} from "@shalter/shared/schemas/auth";
import type { z } from "zod";

import { http } from "@/shared/api";

export type LoginResult = z.infer<typeof loginBody>;
export type TwoFactorChallenge = z.infer<typeof twoFactorChallenge>;
export type SignedInUser = LoginResult["user"];

/** Вход по почте и паролю; с включённой 2FA вместо сессии — билет на второй шаг. */
export const loginByEmail = (email: string, password: string) =>
  http.post<LoginResult | TwoFactorChallenge>("/api/auth/login-email", { email, password });

/** Гостевой вход: сервер заводит временный аккаунт с этим именем (пусто — «Гость NNNN»); 404 — гостевой режим отключён. */
export const loginAsGuest = (name = "") => {
  const trimmed = name.trim();
  return http.post<LoginResult>("/api/auth/guest", trimmed ? { name: trimmed } : {});
};

export const loginByTwoFactor = (ticket: string, code: string) => http.post<LoginResult>("/api/auth/2fa/login", { ticket, code });

/** Код второго фактора ещё раз в чат с Shalter (метод «chat»). */
export const resendTwoFactorCode = (ticket: string) => http.post<{ ok: true }>("/api/auth/2fa/send-code", { ticket });

/** Не помнит облачный пароль — удаление аккаунта через 7 дней (по билету второго шага). */
export const scheduleDeletion = (ticket: string) => http.post<z.infer<typeof scheduleDeletionBody>>("/api/auth/schedule-deletion", { ticket });
export const cancelDeletion = (ticket: string) => http.post<{ ok: true }>("/api/auth/cancel-deletion", { ticket });

export const isTwoFactorChallenge = (res: LoginResult | TwoFactorChallenge): res is TwoFactorChallenge => "twoFactorRequired" in res;

/** Регистрация — только почта и пароль; имя, юзернейм и остальное — следующим шагом. */
export const register = (email: string, password: string) => http.post<z.infer<typeof userBody>>("/api/auth/register-email", { email, password });

/** Данные профиля со второго шага регистрации (сеанс уже есть). */
export const updateNewProfile = async (userId: string, patch: Record<string, unknown>): Promise<SignedInUser> => {
  const { user } = await http.patch<{ user: SignedInUser }>(`/api/users/${userId}`, patch);
  return user;
};

export const checkUsername = (u: string) =>
  http.get<z.infer<typeof usernameAvailableBody>>(`/api/auth/username-available?u=${encodeURIComponent(u)}`);

export const startQrLogin = () => http.post<z.infer<typeof qrStartBody>>("/api/auth/qr/start");
export const pollQrLogin = (token: string) => http.get<z.infer<typeof qrPollBody>>(`/api/auth/qr/poll?token=${encodeURIComponent(token)}`);

/** Вход по коду: код приходит сообщением от Shalter на устройство, где аккаунт уже открыт. */
export const startCodeLogin = (phone: string) => http.post<{ ok: true }>("/api/auth/code/start", { phone });
export const verifyCodeLogin = (phone: string, code: string) =>
  http.post<LoginResult | TwoFactorChallenge>("/api/auth/code/verify", { phone, code });

/** Восстановление пароля: почта и телефон аккаунта → код на почту → новый пароль. */
export const checkRecoveryPair = (email: string, phone: string) => http.post<z.infer<typeof pairCheckBody>>("/api/auth/recover/pair/check", { email, phone });
export const finishPairRecovery = (email: string, phone: string, code: string, password: string) =>
  http.post<z.infer<typeof userBody>>("/api/auth/recover/pair/reset", { email, phone, code, password });
