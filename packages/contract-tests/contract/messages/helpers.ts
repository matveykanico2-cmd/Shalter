// Общие мелочи для тестов сообщений.
import { afterAll } from "vitest";
import type { TestUser } from "../../support/seed";
import { connectWs, type WsClient, type WsEvent } from "../../support/ws";

export const msgs = (chatId: string, rest = "") => `/api/chats/${chatId}/messages${rest}`;

/** Сокеты, открытые в файле, закрываются после всех тестов. */
export function useSockets() {
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

/** Событие про конкретное сообщение (message:new / message:updated). */
export const aboutMessage = (id: string) => (e: WsEvent) => e.message?.id === id;
