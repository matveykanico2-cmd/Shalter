// Bot API: получение обновлений (в т. ч. long poll), правка/удаление своих
// сообщений, закреп, «печатает…», чтение истории и поиск, клавиатура,
// отложенные сообщения.
import { describe, expect, test } from "vitest";
import {
  meBody,
  messagesBody,
  messagesPageBody,
  scheduledBody,
  scheduledListBody,
  wsBotMessageDeleted,
  wsTypingUpdate,
} from "../../schemas/bots";
import { okBody } from "../../schemas/common";
import { typingBody } from "../../schemas/chats";
import { messageEnvelope, wsMessageUpdated } from "../../schemas/messages";
import { expectError, expectOk, expectShape } from "../../support/expect";
import { createDm, registerUser, registerUsers, sendText } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { channelWithBot, createBot, groupWithBot, MSG_NOT_FOUND, NOT_MEMBER, startBot, wsPool } from "./helpers";

const server = useServer();
const ws = wsPool();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("me", () => {
  test("аккаунт бота и приложение", async () => {
    const owner = await registerUser(server().baseUrl);
    const b = await createBot(owner, "Я бот", { description: "Описание" });
    const me = expectOk(await b.client.get("me"), meBody);
    expect(me.bot).toMatchObject({ id: b.id, username: b.username, isBot: true, bio: "Описание", online: false });
    expect(me.app).toBeNull();
  });
});

describe("updates", () => {
  test("чужие сообщения из всех чатов бота по времени; after и limit", async () => {
    const { baseUrl } = server();
    const [owner, a, c, outsider] = await registerUsers(baseUrl, 4);
    const b = await createBot(owner, "Слушатель");
    const dmA = await startBot(a, b);
    const dmC = await startBot(c, b);
    const foreign = await createDm(a, outsider);

    expect(expectOk(await b.client.get("updates"), messagesBody).messages).toEqual([]);
    const m1 = await sendText(a, dmA.id, "раз");
    await b.client.post("sendMessage", { chatId: dmA.id, text: "ответ бота" });
    const m2 = await sendText(c, dmC.id, "два");
    await sendText(a, foreign.id, "не боту");
    const m3 = await sendText(a, dmA.id, "три");

    const all = expectOk(await b.client.get("updates"), messagesBody).messages;
    expect(all.map((m) => m.id)).toEqual([m1.id, m2.id, m3.id]);
    expect(all[0]).toEqual(expect.objectContaining({ text: "раз", senderId: a.id, chatId: dmA.id }));

    expect(expectOk(await b.client.get("updates", { after: m1.createdAt }), messagesBody).messages.map((m) => m.id)).toEqual([m2.id, m3.id]);
    expect(expectOk(await b.client.get("updates", { limit: 1 }), messagesBody).messages.map((m) => m.id)).toEqual([m1.id]);
    expect(expectOk(await b.client.get("updates", { after: m3.createdAt }), messagesBody).messages).toEqual([]);
  });

  test("long poll: ждёт новое сообщение; без новых — пустой ответ по таймауту", async () => {
    const { baseUrl } = server();
    const [owner, user] = await registerUsers(baseUrl, 2);
    const b = await createBot(owner, "Ждун");
    const dm = await startBot(user, b);
    const since = new Date().toISOString();

    const started = Date.now();
    const empty = expectOk(await b.client.get("updates", { after: since, timeout: 1 }), messagesBody);
    expect(empty.messages).toEqual([]);
    expect(Date.now() - started).toBeGreaterThanOrEqual(900);

    const pending = b.client.get("updates", { after: since, timeout: 15 });
    await sleep(400);
    const m = await sendText(user, dm.id, "проснись");
    const got = expectOk(await pending, messagesBody).messages;
    expect(got.map((x) => x.id)).toEqual([m.id]);
  });
});

describe("editMessageText / deleteMessage — только свои", () => {
  test("правка: проверки, WS участникам", async () => {
    const { baseUrl } = server();
    const [owner, user, outsider] = await registerUsers(baseUrl, 3);
    const b = await createBot(owner, "Редактор");
    const dm = await startBot(user, b);
    const group = await groupWithBot(owner, [user], b);
    const own = expectOk(await b.client.post("sendMessage", { chatId: dm.id, text: "было" }), messageEnvelope).message;
    const human = await sendText(user, dm.id, "человек");
    const foreignDm = await createDm(user, outsider);
    const foreign = await sendText(user, foreignDm.id, "чужое");
    const src = await sendText(user, group.id, "источник");
    const fwd = expectOk(await b.client.post("forwardMessage", { messageId: src.id, toChatId: dm.id }), messageEnvelope).message;
    const [userWs, outWs] = await Promise.all([ws(user), ws(outsider)]);

    expectError(await b.client.post("editMessageText", { messageId: own.id }), 400, "text is required");
    expectError(await b.client.post("editMessageText", { messageId: "m_nope0000", text: "x" }), 404, MSG_NOT_FOUND);
    expectError(await b.client.post("editMessageText", { messageId: foreign.id, text: "x" }), 404, NOT_MEMBER);
    expectError(await b.client.post("editMessageText", { messageId: human.id, text: "x" }), 403, "Bot can only touch its own messages");
    expectError(await b.client.post("editMessageText", { messageId: fwd.id, text: "x" }), 400, "Forwarded messages can't be edited");

    const edited = expectOk(await b.client.post("editMessageText", { messageId: own.id, text: "с".repeat(5000) }), messageEnvelope).message;
    expect(edited.text).toHaveLength(4096);
    expect(edited.editedAt).toBeDefined();
    const ev = expectShape(wsMessageUpdated, await userWs.waitFor("message:updated", (e) => e.message?.id === own.id));
    expect(ev).toEqual({ type: "message:updated", chatId: dm.id, message: edited });
    await outWs.expectNone("message:updated");
    const history = (await user.api.get(`/api/chats/${dm.id}/messages`)).body.messages;
    expect(history.find((m: any) => m.id === own.id).text).toBe(edited.text);
  });

  test("удаление: для всех, WS message:deleted с messageId", async () => {
    const { baseUrl } = server();
    const [owner, user, outsider] = await registerUsers(baseUrl, 3);
    const b = await createBot(owner, "Удалятор");
    const dm = await startBot(user, b);
    const own = expectOk(await b.client.post("sendMessage", { chatId: dm.id, text: "удалить" }), messageEnvelope).message;
    const human = await sendText(user, dm.id, "человек");
    const [userWs, outWs] = await Promise.all([ws(user), ws(outsider)]);

    expectError(await b.client.post("deleteMessage", { messageId: "m_nope0000" }), 404, MSG_NOT_FOUND);
    expectError(await b.client.post("deleteMessage", {}), 404, MSG_NOT_FOUND);
    expectError(await b.client.post("deleteMessage", { messageId: human.id }), 403, "Bot can only touch its own messages");

    expectOk(await b.client.post("deleteMessage", { messageId: own.id }), okBody);
    const ev = expectShape(wsBotMessageDeleted, await userWs.waitFor("message:deleted", (e) => e.id === own.id));
    expect(ev).toEqual({ type: "message:deleted", chatId: dm.id, id: own.id, messageId: own.id });
    await outWs.expectNone("message:deleted");
    const ids = (await user.api.get(`/api/chats/${dm.id}/messages`)).body.messages.map((m: any) => m.id);
    expect(ids).toEqual([human.id]);
    expectError(await b.client.get("getMessage", { messageId: own.id }), 404, MSG_NOT_FOUND);
  });
});

describe("pinChatMessage / unpinChatMessage / getPinnedMessages", () => {
  test("в личке можно; в группе — только админом", async () => {
    const { baseUrl } = server();
    const [owner, user, outsider] = await registerUsers(baseUrl, 3);
    const b = await createBot(owner, "Закреп");
    const dm = await startBot(user, b);
    const human = await sendText(user, dm.id, "закрепи меня");
    const group = await groupWithBot(owner, [user], b, { admin: false });
    const inGroup = await sendText(user, group.id, "в группе");
    const foreignDm = await createDm(user, outsider);
    const foreign = await sendText(user, foreignDm.id, "чужое");
    const userWs = await ws(user);

    for (const method of ["pinChatMessage", "unpinChatMessage"]) {
      expectError(await b.client.post(method, { messageId: "m_nope0000" }), 404, MSG_NOT_FOUND);
      expectError(await b.client.post(method, { messageId: foreign.id }), 404, NOT_MEMBER);
    }
    expectError(await b.client.post("pinChatMessage", { messageId: inGroup.id }), 403, "Bot must be an admin to pin messages");
    expectError(await b.client.post("unpinChatMessage", { messageId: inGroup.id }), 403, "Bot must be an admin to unpin messages");

    // Чужое сообщение в личке закрепить можно.
    const pinned = expectOk(await b.client.post("pinChatMessage", { messageId: human.id }), messageEnvelope).message;
    expect(pinned.pinned).toBe(true);
    await userWs.waitFor("message:updated", (e) => e.message?.id === human.id && e.message.pinned === true);
    expect(expectOk(await b.client.get("getPinnedMessages", { chatId: dm.id }), messagesBody).messages.map((m) => m.id)).toEqual([human.id]);

    expect(expectOk(await b.client.post("pinChatMessage", { messageId: human.id, pinned: false }), messageEnvelope).message.pinned).toBe(false);
    await b.client.post("pinChatMessage", { messageId: human.id });
    const unpinned = expectOk(await b.client.post("unpinChatMessage", { messageId: human.id }), messageEnvelope).message;
    expect(unpinned.pinned).toBe(false);
    await userWs.waitFor("message:updated", (e) => e.message?.id === human.id && e.message.pinned === false);
    expect(expectOk(await b.client.get("getPinnedMessages", { chatId: dm.id }), messagesBody).messages).toEqual([]);
    expectError(await b.client.get("getPinnedMessages", { chatId: foreignDm.id }), 404, NOT_MEMBER);

    // Админом в группе — можно.
    const adminGroup = await groupWithBot(owner, [user], b);
    const m = await sendText(user, adminGroup.id, "важно");
    expect(expectOk(await b.client.post("pinChatMessage", { messageId: m.id }), messageEnvelope).message.pinned).toBe(true);
  });
});

describe("sendChatAction", () => {
  test("«печатает» участникам, неизвестное действие — typing", async () => {
    const { baseUrl } = server();
    const [owner, user, outsider] = await registerUsers(baseUrl, 3);
    const b = await createBot(owner, "Печатник");
    const dm = await startBot(user, b);
    const foreign = await createDm(user, outsider);
    const [userWs, outWs] = await Promise.all([ws(user), ws(outsider)]);

    expectError(await b.client.post("sendChatAction", { chatId: foreign.id }), 404, NOT_MEMBER);
    expectOk(await b.client.post("sendChatAction", { chatId: dm.id, action: "upload_photo" }), okBody);
    const ev = expectShape(wsTypingUpdate, await userWs.waitFor("typing:update", (e) => e.chatId === dm.id));
    expect(ev).toEqual({ type: "typing:update", chatId: dm.id, userId: b.id, action: "upload_photo" });
    await outWs.expectNone("typing:update");
    expect(expectOk(await user.api.get(`/api/chats/${dm.id}/typing`), typingBody)).toEqual({ typingUserId: b.id, typingAction: "upload_photo" });

    userWs.clear();
    await b.client.post("sendChatAction", { chatId: dm.id, action: "dance" });
    expect((await userWs.waitFor("typing:update")).action).toBe("typing");
  });
});

describe("getMessage / getMessages / searchMessages", () => {
  test("чтение истории ботом", async () => {
    const { baseUrl } = server();
    const [owner, user, outsider] = await registerUsers(baseUrl, 3);
    const b = await createBot(owner, "Читатель");
    const dm = await startBot(user, b);
    const sent = [];
    for (const t of ["Альфа", "бета", "Гамма альфа", "дельта"]) sent.push(await sendText(user, dm.id, t));
    const foreignDm = await createDm(user, outsider);
    const foreign = await sendText(user, foreignDm.id, "чужое");

    expect(expectOk(await b.client.get("getMessage", { messageId: sent[1].id }), messageEnvelope).message).toEqual(sent[1]);
    expectError(await b.client.get("getMessage", { messageId: "m_nope0000" }), 404, MSG_NOT_FOUND);
    expectError(await b.client.get("getMessage", { messageId: foreign.id }), 404, NOT_MEMBER);

    const page = expectOk(await b.client.get("getMessages", { chatId: dm.id }), messagesPageBody);
    expect(page.messages.map((m) => m.id)).toEqual(sent.map((m) => m.id));
    expect(page.hasMore).toBe(false);
    const last2 = expectOk(await b.client.get("getMessages", { chatId: dm.id, limit: 2 }), messagesPageBody);
    expect(last2.messages.map((m) => m.id)).toEqual([sent[2].id, sent[3].id]);
    expect(last2.hasMore).toBe(true);
    const before = expectOk(await b.client.get("getMessages", { chatId: dm.id, before: sent[2].createdAt }), messagesPageBody);
    expect(before.messages.map((m) => m.id)).toEqual([sent[0].id, sent[1].id]);
    expectError(await b.client.get("getMessages", { chatId: foreignDm.id }), 404, NOT_MEMBER);

    // Членство проверяется раньше запроса.
    expectError(await b.client.get("searchMessages", { chatId: foreignDm.id }), 404, NOT_MEMBER);
    expectError(await b.client.get("searchMessages", { chatId: dm.id, q: "  " }), 400, "q is required");
    const found = expectOk(await b.client.get("searchMessages", { chatId: dm.id, q: "АЛЬФА" }), messagesBody).messages;
    expect(found.map((m) => m.id)).toEqual([sent[0].id, sent[2].id]);
    expect(expectOk(await b.client.get("searchMessages", { chatId: dm.id, q: "нет такого" }), messagesBody).messages).toEqual([]);
  });
});

describe("editMessageKeyboard", () => {
  test("замена и снятие клавиатуры своего сообщения", async () => {
    const { baseUrl } = server();
    const [owner, user] = await registerUsers(baseUrl, 2);
    const b = await createBot(owner, "Кнопки");
    const dm = await startBot(user, b);
    const own = expectOk(await b.client.post("sendMessage", { chatId: dm.id, text: "меню", keyboard: [[{ text: "A", action: "a" }]] }), messageEnvelope).message;
    const human = await sendText(user, dm.id, "человек");
    const userWs = await ws(user);

    expectError(await b.client.post("editMessageKeyboard", { messageId: "m_nope0000", keyboard: [] }), 404, MSG_NOT_FOUND);
    expectError(await b.client.post("editMessageKeyboard", { messageId: human.id, keyboard: [] }), 403, "Bot can only touch its own messages");

    const next = expectOk(
      await b.client.post("editMessageKeyboard", { messageId: own.id, keyboard: [[{ text: "B", url: "https://b.example" }, { text: "плохая", url: "ftp://x" }]] }),
      messageEnvelope,
    ).message;
    expect(next.keyboard).toEqual([[{ text: "B", url: "https://b.example" }]]);
    await userWs.waitFor("message:updated", (e) => e.message?.id === own.id);
    const cleared = expectOk(await b.client.post("editMessageKeyboard", { messageId: own.id }), messageEnvelope).message;
    expect(cleared).not.toHaveProperty("keyboard");
  });
});

describe("scheduleMessage / getScheduled / cancelScheduled", () => {
  test("отложенные сообщения бота", async () => {
    const { baseUrl } = server();
    const [owner, user, outsider, sub] = await registerUsers(baseUrl, 4);
    const b = await createBot(owner, "Планировщик");
    const dm = await startBot(user, b);
    const foreign = await createDm(user, outsider);
    const future = new Date(Date.now() + 3600_000).toISOString();

    expectError(await b.client.post("scheduleMessage", { chatId: foreign.id, text: "x", sendAt: future }), 404, NOT_MEMBER);
    expectError(await b.client.get("getScheduled", { chatId: foreign.id }), 404, NOT_MEMBER);
    expectError(await b.client.post("scheduleMessage", { chatId: dm.id, sendAt: future }), 400, "text is required");
    for (const sendAt of [undefined, "завтра", new Date(Date.now() - 1000).toISOString()]) {
      expectError(await b.client.post("scheduleMessage", { chatId: dm.id, text: "x", sendAt }), 400, "sendAt must be a future ISO date");
    }

    const s = expectOk(await b.client.post("scheduleMessage", { chatId: dm.id, text: "т".repeat(5000), sendAt: future }), scheduledBody).scheduled;
    expect(s).toMatchObject({ chatId: dm.id, senderId: b.id, replyToId: null, topicId: null, repeat: null, sendAt: future });
    expect(s.text).toHaveLength(4000);
    expect(s).not.toHaveProperty("attachments");

    // Отложенные человека бот не видит и отменить не может.
    const userSched = await user.api.post(`/api/chats/${dm.id}/messages/scheduled`, { text: "моё", sendAt: future });
    expect(userSched.status).toBe(200);
    expect(expectOk(await b.client.get("getScheduled", { chatId: dm.id }), scheduledListBody).scheduled).toEqual([s]);
    expectError(await b.client.post("cancelScheduled", { scheduledId: userSched.body.scheduled.id }), 404, "Not found");
    expectError(await b.client.post("cancelScheduled", { scheduledId: "sm_nope" }), 404, "Not found");

    // Сообщение ещё не отправлено — в истории его нет.
    expect((await user.api.get(`/api/chats/${dm.id}/messages`)).body.messages).toEqual([]);

    expectOk(await b.client.post("cancelScheduled", { scheduledId: s.id }), okBody);
    expect(expectOk(await b.client.get("getScheduled", { chatId: dm.id }), scheduledListBody).scheduled).toEqual([]);
    expectError(await b.client.post("cancelScheduled", { scheduledId: s.id }), 404, "Not found");

    // ПОВЕДЕНИЕ-ВОПРОС: планирование не проверяет права отправки — бот, не админ канала, ставит пост в очередь.
    const channel = await channelWithBot(owner, [sub], b, { admin: false });
    expectOk(await b.client.post("scheduleMessage", { chatId: channel.id, text: "пост", sendAt: future }), scheduledBody);
  });
});
