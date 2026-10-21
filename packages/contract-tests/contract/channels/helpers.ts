// Общие помощники тестов каналов и постов.
import { afterAll } from "vitest";
import { Api } from "../../support/client";
import { registerUser, uniq, type TestUser } from "../../support/seed";
import { connectWs, type WsClient } from "../../support/ws";

/**
 * Пользователь с Premium через публичный API: регистрация по коду друга
 * (копия помощника из contract/chats/helpers.ts — папки модулей независимы).
 */
export async function registerPremiumUser(baseUrl: string, overrides: Record<string, string> = {}): Promise<TestUser> {
  const referrer = await registerUser(baseUrl, { name: "Пригласивший" });
  const code = referrer.self.referralCode;
  if (!code) throw new Error("у нового пользователя нет referralCode");
  const user = await registerUser(baseUrl, { referralCode: code, ...overrides });
  if (!user.self.isPremium) throw new Error("регистрация по коду друга не дала Premium");
  return user;
}

export function anonymous(baseUrl: string): Api {
  return new Api(baseUrl);
}

/** Сокеты, открытые в файле, закрываются после всех тестов. */
export function wsPool() {
  const sockets: WsClient[] = [];
  afterAll(async () => {
    await Promise.all(sockets.map((s) => s.close()));
  });
  return async (user: TestUser): Promise<WsClient> => {
    const ws = await connectWs(user.api);
    sockets.push(ws);
    return ws;
  };
}

/** Уникальный юзернейм для публичного чата. */
export const handle = (prefix = "ch") => uniq(prefix);

export const publish = (user: TestUser, channelId: string, body: Record<string, unknown>) =>
  user.api.post(`/api/posts/${channelId}/publish`, body);
