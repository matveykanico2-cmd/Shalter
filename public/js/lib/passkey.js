import { api } from "../api.js";

// Ключи доступа (WebAuthn): перевод опций сервера в ArrayBuffer и ответа
// браузера обратно в base64url.
const toBuf = (s) => {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
};
const toB64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function passkeysSupported() {
  return !!window.PublicKeyCredential && !!navigator.credentials?.create && window.isSecureContext;
}

export async function registerPasskey(name) {
  const opts = await api.passkeyRegisterStart();
  const cred = await navigator.credentials.create({
    publicKey: {
      ...opts,
      challenge: toBuf(opts.challenge),
      user: { ...opts.user, id: toBuf(opts.user.id) },
      excludeCredentials: (opts.excludeCredentials ?? []).map((c) => ({ ...c, id: toBuf(c.id) })),
    },
  });
  if (!cred) throw new Error("Создание ключа отменено");
  return api.passkeyRegisterFinish({
    id: cred.id,
    clientDataJSON: toB64url(cred.response.clientDataJSON),
    attestationObject: toB64url(cred.response.attestationObject),
    name,
  });
}

// Возвращает ответ сервера, как обычный вход: { user } или { twoFactorRequired, ... }.
export async function loginWithPasskey() {
  const opts = await api.passkeyLoginStart();
  const cred = await navigator.credentials.get({
    publicKey: { challenge: toBuf(opts.challenge), rpId: opts.rpId, userVerification: opts.userVerification, timeout: opts.timeout },
  });
  if (!cred) throw new Error("Вход отменён");
  return api.passkeyLoginFinish({
    id: cred.id,
    clientDataJSON: toB64url(cred.response.clientDataJSON),
    authenticatorData: toB64url(cred.response.authenticatorData),
    signature: toB64url(cred.response.signature),
  });
}

export function passkeyErrorText(err) {
  if (err?.name === "NotAllowedError" || err?.name === "AbortError") return "Отменено";
  if (err?.name === "InvalidStateError") return "Этот ключ уже добавлен";
  return err?.message || "Не получилось";
}
