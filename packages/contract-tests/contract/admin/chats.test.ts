// Модерация групп, каналов и ботов: поиск (/chats/lookup), верификация
// (/chats/:id/verify), удаление бота (DELETE /bots/:userId) и массовое удаление
// из каталога (/moderation/delete).
import { describe, expect, test } from "vitest";
import { bulkDeleteBody, chatLookupBody, chatVerifyBody, directoryChatsBody, directoryUsersBody, exportsBody } from "../../schemas/admin";
import { chat as chatSchema } from "../../schemas/chat";
import { okBody } from "../../schemas/common";
import { message } from "../../schemas/message";
import { expectError, expectOk, expectShape } from "../../support/expect";
import { createChannel, createDm, createGroup, registerUser, uniq, type TestUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { ADMIN_ENV, admins, sectionAdmin, SYSTEM_BOT_ID, wsPool } from "./helpers";

const server = useServer({ env: ADMIN_ENV });
const ws = wsPool();
const { primary } = admins(() => server().baseUrl);

let modUser: TestUser | undefined;
async function mod(): Promise<TestUser> {
  modUser ??= await sectionAdmin(server().baseUrl, await primary(), ["moderation", "legal"]);
  return modUser;
}

async function createBot(owner: TestUser, name: string): Promise<{ userId: string; username: string }> {
  const res = await owner.api.post("/api/bots", { name });
  expect(res.status, res.text).toBe(200);
  return { userId: res.body.bot.user.id, username: res.body.bot.user.username };
}

/** Личка пользователя с ботом — так у бота появляется «аудитория». */
async function startBotChat(user: TestUser, botUserId: string): Promise<string> {
  const res = await user.api.post("/api/chats", { userId: botUserId });
  expect(res.status, res.text).toBe(200);
  return res.body.chat.id;
}

const lookup = (m: TestUser, q: string) => m.api.get("/api/admin/chats/lookup", { query: { q } });
const NOT_FOUND = "Группа, канал или бот не найдены";

describe("GET /api/admin/chats/lookup", () => {
  test("группа по id, по ссылке-приглашению и канал по @username или ссылке", async () => {
    const { baseUrl } = server();
    const m = await mod();
    const owner = await registerUser(baseUrl, { name: "Владелец" });
    const member = await registerUser(baseUrl);
    const group = await createGroup(owner, [member], { title: "Группа поиска" });
    const handle = uniq("chan");
    const channel = await createChannel(owner, [], { title: "Канал поиска", isPublic: true, username: handle });

    const ownerRef = { id: owner.id, name: "Владелец", username: owner.username };
    const groupCard = { chat: { id: group.id, type: "group", title: "Группа поиска", username: null, members: 2, owner: ownerRef } };
    expect(expectOk(await lookup(m, group.id), chatLookupBody)).toEqual(groupCard);

    const invite = await owner.api.post(`/api/chats/${group.id}/invite`);
    expect(invite.status, invite.text).toBe(200);
    expect(expectOk(await lookup(m, `https://shalter.example/join/${invite.body.code}/?ref=1#top`), chatLookupBody)).toEqual(groupCard);

    const channelCard = { chat: { id: channel.id, type: "channel", title: "Канал поиска", username: handle, members: 1, owner: ownerRef } };
    expect(expectOk(await lookup(m, `@${handle}`), chatLookupBody)).toEqual(channelCard);
    expect(expectOk(await lookup(m, `https://shalter.example/${handle}`), chatLookupBody)).toEqual(channelCard);
  });

  test("бот по @username и id: участники — число личек с ним, владелец", async () => {
    const { baseUrl } = server();
    const m = await mod();
    const owner = await registerUser(baseUrl, { name: "Хозяин бота" });
    const fan = await registerUser(baseUrl);
    const bot = await createBot(owner, "Искомый бот");
    await startBotChat(fan, bot.userId);
    await startBotChat(owner, bot.userId);

    const card = { chat: { id: bot.userId, type: "bot", title: "Искомый бот", username: bot.username, members: 2, owner: { id: owner.id, name: "Хозяин бота", username: owner.username } } };
    expect(expectOk(await lookup(m, `@${bot.username}`), chatLookupBody)).toEqual(card);
    expect(expectOk(await lookup(m, bot.userId), chatLookupBody)).toEqual(card);
  });

  test("личка, обычный пользователь, пустой и неизвестный запрос — 404", async () => {
    const { baseUrl } = server();
    const m = await mod();
    const [a, b] = [await registerUser(baseUrl), await registerUser(baseUrl)];
    const dm = await createDm(a, b);
    for (const q of [dm.id, a.id, `@${a.username}`, "", "c_nonexistent00"]) expectError(await lookup(m, q), 404, NOT_FOUND);
    expectError(await m.api.get("/api/admin/chats/lookup"), 404, NOT_FOUND);
  });
});

describe("POST /api/admin/chats/:id/verify", () => {
  test("галочка группе: chat:updated участникам, не посторонним; видно в каталоге", async () => {
    const { baseUrl } = server();
    const m = await mod();
    const owner = await registerUser(baseUrl);
    const member = await registerUser(baseUrl);
    const outsider = await registerUser(baseUrl);
    const tag = uniq("ver");
    const group = await createGroup(owner, [member], { title: `Проверяемая ${tag}` });
    const [memberWs, outsiderWs] = await Promise.all([ws(member.api), ws(outsider.api)]);

    const { chat } = expectOk(await m.api.post(`/api/admin/chats/${group.id}/verify`, { verified: true }), chatVerifyBody);
    expect(chat).toMatchObject({ id: group.id, isVerified: true });
    const ev = await memberWs.waitFor("chat:updated", (e) => e.chat?.id === group.id, 8000);
    expect(expectShape(chatSchema, ev.chat)).toMatchObject({ isVerified: true });
    await outsiderWs.expectNone("chat:updated");
    expect((await member.api.get(`/api/chats/${group.id}`)).body.chat).toMatchObject({ isVerified: true });
    expect(expectOk(await m.api.get("/api/admin/directory", { query: { type: "groups", q: tag } }), directoryChatsBody).items[0]).toMatchObject({
      id: group.id,
      isVerified: true,
    });

    const off = expectOk(await m.api.post(`/api/admin/chats/${group.id}/verify`, {}), chatVerifyBody).chat;
    expect(off).not.toHaveProperty("isVerified");
    await memberWs.waitFor("chat:updated", (e) => e.chat?.id === group.id && !("isVerified" in e.chat), 8000);
  });

  test("канал можно, личку — нет; неизвестный чат — 404", async () => {
    const { baseUrl } = server();
    const m = await mod();
    const [a, b] = [await registerUser(baseUrl), await registerUser(baseUrl)];
    const channel = await createChannel(a);
    expect(expectOk(await m.api.post(`/api/admin/chats/${channel.id}/verify`, { verified: 1 }), chatVerifyBody).chat.isVerified).toBe(true);
    const dm = await createDm(a, b);
    expectError(await m.api.post(`/api/admin/chats/${dm.id}/verify`, { verified: true }), 400, "Верифицировать можно группы, каналы и аккаунты");
    expectError(await m.api.post("/api/admin/chats/c_nonexistent00/verify", { verified: true }), 404, "Чат не найден");
  });
});

describe("DELETE /api/admin/bots/:userId", () => {
  test("удаление бота: владельцу — уведомление, собеседникам — chat:updated, запись в журнал", async () => {
    const { baseUrl } = server();
    const m = await mod();
    const owner = await registerUser(baseUrl);
    const fan = await registerUser(baseUrl);
    const outsider = await registerUser(baseUrl);
    const bot = await createBot(owner, "Плохой бот");
    const fanChatId = await startBotChat(fan, bot.userId);
    const [ownerWs, fanWs, outsiderWs] = await Promise.all([ws(owner.api), ws(fan.api), ws(outsider.api)]);

    expect(expectOk(await m.api.delete(`/api/admin/bots/${bot.userId}`, { reason: "  рассылка спама  " }), okBody)).toEqual({ ok: true });

    const notice = await ownerWs.waitFor("message:new", (e) => e.message?.senderId === SYSTEM_BOT_ID, 8000);
    expect(expectShape(message, notice.message).text).toBe("🛡 Бот «Плохой бот» удалён модерацией Shalter за нарушение правил.\nПричина: рассылка спама");
    expect(await fanWs.waitFor("chat:updated", (e) => e.chat?.id === fanChatId, 8000)).toEqual({ type: "chat:updated", chat: { id: fanChatId } });
    await outsiderWs.expectNone("chat:updated");
    await outsiderWs.expectNone("message:new", () => true, 0);

    expect((await owner.api.get("/api/bots")).body.bots).toEqual([]);
    expect((await fan.api.get(`/api/users/${bot.userId}`)).status).toBe(404);
    expect(expectOk(await m.api.get("/api/admin/directory", { query: { type: "bots", q: "Плохой бот" } }), directoryUsersBody).total).toBe(0);
    const log = expectOk(await m.api.get("/api/admin/exports"), exportsBody).exports;
    expect(log.find((e) => e.reason.startsWith("УДАЛЕНИЕ БОТА"))).toMatchObject({
      reason: `УДАЛЕНИЕ БОТА @${bot.username} (Плохой бот): рассылка спама`,
      target: { id: owner.id },
      admin: { id: m.id },
    });
    expectError(await m.api.delete(`/api/admin/bots/${bot.userId}`, { reason: "ещё раз" }), 404, "Бот не найден");
  });

  test("ошибки: без причины, не бот, служебный бот", async () => {
    const { baseUrl } = server();
    const m = await mod();
    const user = await registerUser(baseUrl);
    const bot = await createBot(user, "Хороший бот");
    expectError(await m.api.delete(`/api/admin/bots/${bot.userId}`, {}), 400, "Укажите причину — она попадёт в журнал и придёт владельцу");
    expectError(await m.api.delete(`/api/admin/bots/${bot.userId}`, { reason: "   " }), 400, "Укажите причину — она попадёт в журнал и придёт владельцу");
    expectError(await m.api.delete(`/api/admin/bots/${user.id}`, { reason: "x" }), 404, "Бот не найден");
    expectError(await m.api.delete("/api/admin/bots/bot_nonexistent00", { reason: "x" }), 404, "Бот не найден");
    expectError(await m.api.delete(`/api/admin/bots/${SYSTEM_BOT_ID}`, { reason: "x" }), 400, "Служебных ботов Shalter удалять нельзя");
    expect((await user.api.get("/api/bots")).body.bots).toHaveLength(1);
  });
});

describe("POST /api/admin/moderation/delete", () => {
  test("группа, канал с обсуждением и бот одним запросом; ошибки по пунктам не мешают остальным", async () => {
    const { baseUrl } = server();
    const m = await mod();
    const owner = await registerUser(baseUrl);
    const member = await registerUser(baseUrl);
    const outsider = await registerUser(baseUrl);
    const group = await createGroup(owner, [member], { title: "Плохая группа" });
    const channel = await createChannel(owner, [member], { title: "Плохой канал" });
    const discussionId = channel.linkedDiscussionChatId;
    expect(discussionId).toBeTruthy();
    const bot = await createBot(owner, "Бот под снос");
    const keep = await createGroup(owner, [member], { title: "Хорошая группа" });
    const dm = await createDm(owner, member);
    const [ownerWs, memberWs, outsiderWs] = await Promise.all([ws(owner.api), ws(member.api), ws(outsider.api)]);

    const res = await m.api.post("/api/admin/moderation/delete", {
      reason: "  нарушение правил сообщества  ",
      items: [
        { id: group.id, kind: "group" },
        { id: group.id, kind: "group" }, // повтор — пропускается молча
        { id: channel.id, kind: "channel" },
        { id: bot.userId, kind: "bot" },
        { id: keep.id, kind: "channel" }, // тип не совпал
        { id: dm.id, kind: "group" }, // личку «группой» не удалить
        { id: "c_nonexistent00", kind: "group" },
        { id: SYSTEM_BOT_ID, kind: "bot" },
        { id: keep.id, kind: "user" }, // неизвестный kind — пропускается
        { kind: "group" }, // без id — пропускается
        "мусор",
      ],
    });
    expect(expectOk(res, bulkDeleteBody)).toEqual({
      deleted: [
        { id: group.id, kind: "group", title: "Плохая группа" },
        { id: channel.id, kind: "channel", title: "Плохой канал" },
        { id: bot.userId, kind: "bot", title: "Бот под снос" },
      ],
      failed: [
        { id: keep.id, error: "Не найдено" },
        { id: dm.id, error: "Не найдено" },
        { id: "c_nonexistent00", error: "Не найдено" },
        { id: SYSTEM_BOT_ID, error: "Служебных ботов Shalter удалять нельзя" },
      ],
    });

    for (const id of [group.id, channel.id]) {
      await memberWs.waitFor("chat:deleted", (e) => e.chatId === id, 8000);
      await ownerWs.waitFor("chat:deleted", (e) => e.chatId === id, 8000);
      expect((await member.api.get(`/api/chats/${id}`)).status).toBe(404);
    }
    // Группа обсуждения уходит вместе с каналом (в ней пока только владелец).
    await ownerWs.waitFor("chat:deleted", (e) => e.chatId === discussionId, 8000);
    expect((await owner.api.get(`/api/chats/${discussionId}`)).status).toBe(404);
    expect(memberWs.events.find((e) => e.type === "chat:deleted")).toEqual({ type: "chat:deleted", chatId: group.id });
    await outsiderWs.expectNone("chat:deleted");
    expect(memberWs.events.some((e) => e.type === "chat:deleted" && (e.chatId === keep.id || e.chatId === dm.id))).toBe(false);
    expect((await member.api.get(`/api/chats/${keep.id}`)).status).toBe(200);
    expect((await member.api.get(`/api/chats/${dm.id}`)).status).toBe(200);

    // Владельцу — по уведомлению на каждый удалённый объект.
    const expected = [
      "🛡 Группа «Плохая группа» удалена модерацией Shalter за нарушение правил.\nПричина: нарушение правил сообщества",
      "🛡 Канал «Плохой канал» удалён модерацией Shalter за нарушение правил.\nПричина: нарушение правил сообщества",
      "🛡 Бот «Бот под снос» удалён модерацией Shalter за нарушение правил.\nПричина: нарушение правил сообщества",
    ];
    for (const text of expected) await ownerWs.waitFor("message:new", (e) => e.message?.senderId === SYSTEM_BOT_ID && e.message.text === text, 8000);
    // Участнику (не владельцу) уведомлений не шлют.
    await memberWs.expectNone("message:new", (e) => e.message?.senderId === SYSTEM_BOT_ID, 0);

    const log = expectOk(await m.api.get("/api/admin/exports"), exportsBody).exports.map((e) => e.reason);
    expect(log).toEqual(
      expect.arrayContaining([
        `УДАЛЕНИЕ ГРУППЫ «Плохая группа» (${group.id}): нарушение правил сообщества`,
        `УДАЛЕНИЕ КАНАЛА «Плохой канал» (${channel.id}): нарушение правил сообщества`,
      ])
    );
  });

  test("ошибки формы: без причины, пусто, больше 100", async () => {
    const m = await mod();
    const item = { id: "c_nonexistent00", kind: "group" };
    expectError(await m.api.post("/api/admin/moderation/delete", { items: [item] }), 400, "Укажите причину — она попадёт в журнал и придёт владельцам");
    expectError(await m.api.post("/api/admin/moderation/delete", { reason: "x" }), 400, "Ничего не выбрано");
    expectError(await m.api.post("/api/admin/moderation/delete", { reason: "x", items: {} }), 400, "Ничего не выбрано");
    expectError(await m.api.post("/api/admin/moderation/delete", { reason: "x", items: [] }), 400, "Ничего не выбрано");
    const many = Array.from({ length: 101 }, (_, i) => ({ id: `c_nonexistent${i}`, kind: "group" }));
    expectError(await m.api.post("/api/admin/moderation/delete", { reason: "x", items: many }), 400, "Не больше 100 за раз");
    // Только мусорные пункты — пустой результат.
    expect(expectOk(await m.api.post("/api/admin/moderation/delete", { reason: "x", items: [{ id: "x", kind: "dm" }] }), bulkDeleteBody)).toEqual({
      deleted: [],
      failed: [],
    });
  });
});
