// Ответы /api/auth/* и /api/sessions/* (server/routes/auth.js, server/routes/sessions.js).
import { z } from "zod";
import { genId, isoDate } from "./common";
import { selfUser } from "./user";

/** register-email, switch, recover/pair/reset. */
export const userBody = z.strictObject({ user: selfUser });

/** switch: пользователя могли удалить между запросами — тогда null. */
export const switchBody = z.strictObject({ user: selfUser.nullable() });

/** login-email, code/verify, 2fa/login, passkey/login/finish, recover/phone/verify без 2FA (finishLogin). */
export const loginBody = z.strictObject({ user: selfUser, alreadyLinked: z.boolean() });

/** finishLogin, когда включена 2FA: вместо сессии — билет на второй шаг. */
export const twoFactorChallenge = z.strictObject({
  twoFactorRequired: z.literal(true),
  ticket: z.string().regex(/^[A-Za-z0-9_-]{32}$/),
  expiresInSec: z.number(),
  name: z.string(),
  method: z.enum(["totp", "chat", "password"]),
  hint: z.string().nullable(),
  scheduledDeletionAt: isoDate.nullable(),
});

export const sessionBody = z.strictObject({ user: selfUser.nullable(), accounts: z.array(selfUser) });

export const usernameAvailableBody = z.strictObject({
  username: z.string(),
  available: z.boolean(),
  error: z.string().nullable(),
});

/** logout и delete-account: оставшиеся на устройстве аккаунты (сырые id из cookie). */
export const remainingBody = z.strictObject({ ok: z.literal(true), remaining: z.array(z.string()) });

export const emailChangedBody = z.strictObject({ user: selfUser, changed: z.literal(true) });
/** POST /api/auth/email/start: код ушёл письмом на новый адрес, адрес ещё прежний. */
export const emailChangeSentBody = z.strictObject({ ok: z.literal(true), sent: z.literal(true), email: z.string() });

export const qrStartBody = z.strictObject({ token: z.string().regex(/^[0-9a-f]{40}$/), loginUrl: z.string() });

export const qrPollBody = z.union([
  z.strictObject({ status: z.enum(["pending", "expired"]) }),
  z.strictObject({ status: z.literal("confirmed"), user: selfUser }),
  z.strictObject({ status: z.literal("banned"), error: z.string() }),
]);

const b64url = z.string().regex(/^[A-Za-z0-9_-]+$/);

export const passkeyRegisterStartBody = z.strictObject({
  challenge: b64url,
  rp: z.strictObject({ id: z.string(), name: z.literal("Shalter") }),
  user: z.strictObject({ id: b64url, name: z.string(), displayName: z.string() }),
  pubKeyCredParams: z.array(z.strictObject({ type: z.literal("public-key"), alg: z.number() })),
  authenticatorSelection: z.strictObject({
    residentKey: z.literal("required"),
    requireResidentKey: z.literal(true),
    userVerification: z.literal("preferred"),
  }),
  attestation: z.literal("none"),
  timeout: z.number(),
  excludeCredentials: z.array(z.strictObject({ type: z.literal("public-key"), id: z.string() })),
});

export const passkeyLoginStartBody = z.strictObject({
  challenge: b64url,
  rpId: z.string(),
  userVerification: z.literal("preferred"),
  timeout: z.number(),
});

export const passkeyItem = z.strictObject({
  id: z.string(),
  name: z.string(),
  createdAt: isoDate,
  lastUsedAt: isoDate.optional(),
});
export const passkeysBody = z.strictObject({ passkeys: z.array(passkeyItem) });
/** passkey/register/finish: только что добавленный ключ (без lastUsedAt). */
export const passkeyAddedBody = z.strictObject({
  passkey: z.strictObject({ id: z.string(), name: z.string(), createdAt: isoDate }),
});

export const twoFactorStatusBody = z.strictObject({
  enabled: z.boolean(),
  method: z.enum(["totp", "chat", "password"]),
  pending: z.boolean(),
  cloudPasswordHint: z.string(),
  recoveryCodesLeft: z.number(),
  enabledAt: isoDate.nullable(),
});

export const totpSetupBody = z.strictObject({
  method: z.literal("totp"),
  secret: z.string().regex(/^[A-Z2-7]{32}$/),
  otpauthUri: z.string(),
});
export const chatSetupBody = z.strictObject({ method: z.literal("chat") });

export const recoveryCode = z.string().regex(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5}$/);
export const twoFactorEnabledBody = z.strictObject({ enabled: z.literal(true), recoveryCodes: z.array(recoveryCode) });
export const twoFactorDisabledBody = z.strictObject({ enabled: z.literal(false) });

export const cloudPasswordSetBody = z.strictObject({
  ok: z.literal(true),
  enabled: z.literal(true),
  method: z.literal("password"),
  hint: z.string().nullable(),
});
export const cloudPasswordDisabledBody = z.strictObject({ ok: z.literal(true), enabled: z.literal(false) });
export const hintBody = z.strictObject({ hint: z.string().nullable() });

/** Неверный код на втором шаге входа: текст + сколько попыток осталось. */
export const twoFactorLoginError = z.strictObject({ error: z.string(), attemptsLeft: z.number() });

export const scheduleDeletionBody = z.strictObject({ deleteAt: isoDate });

export const recoverSentBody = z.strictObject({ ok: z.literal(true), sent: z.literal(true) });
export const pairCheckBody = z.strictObject({ ok: z.literal(true), name: z.string() });

/** Запись в /api/sessions: deviceId — это id записи, настоящий device_id наружу не отдаётся. */
export const sessionItem = z.strictObject({
  id: genId("sess"),
  userId: z.string(),
  device: z.string(),
  location: z.string(),
  lastActive: isoDate,
  revokedAt: z.null(),
  deviceId: genId("sess"),
  current: z.boolean(),
});
export const sessionsBody = z.strictObject({ sessions: z.array(sessionItem) });

/** requireUserId для забаненного: 403 с причиной. */
export const bannedBody = z.strictObject({ error: z.literal("banned"), banReason: z.string().nullable() });
