// Интерактивные вложения: опросы (обычный, с несколькими ответами, викторина),
// чек-листы, живая геопозиция, кубик.
import { describe, expect, test } from "vitest";
import { checklistAttachment, locationAttachment, messageEnvelope, pollAttachment, wsMessageUpdated } from "../../schemas/messages";
import { Api } from "../../support/client";
import { expectError, expectOk, expectShape } from "../../support/expect";
import { createChannel, createDm, createGroup, registerUsers, sendText, type TestUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { aboutMessage, msgs, useSockets } from "./helpers";

const server = useServer();
const ws = useSockets();

const pollOf = (m: any) => expectShape(pollAttachment, m.attachments?.[0], "опрос").meta;
const listOf = (m: any) => expectShape(checklistAttachment, m.attachments?.[0], "чек-лист").meta;

describe("опросы", () => {
  async function poll(author: TestUser, chatId: string, meta: Record<string, unknown>) {
    return sendText(author, chatId, "", { attachments: [{ kind: "poll", meta }] });
  }

  test("создание: очистка вариантов, меньше двух — вложение отбрасывается", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const group = await createGroup(a, [b]);
    const options = Array.from({ length: 10 }, (_, i) => `вариант ${i}`);
    const m = await poll(a, group.id, { options, multiple: "yes", correctIndex: 99, voterIds: [["подделка"]] });
    expect(m.type).toBe("text");
    expect(pollOf(m)).toEqual({
      options: options.slice(0, 8),
      voterIds: Array(8).fill([]),
      votes: Array(8).fill(0),
      correctIndex: null,
      multiple: false,
      closed: false,
    });
    // Один вариант — вложение отбрасывается, а пустой текст проходит: сообщение без вложений.
    // ПОВЕДЕНИЕ-ВОПРОС: создаётся пустое текстовое сообщение вместо 400.
    const broken = await poll(a, group.id, { options: ["один"] });
    expect(broken).not.toHaveProperty("attachments");
    expect(broken.text).toBe("");
  });

  test("голос: один вариант, переголосование, повтор снимает; WS остальным", async () => {
    const { baseUrl } = server();
    const [a, b, outsider] = await registerUsers(baseUrl, 3);
    const group = await createGroup(a, [b]);
    const m = await poll(a, group.id, { options: ["да", "нет"] });
    const [aWs, bWs] = await Promise.all([ws(a), ws(b)]);
    const vote = (u: TestUser, optionIndex: unknown) => u.api.post(msgs(group.id, `/${m.id}/vote`), { optionIndex });

    let meta = pollOf(expectOk(await vote(b, 0), messageEnvelope).message);
    expect(meta).toMatchObject({ voterIds: [[b.id], []], votes: [1, 0] });
    const ev = await aWs.waitFor("message:updated", aboutMessage(m.id));
    expectShape(wsMessageUpdated, ev);
    expect(pollOf(ev.message).votes).toEqual([1, 0]);
    await bWs.expectNone("message:updated", aboutMessage(m.id));

    meta = pollOf(expectOk(await vote(b, 1), messageEnvelope).message);
    expect(meta).toMatchObject({ voterIds: [[], [b.id]], votes: [0, 1] });
    meta = pollOf(expectOk(await vote(b, 1), messageEnvelope).message);
    expect(meta.votes).toEqual([0, 0]);

    // Неверный индекс — без изменений, 200.
    for (const bad of [5, -1, "0", 0.5, undefined]) {
      expect(pollOf(expectOk(await vote(b, bad), messageEnvelope).message).votes).toEqual([0, 0]);
    }

    await vote(a, 0);
    await vote(b, 0);
    const retracted = expectOk(await b.api.delete(msgs(group.id, `/${m.id}/vote`)), messageEnvelope).message;
    expect(pollOf(retracted)).toMatchObject({ voterIds: [[a.id], []], votes: [1, 0] });

    expectError(await vote(outsider, 0), 404, "not found");
    expectError(await outsider.api.delete(msgs(group.id, `/${m.id}/vote`)), 404, "not found");
    expectError(await new Api(baseUrl).post(msgs(group.id, `/${m.id}/vote`), { optionIndex: 0 }), 401, "unauthorized");
  });

  test("несколько ответов: варианты отмечаются независимо", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const group = await createGroup(a, [b]);
    const m = await poll(a, group.id, { options: ["a", "b", "c"], multiple: true });
    expect(pollOf(m).multiple).toBe(true);
    await b.api.post(msgs(group.id, `/${m.id}/vote`), { optionIndex: 0 });
    const meta = pollOf(expectOk(await b.api.post(msgs(group.id, `/${m.id}/vote`), { optionIndex: 2 }), messageEnvelope).message);
    expect(meta.votes).toEqual([1, 0, 1]);
  });

  test("викторина: голос один раз, отозвать нельзя", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const group = await createGroup(a, [b]);
    const m = await poll(a, group.id, { options: ["2", "4", "5"], correctIndex: 1, multiple: true });
    // У викторины multiple всегда false.
    expect(pollOf(m)).toMatchObject({ correctIndex: 1, multiple: false });
    const first = pollOf(expectOk(await b.api.post(msgs(group.id, `/${m.id}/vote`), { optionIndex: 2 }), messageEnvelope).message);
    expect(first.votes).toEqual([0, 0, 1]);
    const again = pollOf(expectOk(await b.api.post(msgs(group.id, `/${m.id}/vote`), { optionIndex: 1 }), messageEnvelope).message);
    expect(again.votes).toEqual([0, 0, 1]);
    const retract = pollOf(expectOk(await b.api.delete(msgs(group.id, `/${m.id}/vote`)), messageEnvelope).message);
    expect(retract.votes).toEqual([0, 0, 1]);
  });

  test("остановка: автор или админ; после — голоса не меняются", async () => {
    const { baseUrl } = server();
    const [owner, member, author] = await registerUsers(baseUrl, 3);
    const group = await createGroup(owner, [member, author]);
    const m = await poll(author, group.id, { options: ["да", "нет"] });
    const text = await sendText(author, group.id, "не опрос");
    const ownerWs = await ws(owner);

    expectError(
      await member.api.post(msgs(group.id, `/${m.id}/poll/close`)),
      403,
      "Остановить опрос может только его автор или администратор",
    );
    expectError(await author.api.post(msgs(group.id, `/${text.id}/poll/close`)), 400, "Это не опрос");

    await member.api.post(msgs(group.id, `/${m.id}/vote`), { optionIndex: 0 });
    const closed = pollOf(expectOk(await author.api.post(msgs(group.id, `/${m.id}/poll/close`)), messageEnvelope).message);
    expect(closed).toMatchObject({ closed: true, votes: [1, 0] });
    const ev = await ownerWs.waitFor("message:updated", (e) => e.message?.id === m.id && pollOf(e.message).closed);
    expectShape(wsMessageUpdated, ev);

    expect(pollOf(expectOk(await member.api.post(msgs(group.id, `/${m.id}/vote`), { optionIndex: 1 }), messageEnvelope).message).votes).toEqual([1, 0]);
    expect(pollOf(expectOk(await member.api.delete(msgs(group.id, `/${m.id}/vote`)), messageEnvelope).message).votes).toEqual([1, 0]);

    // Админ группы может остановить чужой опрос.
    const m2 = await poll(author, group.id, { options: ["x", "y"] });
    expect(pollOf(expectOk(await owner.api.post(msgs(group.id, `/${m2.id}/poll/close`)), messageEnvelope).message).closed).toBe(true);
  });

  test("голос в сообщении без опроса — 200 и сообщение без изменений", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const dm = await createDm(a, b);
    const text = await sendText(a, dm.id, "просто текст");
    const res = expectOk(await b.api.post(msgs(dm.id, `/${text.id}/vote`), { optionIndex: 0 }), messageEnvelope);
    expect(res.message).toEqual(text);
  });

  test("пересылка опроса обнуляет голоса", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const group = await createGroup(a, [b]);
    const dm = await createDm(a, b);
    const m = await poll(a, group.id, { options: ["да", "нет"] });
    await b.api.post(msgs(group.id, `/${m.id}/vote`), { optionIndex: 0 });
    const fwd = await sendText(a, dm.id, "x", { forwardedFrom: { messageId: m.id } });
    expect(pollOf(fwd)).toMatchObject({ voterIds: [[], []], votes: [0, 0] });
  });
});

describe("чек-листы", () => {
  test("отметка, снятие, добавление пунктов; права автора и остальных", async () => {
    const { baseUrl } = server();
    const [a, b, outsider] = await registerUsers(baseUrl, 3);
    const group = await createGroup(a, [b]);
    const m = await sendText(a, group.id, "", {
      attachments: [{ kind: "checklist", meta: { items: ["молоко", { text: "хлеб" }, "  ", { done: true, text: "сыр" }] } }],
    });
    expect(listOf(m)).toEqual({
      items: [
        { id: 1, text: "молоко" },
        { id: 2, text: "хлеб" },
        { id: 3, text: "сыр" },
      ],
      othersCanAdd: false,
      othersCanMark: true,
    });
    const aWs = await ws(a);
    const path = msgs(group.id, `/${m.id}/checklist`);

    let meta = listOf(expectOk(await b.api.post(path, { itemId: 2 }), messageEnvelope).message);
    expect(meta.items[1]).toEqual({ id: 2, text: "хлеб", doneBy: b.id, doneAt: expect.any(String) });
    const ev = await aWs.waitFor("message:updated", aboutMessage(m.id));
    expectShape(wsMessageUpdated, ev);
    // Повтор — снимает отметку (любой участник, кто может отмечать).
    meta = listOf(expectOk(await a.api.post(path, { itemId: 2 }), messageEnvelope).message);
    expect(meta.items[1]).toEqual({ id: 2, text: "хлеб" });

    expectError(await b.api.post(path, { itemId: 99 }), 404, "Пункт не найден");
    expectError(await b.api.post(path, {}), 404, "Пункт не найден");
    expectError(await b.api.post(path, { add: ["яйца"] }), 403, "Добавлять пункты может только автор");
    expectError(await a.api.post(path, { add: ["  ", ""] }), 400, "Введите текст пункта");
    meta = listOf(expectOk(await a.api.post(path, { add: ["яйца", "  масло "] }), messageEnvelope).message);
    expect(meta.items.slice(3)).toEqual([
      { id: 4, text: "яйца" },
      { id: 5, text: "масло" },
    ]);

    const text = await sendText(a, group.id, "не чек-лист");
    expectError(await a.api.post(msgs(group.id, `/${text.id}/checklist`), { itemId: 1 }), 400, "Это не чек-лист");
    expectError(await outsider.api.post(path, { itemId: 1 }), 404, "not found");
    expectError(await new Api(baseUrl).post(path, { itemId: 1 }), 401, "unauthorized");
  });

  test("othersCanMark: false и othersCanAdd: true; лимит 30 пунктов", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const dm = await createDm(a, b);
    const m = await sendText(a, dm.id, "", {
      attachments: [{ kind: "checklist", meta: { items: Array.from({ length: 35 }, (_, i) => `п${i}`), othersCanMark: false, othersCanAdd: true } }],
    });
    expect(listOf(m).items).toHaveLength(30);
    const path = msgs(dm.id, `/${m.id}/checklist`);
    expectError(await b.api.post(path, { itemId: 1 }), 403, "Отмечать пункты может только автор");
    expectError(await b.api.post(path, { add: ["ещё"] }), 400, "Не больше 30 пунктов");
    expectOk(await a.api.post(path, { itemId: 1 }), messageEnvelope);
  });

  test("в канале отмечают только админы", async () => {
    const { baseUrl } = server();
    const [owner, sub] = await registerUsers(baseUrl, 2);
    const channel = await createChannel(owner, [sub]);
    const m = await sendText(owner, channel.id, "", { attachments: [{ kind: "checklist", meta: { items: ["a"] } }] });
    expectError(await sub.api.post(msgs(channel.id, `/${m.id}/checklist`), { itemId: 1 }), 403, "Недостаточно прав");
    expectOk(await owner.api.post(msgs(channel.id, `/${m.id}/checklist`), { itemId: 1 }), messageEnvelope);
  });
});

describe("геопозиция", () => {
  test("живая точка: обновляет только автор; message:updated всем участникам", async () => {
    const { baseUrl } = server();
    const [a, b, outsider] = await registerUsers(baseUrl, 3);
    const dm = await createDm(a, b);
    const m = await sendText(a, dm.id, "", { attachments: [{ kind: "location", meta: { lat: 55.75, lng: 37.61, liveMinutes: 15 } }] });
    const loc = expectShape(locationAttachment, m.attachments?.[0]);
    expect(loc.meta).toEqual({ lat: 55.75, lng: 37.61, live: true, expiresAt: expect.any(String) });
    const [aWs, bWs] = await Promise.all([ws(a), ws(b)]);
    const path = msgs(dm.id, `/${m.id}/location`);

    const moved = expectOk(await a.api.post(path, { lat: 55.8, lng: "37.7" }), messageEnvelope).message;
    expect(moved.attachments?.[0]).toMatchObject({ meta: { lat: 55.8, lng: 37.7, live: true } });
    // Рассылка всем участникам, включая автора.
    for (const sock of [aWs, bWs]) expectShape(wsMessageUpdated, await sock.waitFor("message:updated", aboutMessage(m.id)));

    // Не автор — 200, но точка не меняется.
    const notMine = expectOk(await b.api.post(path, { lat: 1, lng: 1 }), messageEnvelope).message;
    expect(notMine.attachments?.[0]).toMatchObject({ meta: { lat: 55.8, lng: 37.7 } });

    expectError(await a.api.post(path, { lat: "abc", lng: 1 }), 400, "invalid coordinates");
    expectError(await a.api.post(path, {}), 400, "invalid coordinates");
    expectError(await a.api.post(msgs(dm.id, "/m_doesnotexist0/location"), { lat: 1, lng: 1 }), 404, "not found");
    expectError(await outsider.api.post(path, { lat: 1, lng: 1 }), 404, "not found");
    expectError(await new Api(baseUrl).post(path, { lat: 1, lng: 1 }), 401, "unauthorized");
  });

  test("статичная точка: без live/expiresAt и без обновлений; без координат — отбрасывается", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const dm = await createDm(a, b);
    const m = await sendText(a, dm.id, "", { attachments: [{ kind: "location", meta: { lat: 1.5, lng: 2.5, liveMinutes: 9999 } }] });
    expect(expectShape(locationAttachment, m.attachments?.[0]).meta).toEqual({ lat: 1.5, lng: 2.5 });
    const same = expectOk(await a.api.post(msgs(dm.id, `/${m.id}/location`), { lat: 3, lng: 4 }), messageEnvelope).message;
    expect(same.attachments?.[0]).toEqual({ kind: "location", meta: { lat: 1.5, lng: 2.5 } });
  });
});

describe("кубик", () => {
  test("значение выбрасывает сервер, клиентское игнорируется", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const dm = await createDm(a, b);
    const m = await sendText(a, dm.id, "", { attachments: [{ kind: "dice", meta: { emoji: "🎯", value: 100 } }] });
    const dice = m.attachments?.[0] as any;
    expect(dice).toEqual({ kind: "dice", meta: { emoji: "🎯", value: expect.any(Number) } });
    expect(dice.meta.value).toBeGreaterThanOrEqual(1);
    expect(dice.meta.value).toBeLessThanOrEqual(6);
    const unknown = await sendText(a, dm.id, "", { attachments: [{ kind: "dice", meta: { emoji: "🦄" } }] });
    expect((unknown.attachments?.[0] as any).meta.emoji).toBe("🎲");
  });
});
