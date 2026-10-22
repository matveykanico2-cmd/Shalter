import type { loginBody, twoFactorChallenge } from "@shalter/shared/schemas/auth";
import type { z } from "zod";

import { http } from "@/shared/api";

export type LoginResult = z.infer<typeof loginBody>;
export type TwoFactorChallenge = z.infer<typeof twoFactorChallenge>;

/** Вход по почте и паролю; с включённой 2FA вместо сессии — билет на второй шаг. */
export const loginByEmail = (email: string, password: string) =>
  http.post<LoginResult | TwoFactorChallenge>("/api/auth/login-email", { email, password });

export const loginByTwoFactor = (ticket: string, code: string) => http.post<LoginResult>("/api/auth/2fa/login", { ticket, code });

/** Код второго фактора ещё раз в чат с Shalter (метод «chat»). */
export const resendTwoFactorCode = (ticket: string) => http.post<{ ok: true }>("/api/auth/2fa/send-code", { ticket });

export const isTwoFactorChallenge = (res: LoginResult | TwoFactorChallenge): res is TwoFactorChallenge => "twoFactorRequired" in res;
