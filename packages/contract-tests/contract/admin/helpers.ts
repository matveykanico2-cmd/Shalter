// Общие помощники тестов админки. Права админа в Shalter даются по номеру
// телефона (PREMIUM_ADMIN_PHONE — главный, PREMIUM_ADMIN_PHONES — дополнительные),
// регистрация на такой номер разрешается ALLOW_ADMIN_PHONE_SIGNUP=1. Разделы
// («moderation», «legal», …) обычному пользователю выдаёт только главный админ
// через POST /api/admin/users/:id/admin-sections.
import { createHmac } from "node:crypto";
import { afterAll, expect } from "vitest";
import { Api } from "../../support/client";
import { registerUser, type TestUser } from "../../support/seed";
import { connectWs, type WsClient } from "../../support/ws";

export const ADMIN_PHONE = "+70000000901";
export const EXTRA_ADMIN_PHONE = "+70000000902";
export const SYSTEM_BOT_ID = "bot_shalter";
export const NO_RIGHTS = "Недостаточно прав";
export const RANK_ERROR = "Нельзя применять это к администратору вашего уровня или выше";
export const USER_NOT_FOUND = "Пользователь не найден";

/**
 * Окружение сервера админки. MAIL_FROM без «@» — у отправителя нет домена, и
 * GET /mail-status не ходит в DNS и на api.ipify.org (server/lib/mailDns.js).
 */
export const ADMIN_ENV = {
  PREMIUM_ADMIN_PHONE: ADMIN_PHONE,
  PREMIUM_ADMIN_PHONES: EXTRA_ADMIN_PHONE,
  ALLOW_ADMIN_PHONE_SIGNUP: "1",
  MAIL_FROM: "Shalter",
};

/** Ленивые главный и дополнительный админы одного сервера. */
export function admins(baseUrl: () => string) {
  let primary: Promise<TestUser> | undefined;
  let extra: Promise<TestUser> | undefined;
  return {
    primary: () => (primary ??= registerUser(baseUrl(), { phone: ADMIN_PHONE, name: "Главный админ" })),
    extra: () => (extra ??= registerUser(baseUrl(), { phone: EXTRA_ADMIN_PHONE, name: "Второй админ" })),
  };
}

/** Выдать разделы через главного админа. */
export async function grantSections(primary: TestUser, user: TestUser, sections: string[]): Promise<void> {
  const res = await primary.api.post(`/api/admin/users/${user.id}/admin-sections`, { sections });
  expect(res.status, res.text).toBe(200);
}

/** Новый пользователь с выданными разделами. */
export async function sectionAdmin(baseUrl: string, primary: TestUser, sections: string[], overrides: Record<string, string> = {}): Promise<TestUser> {
  const user = await registerUser(baseUrl, { name: "Модератор", ...overrides });
  await grantSections(primary, user, sections);
  return user;
}

/** Клиент без сессии — для проверки 401. */
export function anonymous(baseUrl: string): Api {
  return new Api(baseUrl);
}

/** Сокеты, открытые в файле, закрываются после всех тестов. */
export function wsPool() {
  const sockets: WsClient[] = [];
  afterAll(async () => {
    await Promise.all(sockets.map((s) => s.close()));
  });
  return async (api: Api): Promise<WsClient> => {
    const ws = await connectWs(api);
    sockets.push(ws);
    return ws;
  };
}

/** Личный чат пользователя с другим (по списку чатов) или null. */
export async function dmWith(user: TestUser | Api, otherId: string): Promise<any | null> {
  const api = user instanceof Api ? user : user.api;
  const res = await api.get("/api/chats");
  expect(res.status, res.text).toBe(200);
  return res.body.chats.find((c: any) => c.type === "dm" && c.memberIds.includes(otherId) && c.memberIds.length === 2) ?? null;
}

/** Сообщения в личке с системным ботом Shalter (пусто, если чата нет). */
export async function systemMessages(user: TestUser | Api): Promise<any[]> {
  const api = user instanceof Api ? user : user.api;
  const chat = await dmWith(api, SYSTEM_BOT_ID);
  if (!chat) return [];
  const res = await api.get(`/api/chats/${chat.id}/messages`);
  expect(res.status, res.text).toBe(200);
  return res.body.messages;
}

export async function waitUntil<T>(fn: () => Promise<T | undefined | null | false>, what: string, timeoutMs = 8000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > deadline) throw new Error(`не дождались: ${what}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

// TOTP по RFC 6238 (HMAC-SHA1, 6 цифр, шаг 30 с) — локальная копия, чтобы
// включить пользователю 2FA и проверить её снятие при сбросе пароля.
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function totp(secret: string, now = Date.now()): string {
  let bits = 0;
  let value = 0;
  const key: number[] = [];
  for (const ch of secret.toUpperCase().replace(/=+$/, "")) {
    const idx = B32.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      key.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const counter = Math.floor(now / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = createHmac("sha1", Buffer.from(key)).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

/** Включить пользователю 2FA через приложение-аутентификатор. */
export async function enableTotp(user: TestUser): Promise<void> {
  const setup = await user.api.post("/api/auth/2fa/setup", {});
  expect(setup.status, setup.text).toBe(200);
  const enable = await user.api.post("/api/auth/2fa/enable", { code: totp(setup.body.secret) });
  expect(enable.status, enable.text).toBe(200);
}
