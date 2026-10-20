// Личное состояние чата и «живые» сигналы: прочтение (счётчики, message:read),
// черновик, набор текста (typing:update), порядок закреплённых.
import { describe, expect, test } from "vitest";
import { z } from "zod";
import { chatList, pinnedOrderBody, readBody, typingBody } from "../../schemas/chats";
import { okBody } from "../../schemas/common";
import { expectError, expectOk } from "../../support/expect";
import { createDm, createGroup, registerUser, sendText } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { anonymous, NOT_FOUND, wsPool } from "./helpers";

const server = useServer();
const ws = wsPool();

const rowOf = async (user: { api: any }, chatId: string) =>
  expectOk(await user.api.get("/api/chats"), chatList).chats.find((c) => c.id === chatId)!;

describe("без сессии и посторонним", () => {
  test("401 и 404", async () => {
    const { baseUrl } = server();
    const api = anonymous(baseUrl);
    const id = "c_whatever00";
    for (const res of await Promise.all([
      api.post(`/api/chats/${id}/read`),
      api.post(`/api/chats/${id}/draft`, { text: "x" }),
      api.get(`/api/chats/${id}/typing`),
      api.post(`/api/chats/${id}/typing`, {}),
    ])) expectError(res, 401, "unauthorized");

    const a = await registerUser(baseUrl);
    const outsider = await registerUser(baseUrl);
    const group = await createGroup(a, []);
    for (const res of await Promise.all([
      outsider.api.post(`/api/chats/${group.id}/read`),
      outsider.api.post(`/api/chats/${group.id}/draft`, { text: "x" }),
      outsider.api.get(`/api/chats/${group.id}/typing`),
      outsider.api.post(`/api/chats/${group.id}/typing`, {}),
    ])) expectError(res, 404, NOT_FOUND);
  });
});

describe("POST /:id/read", () => {
  test("личка: счётчик в 0, message:read отправителю со временем прочтения", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const outsider = await registerUser(baseUrl);
    const dm = await createDm(a, b);
    const m1 = await sendText(a, dm.id, "раз");
    const m2 = await sendText(a, dm.id, "два");
    await b.api.patch(`/api/chats/${dm.id}`, { unread: true });
    expect(await rowOf(b, dm.id)).toMatchObject({ unreadCount: 2, unread: true });
    const [aWs, bWs, outWs] = await Promise.all([ws(a.api), ws(b.api), ws(outsider.api)]);

    expect(expectOk(await b.api.post(`/api/chats/${dm.id}/read`), readBody)).toEqual({ ok: true, count: 2 });
    const ev = await aWs.waitFor("message:read", (e) => e.chatId === dm.id);
    expect(ev).toMatchObject({ type: "message:read", chatId: dm.id, readerId: b.id });
    expect([...ev.messageIds].sort()).toEqual([m1.id, m2.id].sort());
    expect(Number.isNaN(Date.parse(ev.readAt))).toBe(false);
    expect(Object.keys(ev).sort()).toEqual(["chatId", "messageIds", "readAt", "readerId", "type"]);
    await bWs.expectNone("message:read");
    await outWs.expectNone("message:read");

    // Отметка «непрочитано» снята, счётчик обнулён, сообщения прочитаны.
    const row = await rowOf(b, dm.id);
    expect(row.unreadCount).toBe(0);
    expect(row).not.toHaveProperty("unread");
    expect((await rowOf(a, dm.id)).lastMessage?.readByIds).toEqual([a.id, b.id]);

    // Повтор — ничего нового, без события.
    aWs.clear();
    expect(expectOk(await b.api.post(`/api/chats/${dm.id}/read`), readBody)).toEqual({ ok: true, count: 0 });
    await aWs.expectNone("message:read");
  });

  test("скрытое время визита — message:read без readAt", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const dm = await createDm(a, b);
    await sendText(a, dm.id, "раз");
    await b.api.patch("/api/settings", { privacy: { lastSeen: "nobody" } });
    const aWs = await ws(a.api);
    expectOk(await b.api.post(`/api/chats/${dm.id}/read`), readBody);
    const ev = await aWs.waitFor("message:read", (e) => e.chatId === dm.id);
    expect(ev).not.toHaveProperty("readAt");
  });

  test("группа: служебные сообщения тоже непрочитанные; событие всем остальным участникам", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const c = await registerUser(baseUrl);
    const group = await createGroup(a, [b, c]);
    await sendText(a, group.id, "привет");
    // ПОВЕДЕНИЕ-ВОПРОС: строка «создал(а) группу» от системного бота считается непрочитанной — даже у создателя.
    expect((await rowOf(a, group.id)).unreadCount).toBe(1);
    expect((await rowOf(b, group.id)).unreadCount).toBe(2);
    const [aWs, cWs] = await Promise.all([ws(a.api), ws(c.api)]);

    expect(expectOk(await b.api.post(`/api/chats/${group.id}/read`), readBody).count).toBe(2);
    const ev = await aWs.waitFor("message:read", (e) => e.chatId === group.id);
    // В группах время прочтения не записывается.
    expect(ev).not.toHaveProperty("readAt");
    await cWs.waitFor("message:read", (e) => e.chatId === group.id && e.readerId === b.id);
    expect((await rowOf(b, group.id)).unreadCount).toBe(0);
    expect((await rowOf(c, group.id)).unreadCount).toBe(2);
  });
});

describe("POST /:id/draft", () => {
  test("черновик виден только автору — в списке и в bootstrap", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const dm = await createDm(a, b);
    const bWs = await ws(b.api);

    expectOk(await a.api.post(`/api/chats/${dm.id}/draft`, { text: "недописанное" }), okBody);
    expect((await rowOf(a, dm.id)).draft).toBe("недописанное");
    expect((await rowOf(b, dm.id)).draft).toBeNull();
    expect((await a.api.get("/api/bootstrap")).body.settings.drafts).toEqual({ [dm.id]: "недописанное" });
    await bWs.expectNone("chat:updated");

    expectOk(await a.api.post(`/api/chats/${dm.id}/draft`, { text: "x".repeat(9000) }), okBody);
    expect((await rowOf(a, dm.id)).draft).toHaveLength(8192);

    // Пустой текст или не строка — черновик удаляется.
    expectOk(await a.api.post(`/api/chats/${dm.id}/draft`, { text: 42 }), okBody);
    expect((await rowOf(a, dm.id)).draft).toBeNull();
    expect((await a.api.get("/api/bootstrap")).body.settings.drafts).toEqual({});
  });
});

describe("набор текста", () => {
  test("POST рассылает typing:update остальным участникам, GET показывает набирающего", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const c = await registerUser(baseUrl);
    const outsider = await registerUser(baseUrl);
    const group = await createGroup(a, [b, c]);
    const [aWs, bWs, cWs, outWs] = await Promise.all([ws(a.api), ws(b.api), ws(c.api), ws(outsider.api)]);

    expectOk(await a.api.post(`/api/chats/${group.id}/typing`, { action: "record_voice" }), okBody);
    for (const sock of [bWs, cWs]) {
      const ev = await sock.waitFor("typing:update", (e) => e.chatId === group.id);
      expect(ev).toEqual({ type: "typing:update", chatId: group.id, userId: a.id, action: "record_voice" });
    }
    await aWs.expectNone("typing:update");
    await outWs.expectNone("typing:update");

    expect(expectOk(await b.api.get(`/api/chats/${group.id}/typing`), typingBody)).toEqual({ typingUserId: a.id, typingAction: "record_voice" });
    // Себя набирающий не видит.
    expect(expectOk(await a.api.get(`/api/chats/${group.id}/typing`), typingBody)).toEqual({ typingUserId: null, typingAction: null });

    // Неизвестное действие — обычный «печатает».
    bWs.clear();
    expectOk(await a.api.post(`/api/chats/${group.id}/typing`, { action: "dance" }), okBody);
    expect((await bWs.waitFor("typing:update")).action).toBe("typing");
    expect(expectOk(await c.api.get(`/api/chats/${group.id}/typing`), typingBody).typingAction).toBe("typing");

    bWs.clear();
    expectOk(await a.api.post(`/api/chats/${group.id}/typing`, { action: "cancel" }), okBody);
    expect((await bWs.waitFor("typing:update")).action).toBe("cancel");
    expect(expectOk(await b.api.get(`/api/chats/${group.id}/typing`), typingBody)).toEqual({ typingUserId: null, typingAction: null });
  });

  test("набор не проходит через блокировку — ни заблокировавшему, ни заблокированному", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const c = await registerUser(baseUrl);
    const group = await createGroup(a, [b, c]);
    const dm = await createDm(a, b);
    expect((await a.api.post(`/api/users/${b.id}/block`, { blocked: true })).status).toBe(200);
    const [aWs, bWs, cWs] = await Promise.all([ws(a.api), ws(b.api), ws(c.api)]);

    // Заблокированный печатает — заблокировавший не видит ни в личке, ни в группе; остальные видят.
    expectOk(await b.api.post(`/api/chats/${dm.id}/typing`, {}), okBody);
    expectOk(await b.api.post(`/api/chats/${group.id}/typing`, {}), okBody);
    await cWs.waitFor("typing:update", (e) => e.chatId === group.id && e.userId === b.id);
    await aWs.expectNone("typing:update");
    for (const chatId of [dm.id, group.id]) {
      expect(expectOk(await a.api.get(`/api/chats/${chatId}/typing`), typingBody)).toEqual({ typingUserId: null, typingAction: null });
    }
    expect(expectOk(await c.api.get(`/api/chats/${group.id}/typing`), typingBody).typingUserId).toBe(b.id);

    // И в обратную сторону: заблокированный не видит набор того, кто его заблокировал.
    expectOk(await a.api.post(`/api/chats/${dm.id}/typing`, {}), okBody);
    await bWs.expectNone("typing:update", (e) => e.userId === a.id);
    expect(expectOk(await b.api.get(`/api/chats/${dm.id}/typing`), typingBody)).toEqual({ typingUserId: null, typingAction: null });
  });
});

describe("POST /pinned-order", () => {
  test("порядок закреплённых чатов", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const c1 = await createGroup(a, [b]);
    const c2 = await createGroup(a, [b]);
    const unpinned = await createGroup(a, []);
    const foreign = await createGroup(b, []);

    expectError(await a.api.post("/api/chats/pinned-order", {}), 400, "Нужен список чатов");
    expectError(await a.api.post("/api/chats/pinned-order", { chatIds: [1, 2] }), 400, "Нужен список чатов");
    expectError(await a.api.post("/api/chats/pinned-order", { chatIds: Array.from({ length: 501 }, (_, i) => `c${i}`) }), 400, "Нужен список чатов");

    await a.api.patch(`/api/chats/${c1.id}`, { pinned: true });
    await a.api.patch(`/api/chats/${c2.id}`, { pinned: true });
    // Закреплённый последним — сверху.
    expect((await rowOf(a, c2.id)).pinOrder).toBe(0);
    expect((await rowOf(a, c1.id)).pinOrder).toBe(1);
    expect((await rowOf(a, unpinned.id)).pinOrder).toBeNull();

    const res = expectOk(await a.api.post("/api/chats/pinned-order", { chatIds: [c1.id, foreign.id, unpinned.id, c1.id, c2.id] }), pinnedOrderBody);
    // Чужие и незакреплённые чаты отбрасываются.
    expect(res.pinnedOrder).toEqual([c1.id, c2.id]);
    expect((await rowOf(a, c1.id)).pinOrder).toBe(0);
    expect((await rowOf(a, c2.id)).pinOrder).toBe(1);
    // У другого участника порядок свой.
    expect((await rowOf(b, c1.id)).pinOrder).toBeNull();

    // Открепление убирает чат из порядка.
    await a.api.patch(`/api/chats/${c1.id}`, { pinned: false });
    expect((await rowOf(a, c2.id)).pinOrder).toBe(0);
    expect(z.array(z.string()).parse((await a.api.get("/api/bootstrap")).body.settings.pinnedOrder)).toEqual([c2.id]);
  });
});
