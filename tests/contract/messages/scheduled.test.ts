// Отложенные сообщения: /api/chats/:id/messages/scheduled. Фоновый обход в тестах
// выключен (SHALTER_TEST_MODE) — проверяем CRUD, список и «Отправить сейчас».
import { describe, expect, test } from "vitest";
import { historyPage, scheduledEnvelope, scheduledList, wsMessageNew } from "../../schemas/messages";
import { okBody } from "../../schemas/common";
import { Api } from "../../support/client";
import { expectError, expectOk, expectShape } from "../../support/expect";
import { createChannel, createDm, createGroup, registerUsers } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { msgs, useSockets } from "./helpers";

const server = useServer();
const ws = useSockets();

const inHour = () => new Date(Date.now() + 3600_000).toISOString();
const sched = (chatId: string, rest = "") => msgs(chatId, `/scheduled${rest}`);

describe("отложенные сообщения", () => {
  test("создание, список только своих, правка, удаление", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const dm = await createDm(a, b);
    expect(expectOk(await a.api.get(sched(dm.id)), scheduledList)).toEqual({ scheduled: [] });

    const later = new Date(Date.now() + 7200_000).toISOString();
    const sooner = inHour();
    const s1 = expectOk(await a.api.post(sched(dm.id), { text: "позже", sendAt: later, repeat: "week" }), scheduledEnvelope).scheduled;
    expect(s1).toEqual({
      id: s1.id,
      chatId: dm.id,
      senderId: a.id,
      text: "позже",
      replyToId: null,
      topicId: null,
      repeat: "week",
      sendAt: later,
      createdAt: expect.any(String),
    });
    const s2 = expectOk(
      await a.api.post(sched(dm.id), { text: "", sendAt: sooner, repeat: "hourly", attachments: [{ kind: "dice", meta: { emoji: "🎲" } }] }),
      scheduledEnvelope,
    ).scheduled;
    // Неизвестный повтор — без повтора; вложения проходят ту же очистку.
    expect(s2.repeat).toBeNull();
    expect(s2.attachments).toEqual([{ kind: "dice", meta: { emoji: "🎲", value: expect.any(Number) } }]);

    // Список — по времени отправки, только свои.
    expect(expectOk(await a.api.get(sched(dm.id)), scheduledList).scheduled.map((s) => s.id)).toEqual([s2.id, s1.id]);
    expect(expectOk(await b.api.get(sched(dm.id)), scheduledList)).toEqual({ scheduled: [] });

    const newAt = new Date(Date.now() + 9000_000).toISOString();
    const edited = expectOk(await a.api.patch(sched(dm.id, `/${s1.id}`), { text: "изменено", sendAt: newAt, repeat: "nope" }), scheduledEnvelope).scheduled;
    expect(edited).toMatchObject({ text: "изменено", sendAt: newAt, repeat: null });
    // Пустой патч ничего не меняет.
    expect(expectOk(await a.api.patch(sched(dm.id, `/${s1.id}`), {}), scheduledEnvelope).scheduled).toEqual(edited);

    expect(expectOk(await a.api.delete(sched(dm.id, `/${s1.id}`)), okBody)).toEqual({ ok: true });
    expectError(await a.api.delete(sched(dm.id, `/${s1.id}`)), 404, "not found");
    expect(expectOk(await a.api.get(sched(dm.id)), scheduledList).scheduled.map((s) => s.id)).toEqual([s2.id]);

    // В истории чата отложенных нет.
    expect(expectOk(await a.api.get(msgs(dm.id)), historyPage).messages).toEqual([]);
  });

  test("ошибки создания", async () => {
    const { baseUrl } = server();
    const [a, b, outsider] = await registerUsers(baseUrl, 3);
    const dm = await createDm(a, b);
    const group = await createGroup(a, [b]);
    const channel = await createChannel(a, [b]);
    const past = new Date(Date.now() - 60_000).toISOString();

    expectError(await a.api.post(sched(dm.id), { text: "  ", sendAt: inHour() }), 400, "empty message");
    for (const sendAt of [undefined, past, "завтра", 12345]) {
      expectError(await a.api.post(sched(dm.id), { text: "x", sendAt }), 400, "Время отправки должно быть в будущем");
    }
    expectError(await a.api.post(sched(group.id), { text: "x", whenOnline: true }), 400, "«Когда будет в сети» — только в личных чатах");
    expectError(await a.api.post(sched(dm.id), { text: "я".repeat(4097), sendAt: inHour() }), 400, "Сообщение длиннее 4096 символов");
    // Те же права, что у обычной отправки.
    expectError(await b.api.post(sched(channel.id), { text: "x", sendAt: inHour() }), 403, "Публиковать в канале могут только администраторы");
    expectError(await outsider.api.post(sched(dm.id), { text: "x", sendAt: inHour() }), 404, "not found");
    expectError(await outsider.api.get(sched(dm.id)), 404, "not found");
    expectError(await new Api(baseUrl).get(sched(dm.id)), 401, "unauthorized");
    expectError(await new Api(baseUrl).post(sched(dm.id), { text: "x", sendAt: inHour() }), 401, "unauthorized");
  });

  test("ошибки правки и удаления: чужое, другой чат, неверные поля", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const dm = await createDm(a, b);
    const group = await createGroup(a, [b]);
    const s = expectOk(await a.api.post(sched(dm.id), { text: "x", sendAt: inHour() }), scheduledEnvelope).scheduled;

    expectError(await b.api.patch(sched(dm.id, `/${s.id}`), { text: "чужое" }), 404, "not found");
    expectError(await b.api.delete(sched(dm.id, `/${s.id}`)), 404, "not found");
    expectError(await a.api.patch(sched(group.id, `/${s.id}`), { text: "y" }), 404, "not found");
    expectError(await a.api.patch(sched(dm.id, "/sch_doesnotexist0"), { text: "y" }), 404, "not found");
    expectError(await a.api.patch(sched(dm.id, `/${s.id}`), { sendAt: "2001-01-01T00:00:00.000Z" }), 400, "Время отправки должно быть в будущем");
    expectError(await a.api.patch(sched(dm.id, `/${s.id}`), { text: 5 }), 400, "Некорректный текст");
    // ПОВЕДЕНИЕ-ВОПРОС: при правке пустой текст и длина не проверяются (в отличие от создания).
    expect(expectOk(await a.api.patch(sched(dm.id, `/${s.id}`), { text: "" }), scheduledEnvelope).scheduled.text).toBe("");
    expectError(await new Api(baseUrl).patch(sched(dm.id, `/${s.id}`), { text: "y" }), 401, "unauthorized");
  });

  test("«Отправить сейчас»: сообщение уходит, message:new собеседнику, запись удаляется", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const dm = await createDm(a, b);
    const bWs = await ws(b);
    const s = expectOk(await a.api.post(sched(dm.id), { text: "по расписанию", sendAt: inHour(), repeat: "day" }), scheduledEnvelope).scheduled;

    expect(expectOk(await a.api.patch(sched(dm.id, `/${s.id}`), { sendNow: true }), okBody)).toEqual({ ok: true });
    const ev = await bWs.waitFor("message:new", (e) => e.message?.text === "по расписанию");
    expectShape(wsMessageNew, ev);
    expect(ev.message).toMatchObject({ chatId: dm.id, senderId: a.id });

    const history = expectOk(await b.api.get(msgs(dm.id)), historyPage);
    expect(history.messages.map((m) => m.text)).toEqual(["по расписанию"]);
    // С повтором запись переносится на следующий срок, а не удаляется.
    const left = expectOk(await a.api.get(sched(dm.id)), scheduledList).scheduled;
    expect(left.map((x) => x.id)).toEqual([s.id]);
    expect(left[0].sendAt > new Date().toISOString()).toBe(true);

    const once = expectOk(await a.api.post(sched(dm.id), { text: "один раз", sendAt: inHour() }), scheduledEnvelope).scheduled;
    expectOk(await a.api.patch(sched(dm.id, `/${once.id}`), { sendNow: true }), okBody);
    expect(expectOk(await a.api.get(sched(dm.id)), scheduledList).scheduled.map((x) => x.id)).toEqual([s.id]);
  });

  test("«Когда будет в сети» в личке: собеседник в сети — уходит сразу", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const dm = await createDm(a, b);
    const bWs = await ws(b);
    // Регистрация ставит online: true, так что собеседник «в сети» сразу.
    const s = expectOk(await a.api.post(sched(dm.id), { text: "когда появишься", whenOnline: true, repeat: "day" }), scheduledEnvelope).scheduled;
    expect(s).toMatchObject({ sendAt: "9999-12-31T00:00:00.000Z", repeat: null });
    // Отправка запускается после ответа — ждём событие.
    await bWs.waitFor("message:new", (e) => e.message?.text === "когда появишься");
    expect(expectOk(await a.api.get(sched(dm.id)), scheduledList).scheduled).toEqual([]);
  });
});
