// Общие помощники тестов сообществ.
import { afterAll } from "vitest";
import { Api } from "../../support/client";
import type { TestUser } from "../../support/seed";
import { connectWs, type WsClient, type WsEvent } from "../../support/ws";

export const NOT_FOUND = "Сообщество не найдено";
export const NO_RIGHTS = "Недостаточно прав";
export const NOT_MEMBER = "Вы не участник сообщества";
export const BANNED = "Вас удалили из этого сообщества";

export const OWNER_RIGHTS = { editInfo: true, editChats: true, ban: true, addAdmins: true };
export const NO_RIGHTS_SET = { editInfo: false, editChats: false, ban: false, addAdmins: false };
export const DEFAULT_ADMIN_RIGHTS = { editInfo: true, editChats: true, ban: true, addAdmins: false };

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
  return async (user: TestUser | Api): Promise<WsClient> => {
    const ws = await connectWs(user instanceof Api ? user : user.api);
    sockets.push(ws);
    return ws;
  };
}

/** Создаёт сообщество через API и возвращает тело view(). */
export async function createCommunity(owner: TestUser, extra: Record<string, unknown> = {}): Promise<any> {
  const res = await owner.api.post("/api/communities", { title: "Сообщество", ...extra });
  if (res.status !== 200) throw new Error(`сообщество: ${res.status} ${res.text.slice(0, 500)}`);
  return res.body.community;
}

/** community:updated про это сообщество. */
export const aboutCommunity = (id: string) => (e: WsEvent) => e.communityId === id;

/**
 * Принимает пользователей в сообщество через join. Сообщество без видимого публичного
 * чата закрытое, поэтому на время вступления в него добавляется публичный канал владельца,
 * а потом убирается — список чатов сообщества после вызова тот же, что был.
 */
export async function admit(owner: TestUser, communityId: string, users: TestUser[]): Promise<void> {
  const username = `door${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const ch = await owner.api.post("/api/chats/channels", { title: "Вход", memberIds: [], isPublic: true, username });
  if (ch.status !== 200) throw new Error(`канал: ${ch.status} ${ch.text.slice(0, 500)}`);
  const chatId = ch.body.chat.id;
  const add = await owner.api.post(`/api/communities/${communityId}/chats`, { chatId });
  if (add.status !== 200) throw new Error(`добавить канал: ${add.status} ${add.text.slice(0, 500)}`);
  for (const u of users) {
    const res = await u.api.post(`/api/communities/${communityId}/join`);
    if (res.status !== 200) throw new Error(`вступление: ${res.status} ${res.text.slice(0, 500)}`);
  }
  const del = await owner.api.delete(`/api/communities/${communityId}/chats/${chatId}`);
  if (del.status !== 200) throw new Error(`убрать канал: ${del.status} ${del.text.slice(0, 500)}`);
}
