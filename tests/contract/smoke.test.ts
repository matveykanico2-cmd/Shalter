// Сквозная проверка каркаса: регистрация → личка → сообщение → событие по WS.
import { afterAll, describe, expect, test } from "vitest";
import { useServer } from "../support/use-server";
import { createDm, registerUser, sendText } from "../support/seed";
import { connectWs, type WsClient } from "../support/ws";

const server = useServer();
const sockets: WsClient[] = [];
afterAll(async () => {
  await Promise.all(sockets.map((s) => s.close()));
});

describe("каркас", () => {
  test("сообщение из лички приходит собеседнику по WebSocket", async () => {
    const { baseUrl } = server();
    const alice = await registerUser(baseUrl, { name: "Алиса" });
    const bob = await registerUser(baseUrl, { name: "Боб" });
    const bobWs = await connectWs(bob.api);
    sockets.push(bobWs);

    const dm = await createDm(alice, bob);
    const sent = await sendText(alice, dm.id, "привет");

    const event = await bobWs.waitFor("message:new", (e) => e.message?.id === sent.id);
    expect(event.message).toMatchObject({ chatId: dm.id, senderId: alice.id, text: "привет" });
  });
});
