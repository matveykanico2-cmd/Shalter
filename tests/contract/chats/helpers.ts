// Общие помощники тестов модуля чатов.
import { afterAll } from "vitest";
import { Api } from "../../support/client";
import { registerUser, type TestUser } from "../../support/seed";
import { connectWs, type WsClient } from "../../support/ws";

/**
 * Пользователь с Premium, полученным через публичный API: регистрация по коду
 * друга даёт Premium обоим (routes/auth.js register-email + referralCode).
 * Побочный эффект — личка «пригласивший ↔ новый» с одним сообщением, поэтому
 * пригласивший — отдельный одноразовый пользователь.
 */
export async function registerPremiumUser(baseUrl: string, overrides: Record<string, string> = {}): Promise<TestUser> {
  const referrer = await registerUser(baseUrl, { name: "Пригласивший" });
  const code = referrer.self.referralCode;
  if (!code) throw new Error("у нового пользователя нет referralCode");
  const user = await registerUser(baseUrl, { referralCode: code, ...overrides });
  if (!user.self.isPremium) throw new Error("регистрация по коду друга не дала Premium");
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

export const NOT_FOUND = "not found";
export const NO_RIGHTS = "Недостаточно прав";
