// Ключи доступа (WebAuthn), как public/js/lib/passkey.js: опции сервера приходят в base64url,
// браузеру нужны ArrayBuffer — и ответ браузера уходит обратно в base64url.
import type { loginBody, passkeyLoginStartBody, twoFactorChallenge } from "@shalter/shared/schemas/auth";
import type { z } from "zod";

import { http } from "../api";

export const b64urlToBuf = (s: string) => {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
};

export const bufToB64url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

export function passkeysSupported() {
  return typeof window.PublicKeyCredential !== "undefined" && !!navigator.credentials?.create && window.isSecureContext;
}

type RegisterOptions = {
  challenge: string;
  user: { id: string; name: string; displayName: string };
  excludeCredentials?: { type: "public-key"; id: string }[];
} & Omit<PublicKeyCredentialCreationOptions, "challenge" | "user" | "excludeCredentials">;

/**
 * Новый ключ по опциям из POST /api/auth/passkey/register/start (registerPasskey):
 * тело для register/finish. Отмена в окне браузера — ошибка NotAllowedError.
 */
export async function createPasskey(opts: RegisterOptions, name?: string) {
  const cred = (await navigator.credentials.create({
    publicKey: {
      ...opts,
      challenge: b64urlToBuf(opts.challenge),
      user: { ...opts.user, id: b64urlToBuf(opts.user.id) },
      excludeCredentials: (opts.excludeCredentials ?? []).map((c) => ({ ...c, id: b64urlToBuf(c.id) })),
    },
  })) as (PublicKeyCredential & { response: AuthenticatorAttestationResponse }) | null;
  if (!cred) throw new Error("Создание ключа отменено");
  return {
    id: cred.id,
    clientDataJSON: bufToB64url(cred.response.clientDataJSON),
    attestationObject: bufToB64url(cred.response.attestationObject),
    name,
  };
}

/** Текст ошибки ключа доступа для человека (passkeyErrorText). */
export function passkeyErrorText(err: unknown) {
  const name = err instanceof Error ? err.name : "";
  if (name === "NotAllowedError" || name === "AbortError") return "Отменено";
  if (name === "InvalidStateError") return "Этот ключ уже добавлен";
  if (name === "NotSupportedError") return "Ключи доступа не поддерживаются на этом устройстве";
  return (err instanceof Error && err.message) || "Не получилось";
}

type PasskeyLoginOptions = z.infer<typeof passkeyLoginStartBody>;

/** Вход по ключу доступа (loginWithPasskey): ответ — как у обычного входа, сессия или билет второго шага. */
export async function loginWithPasskey() {
  const opts = await http.post<PasskeyLoginOptions>("/api/auth/passkey/login/start");
  const cred = (await navigator.credentials.get({
    publicKey: { challenge: b64urlToBuf(opts.challenge), rpId: opts.rpId, userVerification: opts.userVerification, timeout: opts.timeout },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("Вход отменён");
  const res = cred.response as AuthenticatorAssertionResponse;
  return http.post<z.infer<typeof loginBody> | z.infer<typeof twoFactorChallenge>>("/api/auth/passkey/login/finish", {
    id: cred.id,
    clientDataJSON: bufToB64url(res.clientDataJSON),
    authenticatorData: bufToB64url(res.authenticatorData),
    signature: bufToB64url(res.signature),
  });
}

/** Вход по ключу отменён (NotAllowedError) — чаще всего ключа на этом устройстве просто нет. */
export const NO_PASSKEY_HINT = "На этом устройстве нет сохранённого ключа доступа. Добавьте его в настройках или войдите паролем.";

/** Ошибка входа по ключу (handlePasskeyLoginError). */
export function passkeyLoginErrorText(err: unknown) {
  const name = err instanceof Error ? err.name : "";
  if (name === "NotAllowedError" || name === "AbortError") return "Отменено";
  if (name === "InvalidStateError") return "Этот ключ уже добавлен";
  if (name === "NotSupportedError") return "Ключи доступа не поддерживаются";
  return (err instanceof Error && err.message) || "Не получилось войти по ключу";
}
