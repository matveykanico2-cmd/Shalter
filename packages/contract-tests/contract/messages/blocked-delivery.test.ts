import { describe, expect, test } from "vitest";
import { historyPage, sendResult } from "../../schemas/messages";
import { expectError, expectOk } from "../../support/expect";
import { createDm, registerUsers, sendText } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { block } from "../ws/helpers";
import { aboutMessage, msgs, useSockets } from "./helpers";

const server = useServer();
const open = useSockets();

describe("сообщения тому, кто заблокировал отправителя", () => {
  test("успешная отправка видна только автору, без WS, счётчика и чтения у собеседника; разблокировка не доставляет старое", async () => {
    const [a, b] = await registerUsers(server().baseUrl, 2);
    const dm = await createDm(a, b);
    const first = await sendText(a, dm.id, "До блокировки");
    await b.api.get(msgs(dm.id));
    const aWs = await open(a);
    const bWs = await open(b);
    await block(b, a);
    const sent = expectOk(await a.api.post(msgs(dm.id), { text: "Только для меня", clientId: "blocked-delivery-1" }), sendResult).message;
    expect(sent.readByIds).toEqual([a.id]);
    await aWs.waitFor("message:new", aboutMessage(sent.id));
    await bWs.expectNone("message:new", aboutMessage(sent.id));
    expect(expectOk(await a.api.get(msgs(dm.id)), historyPage).messages.map((m) => m.id)).toContain(sent.id);
    expect(expectOk(await b.api.get(msgs(dm.id)), historyPage).messages.map((m) => m.id)).toEqual([first.id]);
    const bChat = (await b.api.get("/api/chats")).body.chats.find((c: any) => c.id === dm.id);
    expect(bChat.lastMessage.id).toBe(first.id);
    expect(bChat.unreadCount).toBe(0);
    const ownHistory = expectOk(await a.api.get(msgs(dm.id)), historyPage);
    expect(ownHistory.messages.find((m) => m.id === sent.id)!.readByIds).toEqual([a.id]);
    expectError(await b.api.post(msgs(dm.id, `/${sent.id}/react`), { emoji: "👍" }), 404, "not found");
    expectError(await b.api.patch(msgs(dm.id, `/${sent.id}`), { text: "чужая правка" }), 404, "not found");
    bWs.clear();
    expect((await a.api.patch(msgs(dm.id, `/${sent.id}`), { text: "Тоже только для меня" })).status).toBe(200);
    await bWs.expectNone("message:updated", aboutMessage(sent.id));
    await block(b, a, false);
    expect(expectOk(await b.api.get(msgs(dm.id)), historyPage).messages.map((m) => m.id)).not.toContain(sent.id);
    const next = await sendText(a, dm.id, "После разблокировки");
    await bWs.waitFor("message:new", aboutMessage(next.id));
  });

  test("блокировка немедленно рассылает профиль без смайла и фото, разблокировка возвращает аватар", async () => {
    const [a, b] = await registerUsers(server().baseUrl, 2);
    await createDm(a, b);
    await b.api.patch(`/api/users/${b.id}`, { avatarEmoji: "🔥" });
    const socket = await open(a);
    await block(b, a);
    const hidden = await socket.waitFor("contact:updated", (e) => e.user?.id === b.id);
    for (const field of ["avatarEmoji", "avatarImage", "avatarImages", "lastSeen"]) expect(hidden.user).not.toHaveProperty(field);
    socket.clear();
    await block(b, a, false);
    const restored = await socket.waitFor("contact:updated", (e) => e.user?.id === b.id && e.user?.avatarEmoji === "🔥");
    expect(restored.user.avatarEmoji).toBe("🔥");
  });
});
