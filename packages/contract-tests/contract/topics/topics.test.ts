// Темы в группах: /api/chats/:id/topics — включение, создание, правка/закрытие, удаление.
import { afterAll, describe, expect, test } from "vitest";
import { chat } from "../../schemas/chat";
import { adminLogBody, chatBody, chatCard, setPermissionsBody } from "../../schemas/chats";
import { okBody } from "../../schemas/common";
import { historyPage } from "../../schemas/messages";
import { topicBody, topicsEnabledBody, topicsListBody } from "../../schemas/topics";
import { Api } from "../../support/client";
import { expectError, expectOk, expectShape } from "../../support/expect";
import { createChannel, createDm, createGroup, registerUser, sendText, type TestUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { connectWs, type WsClient } from "../../support/ws";

const server = useServer();
const sockets: WsClient[] = [];
afterAll(async () => {
  await Promise.all(sockets.map((s) => s.close()));
});
async function ws(user: TestUser) {
  const s = await connectWs(user.api);
  sockets.push(s);
  return s;
}

const topics = (chatId: string, rest = "") => `/api/chats/${chatId}/topics${rest}`;
const enable = (u: TestUser, chatId: string, enabled: unknown = true) => u.api.post(topics(chatId, "/enabled"), { enabled });
const create = (u: TestUser, chatId: string, body: Record<string, unknown>) => u.api.post(topics(chatId), body);
const COLORS = ["#6fb9f0", "#ffd67e", "#cb86db", "#8eee98", "#ff93b2", "#fb6f5f"];

async function forumGroup(owner: TestUser, members: TestUser[], extra: Record<string, unknown> = {}) {
  const group = await createGroup(owner, members, extra);
  expectOk(await enable(owner, group.id), topicsEnabledBody);
  return group;
}

describe("доступ", () => {
  test("401 без сессии, 404 постороннему, 400 не в группе", async () => {
    const { baseUrl } = server();
    const anon = new Api(baseUrl);
    for (const res of await Promise.all([
      anon.get(topics("c_whatever00")),
      anon.post(topics("c_whatever00", "/enabled"), { enabled: true }),
      anon.post(topics("c_whatever00"), { title: "x" }),
      anon.patch(topics("c_whatever00", "/topic_x0000000"), {}),
      anon.delete(topics("c_whatever00", "/topic_x0000000")),
    ])) expectError(res, 401, "unauthorized");

    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const outsider = await registerUser(baseUrl);
    const group = await createGroup(a, [b]);
    const channel = await createChannel(a, []);
    const dm = await createDm(a, b);
    const calls = (u: TestUser, id: string) => [
      u.api.get(topics(id)),
      u.api.post(topics(id, "/enabled"), { enabled: true }),
      u.api.post(topics(id), { title: "x" }),
      u.api.patch(topics(id, "/topic_x0000000"), { title: "x" }),
      u.api.delete(topics(id, "/topic_x0000000")),
    ];
    for (const res of await Promise.all(calls(outsider, group.id))) expectError(res, 404, "not found");
    for (const res of await Promise.all(calls(a, "c_nonexistent00"))) expectError(res, 404, "not found");
    for (const id of [channel.id, dm.id]) {
      for (const res of await Promise.all(calls(a, id))) expectError(res, 400, "Темы есть только в группах");
    }
  });
});

describe("POST /enabled и GET /", () => {
  test("включение и выключение: служебные строки, chat:updated и topics:updated участникам", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl, { name: "Алиса" });
    const b = await registerUser(baseUrl);
    const mod = await registerUser(baseUrl);
    const outsider = await registerUser(baseUrl);
    const group = await createGroup(a, [b, mod]);
    expectOk(await a.api.post(`/api/chats/${group.id}/members`, { userId: mod.id, role: "mod" }), chatBody);
    const [bWs, outWs] = await Promise.all([ws(b), ws(outsider)]);

    expect(expectOk(await b.api.get(topics(group.id)), topicsListBody)).toEqual({ enabled: false, topics: [] });
    expectError(await enable(b, group.id), 403, "Включать темы может только администратор");
    // Модератор — не администратор.
    expectError(await enable(mod, group.id), 403, "Включать темы может только администратор");

    const on = expectOk(await enable(a, group.id, 1), topicsEnabledBody);
    expect(on).toMatchObject({ enabled: true, topics: [], chat: { id: group.id, topicsEnabled: true } });
    const upd = await bWs.waitFor("chat:updated", (e) => e.chat?.id === group.id && e.chat.topicsEnabled === true);
    expectShape(chat, upd.chat);
    expect(await bWs.waitFor("topics:updated", (e) => e.chatId === group.id)).toEqual({ type: "topics:updated", chatId: group.id });
    await bWs.waitFor("message:new", (e) => e.chatId === group.id && e.message?.text === "Алиса включил(а) темы в группе");
    await outWs.expectNone("topics:updated");
    await outWs.expectNone("chat:updated");
    expect(expectOk(await b.api.get(topics(group.id)), topicsListBody)).toEqual({ enabled: true, topics: [] });

    // Повторное включение — без служебной строки, но события снова рассылаются.
    bWs.clear();
    expectOk(await enable(a, group.id, true), topicsEnabledBody);
    await bWs.waitFor("topics:updated", (e) => e.chatId === group.id);
    await bWs.expectNone("message:new", (e) => e.chatId === group.id);

    expectOk(await create(a, group.id, { title: "Тема" }), topicBody);
    const off = expectOk(await enable(a, group.id, false), topicsEnabledBody);
    expect(off.enabled).toBe(false);
    expect(off.topics).toEqual([]);
    expect(off.chat).not.toHaveProperty("topicsEnabled");
    await bWs.waitFor("message:new", (e) => e.message?.text === "Алиса выключил(а) темы в группе");
    // Темы при выключении не удаляются — снова видны после включения.
    expect(expectOk(await b.api.get(topics(group.id)), topicsListBody)).toEqual({ enabled: false, topics: [] });
    expect(expectOk(await enable(a, group.id), topicsEnabledBody).topics.map((t) => t.title)).toEqual(["Тема"]);

    const log = expectOk(await a.api.get(`/api/chats/${group.id}/admin-log`), adminLogBody).entries.map((e) => e.action);
    expect(log).toEqual(expect.arrayContaining(["topics_on", "topics_off", "topic_create"]));
  });
});

describe("POST / — создание темы", () => {
  test("тема: иконка, цвет, служебная строка, topics:updated; счётчик сообщений", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl, { name: "Борис" });
    const outsider = await registerUser(baseUrl);
    const group = await forumGroup(a, [b]);
    const [aWs, outWs] = await Promise.all([ws(a), ws(outsider)]);

    expectError(await create(b, group.id, {}), 400, "Введите название темы");
    expectError(await create(b, group.id, { title: "   " }), 400, "Введите название темы");

    const t = expectOk(await create(b, group.id, { title: `  ${"Т".repeat(80)}  `, icon: "🔥", color: COLORS[3] }), topicBody).topic;
    expect(t).toEqual({
      id: t.id,
      chatId: group.id,
      title: "Т".repeat(64),
      icon: "🔥",
      color: COLORS[3],
      closed: false,
      createdBy: b.id,
      createdAt: t.createdAt,
    });
    await aWs.waitFor("topics:updated", (e) => e.chatId === group.id);
    await aWs.waitFor("message:new", (e) => e.chatId === group.id && e.message?.text === `Борис создал(а) тему «${"Т".repeat(64)}»`);
    await outWs.expectNone("topics:updated");

    // Неподходящая иконка отбрасывается, неизвестный цвет — по кругу палитры (по числу тем).
    const plain = expectOk(await create(b, group.id, { title: "Вторая", icon: "abc", color: "#000000" }), topicBody).topic;
    expect(plain).not.toHaveProperty("icon");
    expect(plain.color).toBe(COLORS[1]);
    const third = expectOk(await create(a, group.id, { title: "Третья", icon: "<b>" }), topicBody).topic;
    expect(third).not.toHaveProperty("icon");
    expect(third.color).toBe(COLORS[2]);

    const m = await sendText(b, group.id, "в тему", { topicId: t.id });
    expect(m.topicId).toBe(t.id);
    await sendText(b, group.id, "в общее");
    const list = expectOk(await a.api.get(topics(group.id)), topicsListBody).topics;
    expect(list.map((x) => [x.id, x.messageCount])).toEqual([
      [t.id, 1],
      [plain.id, 0],
      [third.id, 0],
    ]);
    expect(list[0].lastMessageAt).toBe(m.createdAt);
    expect(list[1].lastMessageAt).toBe(plain.createdAt);
    // История по теме.
    const inTopic = expectOk(await a.api.get(`/api/chats/${group.id}/messages`, { query: { topic: t.id } }), historyPage).messages;
    expect(inTopic.map((x) => x.id)).toEqual([m.id]);
  });

  test("выключенные темы, право createTopics, лимит 100", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const off = await createGroup(a, [b]);
    expectError(await create(a, off.id, { title: "x" }), 400, "В этой группе темы выключены");

    const group = await forumGroup(a, [b]);
    expectOk(await a.api.post(`/api/chats/${group.id}/permissions`, { permissions: { createTopics: false } }), setPermissionsBody);
    expectError(await create(b, group.id, { title: "x" }), 403, "В этой группе создавать темы могут только администраторы");
    expectOk(await create(a, group.id, { title: "Можно админу" }), topicBody);

    for (let i = 2; i <= 100; i++) expectOk(await create(a, group.id, { title: `Тема ${i}` }), topicBody);
    expectError(await create(a, group.id, { title: "Сто первая" }), 400, "Не больше 100 тем в группе");
    expect(expectOk(await a.api.get(topics(group.id)), topicsListBody).topics).toHaveLength(100);
  });
});

describe("PATCH /:topicId", () => {
  test("автор переименовывает свою тему; закрывают и правят чужие только админы и модераторы", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl, { name: "Алиса" });
    const b = await registerUser(baseUrl, { name: "Борис" });
    const c = await registerUser(baseUrl);
    const mod = await registerUser(baseUrl, { name: "Модер" });
    const group = await forumGroup(a, [b, c, mod]);
    expectOk(await a.api.post(`/api/chats/${group.id}/members`, { userId: mod.id, role: "mod" }), chatBody);
    const other = await forumGroup(a, []);
    const foreign = expectOk(await create(a, other.id, { title: "Чужая" }), topicBody).topic;
    const t = expectOk(await create(b, group.id, { title: "Старое" }), topicBody).topic;
    const cWs = await ws(c);

    expectError(await a.api.patch(topics(group.id, "/topic_nonexistent0"), { title: "x" }), 404, "Тема не найдена");
    expectError(await a.api.patch(topics(group.id, `/${foreign.id}`), { title: "x" }), 404, "Тема не найдена");
    expectError(await c.api.patch(topics(group.id, `/${t.id}`), { title: "x" }), 403, "Недостаточно прав");
    expectError(await b.api.patch(topics(group.id, `/${t.id}`), { closed: true }), 403, "Закрывать темы могут только администраторы");
    expectError(await b.api.patch(topics(group.id, `/${t.id}`), { title: "  " }), 400, "Введите название темы");

    const renamed = expectOk(await b.api.patch(topics(group.id, `/${t.id}`), { title: "Новое", icon: "⭐", color: COLORS[5] }), topicBody).topic;
    expect(renamed).toMatchObject({ title: "Новое", icon: "⭐", color: COLORS[5], closed: false });
    await cWs.waitFor("topics:updated", (e) => e.chatId === group.id);
    await cWs.waitFor("message:new", (e) => e.message?.text === "Борис переименовал(а) тему «Старое» в «Новое»");

    // Неизвестный цвет оставляет прежний, пустая иконка стирает.
    const kept = expectOk(await b.api.patch(topics(group.id, `/${t.id}`), { color: "red", icon: "" }), topicBody).topic;
    expect(kept.color).toBe(COLORS[5]);
    expect(kept).not.toHaveProperty("icon");

    const closed = expectOk(await mod.api.patch(topics(group.id, `/${t.id}`), { closed: true }), topicBody).topic;
    expect(closed.closed).toBe(true);
    await cWs.waitFor("message:new", (e) => e.message?.text === "Модер закрыл(а) тему «Новое»");
    // В закрытую тему пишут только админы.
    expectError(await c.api.post(`/api/chats/${group.id}/messages`, { text: "можно?", topicId: t.id }), 403, "Тема закрыта — писать в неё могут только администраторы");
    await sendText(a, group.id, "админ пишет", { topicId: t.id });

    // Повторное закрытие — без служебной строки.
    cWs.clear();
    expectOk(await a.api.patch(topics(group.id, `/${t.id}`), { closed: true }), topicBody);
    await cWs.waitFor("topics:updated", (e) => e.chatId === group.id);
    await cWs.expectNone("message:new", (e) => e.chatId === group.id && e.message?.type === "system");

    expectOk(await a.api.patch(topics(group.id, `/${t.id}`), { closed: false }), topicBody);
    await cWs.waitFor("message:new", (e) => e.message?.text === "Алиса открыл(а) тему «Новое»");
    // Модератор правит и чужую тему.
    expect(expectOk(await mod.api.patch(topics(group.id, `/${t.id}`), { title: "От модератора" }), topicBody).topic.title).toBe("От модератора");

    const log = expectOk(await a.api.get(`/api/chats/${group.id}/admin-log`), adminLogBody).entries.map((e) => e.action);
    expect(log).toEqual(expect.arrayContaining(["topic_edit", "topic_close", "topic_open"]));
  });
});

describe("DELETE /:topicId", () => {
  test("удаляет только админ, вместе с сообщениями темы", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl, { name: "Алиса" });
    const b = await registerUser(baseUrl);
    const mod = await registerUser(baseUrl);
    const outsider = await registerUser(baseUrl);
    const group = await forumGroup(a, [b, mod]);
    expectOk(await a.api.post(`/api/chats/${group.id}/members`, { userId: mod.id, role: "mod" }), chatBody);
    const t = expectOk(await create(b, group.id, { title: "Под снос" }), topicBody).topic;
    const m1 = await sendText(b, group.id, "раз", { topicId: t.id });
    const m2 = await sendText(a, group.id, "два", { topicId: t.id });
    const general = await sendText(b, group.id, "общее");
    const [bWs, outWs] = await Promise.all([ws(b), ws(outsider)]);

    expectError(await b.api.delete(topics(group.id, `/${t.id}`)), 403, "Удалять темы может только администратор");
    expectError(await mod.api.delete(topics(group.id, `/${t.id}`)), 403, "Удалять темы может только администратор");
    expectError(await a.api.delete(topics(group.id, "/topic_nonexistent0")), 404, "Тема не найдена");

    expect(expectOk(await a.api.delete(topics(group.id, `/${t.id}`)), okBody)).toEqual({ ok: true });
    for (const id of [m1.id, m2.id]) {
      expect(await bWs.waitFor("message:deleted", (e) => e.id === id)).toEqual({ type: "message:deleted", chatId: group.id, id });
    }
    await bWs.waitFor("topics:updated", (e) => e.chatId === group.id);
    await bWs.waitFor("message:new", (e) => e.message?.text === "Алиса удалил(а) тему «Под снос»");
    await outWs.expectNone("message:deleted");

    expect(expectOk(await b.api.get(topics(group.id)), topicsListBody).topics).toEqual([]);
    const ids = expectOk(await b.api.get(`/api/chats/${group.id}/messages`), historyPage).messages.map((m) => m.id);
    expect(ids).toContain(general.id);
    expect(ids).not.toContain(m1.id);
    expect(ids).not.toContain(m2.id);
    expectError(await a.api.delete(topics(group.id, `/${t.id}`)), 404, "Тема не найдена");
    expect(expectOk(await a.api.get(`/api/chats/${group.id}`), chatCard).chat.topicsEnabled).toBe(true);
    const log = expectOk(await a.api.get(`/api/chats/${group.id}/admin-log`), adminLogBody).entries.map((e) => e.action);
    expect(log).toContain("topic_delete");
  });
});
