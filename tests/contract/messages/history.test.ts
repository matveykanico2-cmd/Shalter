// Чтение: история с постраничной загрузкой, отметки прочтения, поиск, календарь
// (days/at), читатели, ветки и ИИ-сводка.
import { describe, expect, test } from "vitest";
import { z } from "zod";
import {
  atResult,
  daysResult,
  historyPage,
  messageList,
  readersResult,
  threadResult,
  wsMessageRead,
  wsMessageUpdated,
  wsThreadMessage,
} from "../../schemas/messages";
import { Api } from "../../support/client";
import { expectError, expectOk, expectShape } from "../../support/expect";
import { createDm, createGroup, registerUsers, sendText } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { aboutMessage, msgs, useSockets } from "./helpers";

// ИИ-сводка: support/server.ts выключает внешний ИИ (HUGO_AI=off) — фиксируем ответ «ИИ недоступен».
const server = useServer();
const ws = useSockets();
const expectAny = z.unknown();

describe("GET /api/chats/:id/messages — история", () => {
  test("страницы по limit/before/beforeId складываются в полную историю", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const dm = await createDm(a, b);
    const sent: Array<{ id: string; createdAt: string }> = [];
    for (let i = 1; i <= 7; i++) sent.push(await sendText(i % 2 ? a : b, dm.id, `сообщение ${i}`));

    const full = expectOk(await a.api.get(msgs(dm.id)), historyPage);
    expect(full.hasMore).toBe(false);
    // Порядок — от старых к новым.
    expect(full.messages.map((m) => m.id)).toEqual(sent.map((m) => m.id));

    const pages: string[][] = [];
    let cursor: { before?: string; beforeId?: string } = {};
    for (;;) {
      const page = expectOk(await a.api.get(msgs(dm.id), { query: { limit: 3, ...cursor } }), historyPage);
      pages.unshift(page.messages.map((m) => m.id));
      if (!page.hasMore) break;
      cursor = { before: page.messages[0].createdAt, beforeId: page.messages[0].id };
    }
    expect(pages.map((p) => p.length)).toEqual([1, 3, 3]);
    expect(pages.flat()).toEqual(sent.map((m) => m.id));

    // before без beforeId — строго раньше указанного времени.
    const older = expectOk(await a.api.get(msgs(dm.id), { query: { before: sent[3].createdAt } }), historyPage);
    expect(older.messages.every((m) => m.createdAt < sent[3].createdAt)).toBe(true);
  });

  test("limit ограничен 1…200, мусор — значение по умолчанию 60", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const dm = await createDm(a, b);
    for (let i = 0; i < 3; i++) await sendText(a, dm.id, `m${i}`);
    const zero = expectOk(await a.api.get(msgs(dm.id), { query: { limit: 0 } }), historyPage);
    // limit=0 → Number(0) || 60 → 60.
    expect(zero.messages).toHaveLength(3);
    const neg = expectOk(await a.api.get(msgs(dm.id), { query: { limit: -5 } }), historyPage);
    expect(neg.messages).toHaveLength(1);
    expect(neg.hasMore).toBe(true);
    const junk = expectOk(await a.api.get(msgs(dm.id), { query: { limit: "abc" } }), historyPage);
    expect(junk.messages).toHaveLength(3);
  });

  test("firstUnreadId, отметка прочтения и WS message:read автору", async () => {
    const { baseUrl } = server();
    const [a, b, outsider] = await registerUsers(baseUrl, 3);
    const dm = await createDm(a, b);
    const [aWs, outWs] = await Promise.all([ws(a), ws(outsider)]);
    const m1 = await sendText(a, dm.id, "раз");
    const m2 = await sendText(a, dm.id, "два");

    // Автор: своё непрочитанным не считается.
    expect(expectOk(await a.api.get(msgs(dm.id)), historyPage).firstUnreadId).toBeNull();

    const first = expectOk(await b.api.get(msgs(dm.id)), historyPage);
    expect(first.firstUnreadId).toBe(m1.id);
    // В ответе — состояние до отметки.
    expect(first.messages.map((m) => m.readByIds)).toEqual([[a.id], [a.id]]);

    const read = await aWs.waitFor("message:read", (e) => e.chatId === dm.id);
    expectShape(wsMessageRead, read, "WS message:read");
    expect(read).toMatchObject({ readerId: b.id, messageIds: [m1.id, m2.id] });
    expect(read.readAt).toEqual(expect.any(String));
    await outWs.expectNone("message:read", undefined, 50);

    const second = expectOk(await b.api.get(msgs(dm.id)), historyPage);
    expect(second.firstUnreadId).toBeNull();
    expect(second.messages.map((m) => [...m.readByIds].sort())).toEqual([[a.id, b.id].sort(), [a.id, b.id].sort()]);
    const mine = expectOk(await a.api.get(msgs(dm.id)), historyPage);
    expect(mine.messages[0].readAt).toEqual(expect.any(String));
  });

  test("replyTargets — цели ответов, которых нет на странице", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const dm = await createDm(a, b);
    const root = await sendText(a, dm.id, "старое");
    const doomed = await sendText(a, dm.id, "будет удалено");
    await sendText(b, dm.id, "ответ на старое", { replyToId: root.id });
    await sendText(b, dm.id, "ответ на удалённое", { replyToId: doomed.id });
    expectOk(await a.api.delete(msgs(dm.id, `/${doomed.id}`), { forEveryone: true }), expectAny);

    const page = expectOk(await b.api.get(msgs(dm.id), { query: { limit: 2 } }), historyPage);
    expect(page.replyTargets).toEqual({
      [root.id]: { id: root.id, senderId: a.id, anonymous: false, type: "text", text: "старое", attachments: [] },
      [doomed.id]: { id: doomed.id, deleted: true },
    });
    // Цель на странице — в replyTargets не попадает.
    const full = expectOk(await b.api.get(msgs(dm.id)), historyPage);
    expect(Object.keys(full.replyTargets)).toEqual([doomed.id]);
  });
});

describe("GET /search", () => {
  test("ищет по словам и префиксу последнего слова, только в этом чате и не удалённое", async () => {
    const { baseUrl } = server();
    const [a, b, outsider] = await registerUsers(baseUrl, 3);
    const dm = await createDm(a, b);
    const other = await createGroup(a, [b]);
    const hit1 = await sendText(a, dm.id, "Купить молоко и хлеб");
    const hit2 = await sendText(b, dm.id, "молоко закончилось");
    await sendText(a, dm.id, "что-то другое");
    await sendText(a, other.id, "молоко в другом чате");
    const hidden = await sendText(a, dm.id, "молоко скрытое");
    expectOk(await b.api.delete(msgs(dm.id, `/${hidden.id}`), { forEveryone: false }), expectAny);

    const found = expectOk(await b.api.get(msgs(dm.id, "/search"), { query: { q: "МОЛОК" } }), messageList);
    // От новых к старым.
    expect(found.messages.map((m) => m.id)).toEqual([hit2.id, hit1.id]);
    // Автор скрытого видит его в поиске.
    const forA = expectOk(await a.api.get(msgs(dm.id, "/search"), { query: { q: "молоко" } }), messageList);
    expect(forA.messages.map((m) => m.id)).toEqual([hidden.id, hit2.id, hit1.id]);

    const twoWords = expectOk(await a.api.get(msgs(dm.id, "/search"), { query: { q: "молоко хл" } }), messageList);
    expect(twoWords.messages.map((m) => m.id)).toEqual([hit1.id]);

    expect(expectOk(await a.api.get(msgs(dm.id, "/search"), { query: { q: "  " } }), messageList)).toEqual({ messages: [] });
    expect(expectOk(await a.api.get(msgs(dm.id, "/search")), messageList)).toEqual({ messages: [] });

    expectError(await outsider.api.get(msgs(dm.id, "/search"), { query: { q: "молоко" } }), 404, "not found");
    expectError(await new Api(baseUrl).get(msgs(dm.id, "/search"), { query: { q: "молоко" } }), 401, "unauthorized");
  });
});

describe("GET /days и /at — переход к дате", () => {
  test("days отдаёт дни месяца с сообщениями, at — первое сообщение с этой даты", async () => {
    const { baseUrl } = server();
    const [a, b, outsider] = await registerUsers(baseUrl, 3);
    const dm = await createDm(a, b);
    const first = await sendText(a, dm.id, "сегодня");
    await sendText(a, dm.id, "ещё сегодня");
    const today = first.createdAt.slice(0, 10);
    const month = today.slice(0, 7);

    expect(expectOk(await a.api.get(msgs(dm.id, "/days"), { query: { month } }), daysResult)).toEqual({ days: [today] });
    expect(expectOk(await a.api.get(msgs(dm.id, "/days"), { query: { month: "2001-01" } }), daysResult)).toEqual({ days: [] });

    const at = expectOk(await a.api.get(msgs(dm.id, "/at"), { query: { day: today } }), atResult);
    expect(at.message).toEqual({ id: first.id, createdAt: first.createdAt });
    // «С этой даты и позже»: раньше всех сообщений — первое сообщение чата.
    expect(expectOk(await a.api.get(msgs(dm.id, "/at"), { query: { day: "2001-01-01" } }), atResult).message?.id).toBe(first.id);
    expect(expectOk(await a.api.get(msgs(dm.id, "/at"), { query: { day: "2999-01-01" } }), atResult)).toEqual({ message: null });

    expectError(await a.api.get(msgs(dm.id, "/days")), 400, "Нужен месяц в виде ГГГГ-ММ");
    expectError(await a.api.get(msgs(dm.id, "/days"), { query: { month: "2024/01" } }), 400, "Нужен месяц в виде ГГГГ-ММ");
    expectError(await a.api.get(msgs(dm.id, "/at")), 400, "Нужна дата в виде ГГГГ-ММ-ДД");
    expectError(await a.api.get(msgs(dm.id, "/at"), { query: { day: "01.01.2024" } }), 400, "Нужна дата в виде ГГГГ-ММ-ДД");
    expectError(await outsider.api.get(msgs(dm.id, "/days"), { query: { month } }), 404, "not found");
    expectError(await outsider.api.get(msgs(dm.id, "/at"), { query: { day: today } }), 404, "not found");
    expectError(await new Api(baseUrl).get(msgs(dm.id, "/days"), { query: { month } }), 401, "unauthorized");
  });

  test("tz сдвигает границы дня (в минутах)", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const dm = await createDm(a, b);
    const sent = await sendText(a, dm.id, "x");
    const shifted = new Date(Date.parse(sent.createdAt) + 24 * 60 * 60_000).toISOString().slice(0, 10);
    const res = expectOk(await a.api.get(msgs(dm.id, "/days"), { query: { month: shifted.slice(0, 7), tz: 24 * 60 } }), daysResult);
    expect(res.days).toEqual([shifted]);
  });
});

describe("GET /:messageId/readers", () => {
  test("только автору: кто прочитал и когда", async () => {
    const { baseUrl } = server();
    const [a, b, c] = await registerUsers(baseUrl, 3);
    const group = await createGroup(a, [b, c]);
    const sent = await sendText(a, group.id, "кто прочтёт?");

    expect(expectOk(await a.api.get(msgs(group.id, `/${sent.id}/readers`)), readersResult)).toEqual({ readers: [] });

    await b.api.get(msgs(group.id));
    const res = expectOk(await a.api.get(msgs(group.id, `/${sent.id}/readers`)), readersResult);
    expect(res.readers.map((r) => r.user.id)).toEqual([b.id]);
    expect(res.readers[0].readAt).toEqual(expect.any(String));

    // Не автор — 404, как будто сообщения нет.
    expectError(await b.api.get(msgs(group.id, `/${sent.id}/readers`)), 404, "not found");
    expectError(await a.api.get(msgs(group.id, "/m_doesnotexist0/readers")), 404, "not found");
    const outsider = (await registerUsers(baseUrl, 1))[0];
    expectError(await outsider.api.get(msgs(group.id, `/${sent.id}/readers`)), 404, "not found");
  });
});

describe("ветки (threadRootId)", () => {
  test("ответ в ветку: thread:message всем, commentCount корня, GET /thread", async () => {
    const { baseUrl } = server();
    const [a, b, outsider] = await registerUsers(baseUrl, 3);
    const group = await createGroup(a, [b]);
    const [aWs, bWs, outWs] = await Promise.all([ws(a), ws(b), ws(outsider)]);
    const root = await sendText(a, group.id, "обсудим?");
    const reply = await sendText(b, group.id, "да", { threadRootId: root.id });
    expect(reply.threadRootId).toBe(root.id);

    // В ветку — thread:message всем участникам, включая автора; message:new не шлётся.
    const ev = await aWs.waitFor("thread:message", aboutMessage(reply.id));
    expectShape(wsThreadMessage, ev);
    expect(ev).toMatchObject({ chatId: group.id, rootId: root.id });
    await bWs.waitFor("thread:message", aboutMessage(reply.id));
    const upd = await aWs.waitFor("message:updated", aboutMessage(root.id));
    expectShape(wsMessageUpdated, upd);
    expect(upd.message.commentCount).toBe(1);
    await bWs.expectNone("message:new", aboutMessage(reply.id));
    await outWs.expectNone("thread:message", undefined, 50);

    // В основной истории ответов ветки нет.
    const history = expectOk(await a.api.get(msgs(group.id)), historyPage);
    expect(history.messages.map((m) => m.id)).not.toContain(reply.id);
    expect(history.messages.find((m) => m.id === root.id)?.commentCount).toBe(1);

    const thread = expectOk(await a.api.get(msgs(group.id, `/${root.id}/thread`)), threadResult);
    expect(thread.root.id).toBe(root.id);
    expect(thread.replies.map((m) => m.id)).toEqual([reply.id]);

    // Корень из чужого чата — ветки нет, сообщение уходит в общий поток.
    const other = await createGroup(a, [b]);
    const foreign = await sendText(a, other.id, "x", { threadRootId: root.id });
    expect(foreign).not.toHaveProperty("threadRootId");

    expectError(await a.api.get(msgs(group.id, "/m_doesnotexist0/thread")), 404, "not found");
    expectError(await a.api.get(msgs(other.id, `/${root.id}/thread`)), 404, "not found");
    expectError(await outsider.api.get(msgs(group.id, `/${root.id}/thread`)), 404, "not found");
  });
});

describe("GET /:messageId/summary", () => {
  test("короткое — 400; длинное без настроенного ИИ — 503", async () => {
    const { baseUrl } = server();
    const [a, b, outsider] = await registerUsers(baseUrl, 3);
    const dm = await createDm(a, b);
    const short = await sendText(a, dm.id, "коротко");
    const long = await sendText(a, dm.id, "длинный текст ".repeat(40));

    expectError(await b.api.get(msgs(dm.id, `/${short.id}/summary`)), 400, "Сообщение слишком короткое для сводки");
    // В тестовом окружении ключей ИИ нет.
    expectError(await b.api.get(msgs(dm.id, `/${long.id}/summary`)), 503, "ИИ сейчас недоступен");
    expectError(await b.api.get(msgs(dm.id, "/m_doesnotexist0/summary")), 404, "not found");
    expectError(await outsider.api.get(msgs(dm.id, `/${long.id}/summary`)), 404, "not found");
    expectError(await new Api(baseUrl).get(msgs(dm.id, `/${long.id}/summary`)), 401, "unauthorized");

    // Скрытое у себя — для сводки его нет.
    await b.api.delete(msgs(dm.id, `/${long.id}`), { forEveryone: false });
    expectError(await b.api.get(msgs(dm.id, `/${long.id}/summary`)), 404, "not found");
  });
});
