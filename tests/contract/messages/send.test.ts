// Отправка сообщений: POST /api/chats/:id/messages — проверки, идемпотентность
// по clientId, ответы, пересылка, упоминания, каналы и WS-рассылка.
import { describe, expect, test } from "vitest";
import { z } from "zod";
import { chatSummary } from "../../schemas/chat";
import { message } from "../../schemas/message";
import { historyPage, messageEnvelope, sendResult, wsMessageNew } from "../../schemas/messages";
import { Api } from "../../support/client";
import { expectError, expectOk, expectShape } from "../../support/expect";
import { createChannel, createDm, createGroup, registerUser, registerUsers, sendText, uniq } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { aboutMessage, msgs, useSockets } from "./helpers";

const server = useServer();
const ws = useSockets();

const chatList = z.strictObject({ chats: z.array(chatSummary) });

describe("POST /api/chats/:id/messages — проверки", () => {
  test("без сессии — 401 unauthorized", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const dm = await createDm(a, b);
    const anon = new Api(baseUrl);
    expectError(await anon.post(msgs(dm.id), { text: "привет" }), 401, "unauthorized");
    expectError(await anon.get(msgs(dm.id)), 401, "unauthorized");
  });

  test("не участник и несуществующий чат — 404 not found", async () => {
    const { baseUrl } = server();
    const [a, b, outsider] = await registerUsers(baseUrl, 3);
    const dm = await createDm(a, b);
    expectError(await outsider.api.post(msgs(dm.id), { text: "привет" }), 404, "not found");
    expectError(await outsider.api.get(msgs(dm.id)), 404, "not found");
    expectError(await a.api.post(msgs("c_doesnotexist0"), { text: "привет" }), 404, "not found");
  });

  test("пустое сообщение — 400 empty message", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const dm = await createDm(a, b);
    for (const body of [{}, { text: "" }, { text: "   \n " }, { text: "", attachments: [] }]) {
      expectError(await a.api.post(msgs(dm.id), body), 400, "empty message");
    }
    // Вложения, которые не прошли очистку, не считаются: пустое сообщение не уходит.
    expectError(await a.api.post(msgs(dm.id), { text: "", attachments: [{ kind: "bogus" }] }), 400, "empty message");
    expect(expectOk(await a.api.get(msgs(dm.id)), historyPage).messages).toEqual([]);
  });

  test("длина текста: 4096 можно, 4097 — 400", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const dm = await createDm(a, b);
    expectOk(await a.api.post(msgs(dm.id), { text: "я".repeat(4096) }), sendResult);
    expectError(await a.api.post(msgs(dm.id), { text: "я".repeat(4097) }), 400, "Сообщение длиннее 4096 символов");
  });

  test("текст не строкой — 400 Некорректный текст", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const dm = await createDm(a, b);
    expectError(await a.api.post(msgs(dm.id), { text: 5 }), 400, "Некорректный текст");
    // Вложение не спасает: тип текста проверяется первым.
    expectError(await a.api.post(msgs(dm.id), { text: 5, attachments: [{ kind: "dice" }] }), 400, "Некорректный текст");
  });
});

describe("POST /api/chats/:id/messages — отправка", () => {
  test("текст в личке: форма, WS собеседнику, не отправителю и не постороннему", async () => {
    const { baseUrl } = server();
    const [a, b, outsider] = await registerUsers(baseUrl, 3);
    const dm = await createDm(a, b);
    const [aWs, bWs, outWs] = await Promise.all([ws(a), ws(b), ws(outsider)]);

    const res = await a.api.post(msgs(dm.id), { text: "привет, мир" });
    const { message: sent } = expectOk(res, sendResult);
    expect(res.body).not.toHaveProperty("chargedStars");
    expect(sent).toMatchObject({
      chatId: dm.id,
      senderId: a.id,
      type: "text",
      text: "привет, мир",
      pinned: false,
      replyToId: null,
      reactions: [],
      readByIds: [a.id],
      deletedForIds: [],
      mentionedUserIds: [],
      views: 0,
    });
    for (const key of ["editedAt", "forwardedFrom", "attachments", "threadRootId", "topicId", "effect", "paidStars", "anonymous", "linkPreview"]) {
      expect(sent, `поле ${key}`).not.toHaveProperty(key);
    }

    const event = await bWs.waitFor("message:new", aboutMessage(sent.id));
    expectShape(wsMessageNew, event, "WS message:new");
    expect(event).toMatchObject({ chatId: dm.id, message: { id: sent.id, text: "привет, мир" } });
    expect(event).not.toHaveProperty("silent");
    await aWs.expectNone("message:new", aboutMessage(sent.id));
    await outWs.expectNone("message:new", aboutMessage(sent.id), 50);

    // Сообщение видно в истории обоим.
    const history = expectOk(await b.api.get(msgs(dm.id)), historyPage);
    expect(history.messages.map((m) => m.id)).toEqual([sent.id]);
  });

  test("silent: true — в WS-событии флаг silent", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const dm = await createDm(a, b);
    const bWs = await ws(b);
    const sent = await sendText(a, dm.id, "тихо", { silent: true });
    const event = await bWs.waitFor("message:new", aboutMessage(sent.id));
    expectShape(wsMessageNew, event);
    expect(event.silent).toBe(true);
  });

  test("эффект сохраняется только в личке и только из списка", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const dm = await createDm(a, b);
    const group = await createGroup(a, [b]);
    expect(await sendText(a, dm.id, "огонь", { effect: "🔥" })).toMatchObject({ effect: "🔥" });
    expect(await sendText(a, dm.id, "нет такого", { effect: "🦄" })).not.toHaveProperty("effect");
    expect(await sendText(a, group.id, "в группе", { effect: "🔥" })).not.toHaveProperty("effect");
  });
});

describe("clientId — повтор отправки не создаёт дубль", () => {
  test("тот же clientId дважды подряд и одновременно — одно сообщение", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const dm = await createDm(a, b);
    const bWs = await ws(b);

    const clientId = uniq("cid");
    const first = expectOk(await a.api.post(msgs(dm.id), { text: "раз", clientId }), sendResult);
    // Повтор возвращает тот же ответ, даже если текст в повторе другой.
    const again = expectOk(await a.api.post(msgs(dm.id), { text: "два", clientId }), sendResult);
    expect(again.message.id).toBe(first.message.id);
    expect(again.message.text).toBe("раз");

    const parallelId = uniq("cid");
    const parallel = await Promise.all([1, 2, 3].map(() => a.api.post(msgs(dm.id), { text: "параллельно", clientId: parallelId })));
    const ids = new Set(parallel.map((r) => expectOk(r, sendResult).message.id));
    expect(ids.size).toBe(1);

    // clientId в ответе и в сообщении не появляется.
    expect(first.message).not.toHaveProperty("clientId");

    const history = expectOk(await a.api.get(msgs(dm.id)), historyPage);
    expect(history.messages.map((m) => m.text)).toEqual(["раз", "параллельно"]);
    await bWs.waitFor("message:new", aboutMessage(first.message.id));
    await bWs.expectNone("message:new", (e) => e.message?.text === "два");
    expect(bWs.events.filter((e) => e.type === "message:new").length).toBe(2);
  });

  test("clientId привязан к пользователю и чату", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const dm = await createDm(a, b);
    const group = await createGroup(a, [b]);
    const clientId = uniq("cid");
    const inDm = await sendText(a, dm.id, "в личку", { clientId });
    const inGroup = await sendText(a, group.id, "в группу", { clientId });
    const byOther = await sendText(b, dm.id, "от другого", { clientId });
    expect(new Set([inDm.id, inGroup.id, byOther.id]).size).toBe(3);
  });

  test("clientId длиннее 100 символов или не строка — без защиты от дублей", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const dm = await createDm(a, b);
    for (const clientId of ["x".repeat(101), 12345]) {
      const one = await sendText(a, dm.id, "дубль", { clientId });
      const two = await sendText(a, dm.id, "дубль", { clientId });
      expect(one.id).not.toBe(two.id);
    }
  });

  test("отказ проверки (sendGate) не запоминается под clientId", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const dm = await createDm(a, b);
    const clientId = uniq("cid");
    expectError(await a.api.post(msgs(dm.id), { text: "я".repeat(4097), clientId }), 400, "Сообщение длиннее 4096 символов");
    // Отказ не кэшируется — исправленный повтор с тем же clientId проходит,
    // а дальше clientId уже держит успешную отправку.
    const sent = expectOk(await a.api.post(msgs(dm.id), { text: "короткий", clientId }), sendResult);
    const again = expectOk(await a.api.post(msgs(dm.id), { text: "короткий", clientId }), sendResult);
    expect(again.message.id).toBe(sent.message.id);
  });
});

describe("ответы", () => {
  test("replyToId из этого чата сохраняется, из чужого или несуществующий — null", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const dm = await createDm(a, b);
    const group = await createGroup(a, [b]);
    const root = await sendText(a, dm.id, "вопрос");
    const foreign = await sendText(a, group.id, "из группы");

    const reply = await sendText(b, dm.id, "ответ", { replyToId: root.id });
    expect(reply.replyToId).toBe(root.id);
    expect((await sendText(b, dm.id, "мимо", { replyToId: foreign.id })).replyToId).toBeNull();
    expect((await sendText(b, dm.id, "мимо", { replyToId: "m_doesnotexist0" })).replyToId).toBeNull();
  });
});

describe("пересылка", () => {
  test("подпись и содержимое берутся из исходного сообщения", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl, { name: "Алиса" });
    const b = await registerUser(baseUrl, { name: "Боб" });
    const group = await createGroup(a, [b], { title: "Клуб" });
    const dm = await createDm(b, a);
    const source = await sendText(a, group.id, "оригинал");

    const fwd = expectOk(
      await b.api.post(msgs(dm.id), { text: "подменённый", forwardedFrom: { messageId: source.id, senderName: "Фейк" } }),
      sendResult,
    ).message;
    expect(fwd.text).toBe("оригинал");
    expect(fwd.forwardedFrom).toEqual({ chatId: group.id, chatTitle: "Клуб", senderId: a.id, senderName: "Алиса", linkAllowed: true });

    // Пересылку пересланного: подпись остаётся от первоисточника.
    const again = await sendText(a, group.id, "x", { forwardedFrom: { messageId: fwd.id } });
    expect(again.forwardedFrom).toEqual(fwd.forwardedFrom);

    // «Скрыть имя отправителя» — копия без подписи.
    const hidden = await sendText(b, dm.id, "x", { forwardedFrom: { messageId: source.id, hideAuthor: true } });
    expect(hidden.text).toBe("оригинал");
    expect(hidden).not.toHaveProperty("forwardedFrom");

    // Из лички подпись — имя собеседника, а не title чата.
    const fromDm = await sendText(a, group.id, "x", { forwardedFrom: { messageId: (await sendText(b, dm.id, "из лички")).id } });
    expect(fromDm.forwardedFrom).toEqual({ chatId: dm.id, chatTitle: "Боб", senderId: b.id, senderName: "Боб", linkAllowed: true });
  });

  test("пересылка поста канала подписывается названием канала", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const channel = await createChannel(a, [b], { title: "Новости" });
    const dm = await createDm(b, a);
    const post = await sendText(a, channel.id, "пост");
    const fwd = await sendText(b, dm.id, "x", { forwardedFrom: { messageId: post.id } });
    expect(fwd.forwardedFrom).toEqual({ chatId: channel.id, chatTitle: "Новости", senderName: "Новости" });
  });

  test("ошибки: чужое/несуществующее сообщение — 404; пустой text — 400", async () => {
    const { baseUrl } = server();
    const [a, b, outsider] = await registerUsers(baseUrl, 3);
    const dm = await createDm(a, b);
    const secretSource = await sendText(a, dm.id, "только нам");
    const outDm = await createDm(outsider, a);
    expectError(
      await outsider.api.post(msgs(outDm.id), { text: "x", forwardedFrom: { messageId: secretSource.id } }),
      404,
      "Исходное сообщение не найдено",
    );
    expectError(
      await a.api.post(msgs(dm.id), { text: "x", forwardedFrom: { messageId: "m_doesnotexist0" } }),
      404,
      "Исходное сообщение не найдено",
    );
    expectError(await a.api.post(msgs(dm.id), { text: "x", forwardedFrom: {} }), 404, "Исходное сообщение не найдено");
    // Текст пересылки берётся из источника — свой text в теле не нужен.
    const fwd = expectOk(await a.api.post(msgs(dm.id), { forwardedFrom: { messageId: secretSource.id } }), sendResult).message;
    expect(fwd).toMatchObject({ text: "только нам", forwardedFrom: { senderId: a.id } });
    expectError(await a.api.post(msgs(dm.id), { forwardedFrom: { messageId: "m_doesnotexist0" } }), 404, "Исходное сообщение не найдено");
  });
});

describe("упоминания", () => {
  test("mentionedUserIds — только участники, кроме автора; hasUnreadMention в списке чатов", async () => {
    const { baseUrl } = server();
    const [a, b, c, outsider] = await registerUsers(baseUrl, 4);
    const group = await createGroup(a, [b, c]);
    // Группа может начинаться со служебной строки — считаем от исходного значения.
    const base = expectOk(await b.api.get("/api/chats"), chatList).chats.find((ch) => ch.id === group.id)!;
    expect(base.hasUnreadMention).toBe(false);
    const sent = await sendText(a, group.id, `привет @${b.username.toUpperCase()} и @${c.username}, @${a.username}, @${outsider.username}`);
    expect([...sent.mentionedUserIds].sort()).toEqual([b.id, c.id].sort());

    const bList = expectOk(await b.api.get("/api/chats"), chatList);
    expect(bList.chats.find((ch) => ch.id === group.id)).toMatchObject({ unreadCount: base.unreadCount + 1, hasUnreadMention: true });
    const aList = expectOk(await a.api.get("/api/chats"), chatList);
    expect(aList.chats.find((ch) => ch.id === group.id)).toMatchObject({ hasUnreadMention: false });

    await sendText(a, group.id, "просто так");
    const two = expectOk(await b.api.get("/api/chats"), chatList);
    expect(two.chats.find((ch) => ch.id === group.id)).toMatchObject({ unreadCount: base.unreadCount + 2, hasUnreadMention: true });

    // Прочитал историю — отметка снимается.
    expectOk(await b.api.get(msgs(group.id)), historyPage);
    const after = expectOk(await b.api.get("/api/chats"), chatList);
    expect(after.chats.find((ch) => ch.id === group.id)).toMatchObject({ unreadCount: 0, hasUnreadMention: false });
  });

  test("упоминание в личке тоже распознаётся", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const dm = await createDm(a, b);
    const sent = await sendText(a, dm.id, `@${b.username} глянь`);
    expect(sent.mentionedUserIds).toEqual([b.id]);
    const list = expectOk(await b.api.get("/api/chats"), chatList);
    expect(list.chats.find((ch) => ch.id === dm.id)?.hasUnreadMention).toBe(true);
  });
});

describe("каналы", () => {
  test("публикуют только админы; подписчики получают message:new; views — 0", async () => {
    const { baseUrl } = server();
    const [owner, sub, outsider] = await registerUsers(baseUrl, 3);
    const channel = await createChannel(owner, [sub]);
    const [subWs, outWs] = await Promise.all([ws(sub), ws(outsider)]);

    expectError(await sub.api.post(msgs(channel.id), { text: "можно?" }), 403, "Публиковать в канале могут только администраторы");
    expectError(await outsider.api.post(msgs(channel.id), { text: "можно?" }), 404, "not found");

    const post = expectShape(message, await sendText(owner, channel.id, "первый пост"));
    expect(post).toMatchObject({ senderId: owner.id, views: 0 });
    await subWs.waitFor("message:new", aboutMessage(post.id));
    await outWs.expectNone("message:new", aboutMessage(post.id));
  });

  test("просмотры поста: POST /api/posts/:id/view считает подписчика один раз, автора — нет", async () => {
    const { baseUrl } = server();
    const [owner, sub] = await registerUsers(baseUrl, 2);
    const channel = await createChannel(owner, [sub]);
    const post = await sendText(owner, channel.id, "пост");
    const view = z.strictObject({ views: z.number(), counted: z.boolean() });

    expect(expectOk(await owner.api.post(`/api/posts/${post.id}/view`), view)).toEqual({ views: 0, counted: false });
    expect(expectOk(await sub.api.post(`/api/posts/${post.id}/view`), view)).toEqual({ views: 1, counted: true });
    expect(expectOk(await sub.api.post(`/api/posts/${post.id}/view`), view)).toEqual({ views: 1, counted: false });

    const history = expectOk(await sub.api.get(msgs(channel.id)), historyPage);
    expect(history.messages.find((m) => m.id === post.id)?.views).toBe(1);
  });
});

describe("ответ отправки — тот же message, что в истории", () => {
  test("POST и GET отдают одинаковое сообщение", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const dm = await createDm(a, b);
    const sent = expectOk(await a.api.post(msgs(dm.id), { text: "сверка" }), messageEnvelope).message;
    const history = expectOk(await a.api.get(msgs(dm.id)), historyPage);
    expect(history.messages[0]).toEqual(sent);
  });
});
