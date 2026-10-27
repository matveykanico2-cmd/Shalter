// Звонки: ICE-серверы, начало звонка (личка, группа, «позвонить всем»), ответ,
// завершение/отклонение (PATCH) и история звонков. server/routes/calls.js.
import { describe, expect, test } from "vitest";
import { z } from "zod";
import { Api } from "../../support/client";
import { expectError, expectOk, expectShape } from "../../support/expect";
import { createChannel, createDm, createGroup, login, registerUser, registerUsers } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { callBody, callListItem, iceServer } from "../../schemas/calls";
import { message } from "../../schemas/message";
import { okBody } from "../../schemas/common";
import { callAnswered, callIncoming, callUpdated, callParticipantsUpdated } from "../../schemas/ws";
import { addContact, block, setPrivacy, socketPool } from "../ws/helpers";
import { patchCall, sameIds, startCall } from "./helpers";

const server = useServer();
const open = socketPool();

describe("без сессии", () => {
  // Все 15 маршрутов /api/calls закрыты requireUserId (router.use).
  const routes: Array<[string, string]> = [
    ["GET", "/api/calls/ice-servers"],
    ["GET", "/api/calls"],
    ["POST", "/api/calls"],
    ["PATCH", "/api/calls/cl_x"],
    ["POST", "/api/calls/cl_x/answer"],
    ["POST", "/api/calls/cl_x/participants"],
    ["POST", "/api/calls/cl_x/leave"],
    ["DELETE", "/api/calls/cl_x/participants/u_x"],
    ["GET", "/api/calls/room/c_x"],
    ["POST", "/api/calls/room/c_x/join"],
    ["POST", "/api/calls/room/c_x/leave"],
    ["POST", "/api/calls/cl_x/invite-link"],
    ["POST", "/api/calls/join/token"],
    ["GET", "/api/calls/cl_x/signal"],
    ["POST", "/api/calls/cl_x/signal"],
  ];
  test.each(routes)("%s %s → 401 unauthorized", async (method, path) => {
    const api = new Api(server().baseUrl);
    expectError(await api.request(method, path, method === "GET" ? {} : { json: {} }), 401, "unauthorized");
  });
});

describe("GET /api/calls/ice-servers", () => {
  test("без настроенного TURN — только публичный STUN", async () => {
    const a = await registerUser(server().baseUrl);
    const body = expectOk(await a.api.get("/api/calls/ice-servers"), z.strictObject({ iceServers: z.array(iceServer) }));
    expect(body.iceServers).toEqual([{ urls: "stun:stun.l.google.com:19302" }]);
  });
});

describe("POST /api/calls — звонок в личке", () => {
  test("собеседнику приходит call:incoming с профилем звонящего, посторонним — нет", async () => {
    const { baseUrl } = server();
    const [a, b, outsider] = await registerUsers(baseUrl, 3);
    const aWs = await open(a.api);
    const bWs = await open(b.api);
    const bPhone = await open(await login(baseUrl, b));
    const outsiderWs = await open(outsider.api);
    const dm = await createDm(a, b);

    const before = Date.now();
    const call = await startCall(a, dm.id, { kind: "video" });
    expect(call).toMatchObject({
      chatId: dm.id,
      kind: "video",
      direction: "outgoing",
      callerId: a.id,
      status: "ongoing",
      durationSec: 0,
    });
    expect(call).not.toHaveProperty("joinToken");
    sameIds(call.participantIds, [a.id, b.id]);
    expect(Date.parse(call.startedAt)).toBeGreaterThanOrEqual(before - 1000);

    for (const ws of [bWs, bPhone]) {
      const e = expectShape(callIncoming, await ws.waitFor("call:incoming", (e) => e.call?.id === call.id), "call:incoming");
      expect(e.call).toMatchObject({ ...call, otherUser: { id: a.id, name: a.name } });
    }
    await aWs.expectNone("call:incoming", (e) => e.call?.id === call.id, 200);
    await outsiderWs.expectNone("call:incoming", (e) => e.call?.id === call.id, 100);
  });

  test("ошибки: чужой/несуществующий чат — 404, канал — 400, бот — 400", async () => {
    const { baseUrl } = server();
    const [a, b, outsider] = await registerUsers(baseUrl, 3);
    const dm = await createDm(a, b);
    expectError(await outsider.api.post("/api/calls", { chatId: dm.id, kind: "voice" }), 404, "not found");
    expectError(await a.api.post("/api/calls", { chatId: "c_nonexistent00", kind: "voice" }), 404, "not found");
    expectError(await a.api.post("/api/calls", { kind: "voice" }), 404, "not found");

    const channel = await createChannel(a, [b]);
    expectError(await a.api.post("/api/calls", { chatId: channel.id, kind: "voice" }), 400, "В канал позвонить нельзя");

    const bot = await a.api.post("/api/bots", { name: "Звонилка" });
    expect(bot.status, bot.text).toBe(200);
    const botChat = await a.api.post("/api/chats", { userId: bot.body.bot.user.id });
    expect(botChat.status, botChat.text).toBe(200);
    expectError(await a.api.post("/api/calls", { chatId: botChat.body.chat.id, kind: "voice" }), 400, "Боту позвонить нельзя");
  });

  test("вид звонка — только audio/voice/video, иначе 400", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const dm = await createDm(a, b);
    // "voice-room" сюда тоже нельзя: голосовой чат создаётся только через /room/:chatId/join.
    for (const body of [{ chatId: dm.id }, { chatId: dm.id, kind: "что-угодно" }, { chatId: dm.id, kind: "voice-room" }, { chatId: dm.id, kind: 5 }]) {
      expectError(await a.api.post("/api/calls", body), 400, "Некорректный вид звонка");
    }
    expect((await startCall(a, dm.id, { kind: "video" })).kind).toBe("video");
    // Так звонит интерфейс («Позвонить» в шапке лички).
    expect((await startCall(a, dm.id, { kind: "audio" })).kind).toBe("audio");
  });

  test("приватность calls: nobody — 403, contacts — только своим контактам, исключение allow", async () => {
    const { baseUrl } = server();
    const [a, b, c] = await registerUsers(baseUrl, 3);
    const dmAB = await createDm(a, b);
    const dmCB = await createDm(c, b);
    const bWs = await open(b.api);

    await setPrivacy(b, { calls: "nobody" });
    expectError(await a.api.post("/api/calls", { chatId: dmAB.id, kind: "voice" }), 403, "Пользователь ограничил звонки");
    await bWs.expectNone("call:incoming", () => true, 200);

    await setPrivacy(b, { calls: "contacts" });
    await addContact(b, a);
    await startCall(a, dmAB.id);
    expectError(await c.api.post("/api/calls", { chatId: dmCB.id, kind: "voice" }), 403, "Пользователь ограничил звонки");

    await setPrivacy(b, { calls: "nobody", exceptions: { calls: { allow: [c.id], deny: [] } } });
    await startCall(c, dmCB.id);
    expectError(await a.api.post("/api/calls", { chatId: dmAB.id, kind: "voice" }), 403, "Пользователь ограничил звонки");
  });

  test("заблокировавший не принимает звонки — 403", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const dm = await createDm(a, b);
    await block(b, a);
    expectError(await a.api.post("/api/calls", { chatId: dm.id, kind: "voice" }), 403, "Пользователь ограничил звонки");
    // Сам заблокировавший позвонить может: проверяется только список вызываемого.
    await startCall(b, dm.id);
  });

  test("платные звонки от незнакомых: не хватает звёзд — 402, свой контакт — бесплатно", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const dm = await createDm(a, b);
    expect((await b.api.post("/api/stars/price", { stars: 10 })).status).toBe(200);

    const res = await a.api.post("/api/calls", { chatId: dm.id, kind: "voice" });
    expect(res.status).toBe(402);
    expect(res.body).toEqual({
      error: "Этот пользователь берёт 10 ⭐ за звонок от незнакомых. Не хватает звёзд. С Premium звонить можно бесплатно",
      needStars: 10,
      balance: 0,
      premiumHelps: true,
    });

    // Цена не берётся, если звонящий у вызываемого в контактах.
    await addContact(b, a);
    await startCall(a, dm.id);
  });
});

describe("POST /api/calls — звонок в группе", () => {
  test("без ringAll — участник только звонящий, никому не звонит", async () => {
    const { baseUrl } = server();
    const [a, b, c] = await registerUsers(baseUrl, 3);
    const group = await createGroup(a, [b, c]);
    const bWs = await open(b.api);
    const call = await startCall(a, group.id);
    expect(call.participantIds).toEqual([a.id]);
    await bWs.expectNone("call:incoming", (e) => e.call?.id === call.id, 300);
  });

  test("ringAll — звонит всем, кому можно; запретившие звонки и заблокировавшие пропускаются", async () => {
    const { baseUrl } = server();
    const [a, b, c, d] = await registerUsers(baseUrl, 4);
    const group = await createGroup(a, [b, c, d]);
    await setPrivacy(c, { calls: "nobody" });
    await block(d, a);
    const [bWs, cWs, dWs] = await Promise.all([open(b.api), open(c.api), open(d.api)]);

    const call = await startCall(a, group.id, { ringAll: true });
    expect(call.participantIds).toEqual([a.id, b.id]);
    const e = expectShape(callIncoming, await bWs.waitFor("call:incoming", (e) => e.call?.id === call.id), "call:incoming");
    expect(e.call.otherUser?.id).toBe(a.id);
    await cWs.expectNone("call:incoming", (e) => e.call?.id === call.id, 250);
    await dWs.expectNone("call:incoming", (e) => e.call?.id === call.id, 50);
  });

  test("ringAll в группе больше 12 участников — 400", async () => {
    const { baseUrl } = server();
    const [a, ...rest] = await registerUsers(baseUrl, 13);
    const group = await createGroup(a, rest);
    expect(group.memberIds).toHaveLength(13);
    expectError(
      await a.api.post("/api/calls", { chatId: group.id, kind: "voice", ringAll: true }),
      400,
      "В группе больше 12 участников — позвонить всем сразу нельзя. Начните голосовой чат"
    );
    // Без ringAll в той же группе — можно.
    await startCall(a, group.id);
  });
});

describe("POST /api/calls/:id/answer", () => {
  test("call:answered приходит только на устройства ответившего (чтобы перестали звонить)", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const aWs = await open(a.api);
    const bWs = await open(b.api);
    const bPhone = await open(await login(baseUrl, b));
    const dm = await createDm(a, b);
    const call = await startCall(a, dm.id);

    expectOk(await b.api.post(`/api/calls/${call.id}/answer`), okBody);
    for (const ws of [bWs, bPhone]) {
      const e = expectShape(callAnswered, await ws.waitFor("call:answered", (e) => e.callId === call.id), "call:answered");
      expect(e).toEqual({ type: "call:answered", callId: call.id });
    }
    await aWs.expectNone("call:answered", () => true, 300);
  });

  test("посторонний или несуществующий звонок — 404 без событий", async () => {
    const { baseUrl } = server();
    const [a, b, outsider] = await registerUsers(baseUrl, 3);
    const outsiderWs = await open(outsider.api);
    const call = await startCall(a, (await createDm(a, b)).id);
    expectError(await outsider.api.post(`/api/calls/${call.id}/answer`), 404, "not found");
    expectError(await outsider.api.post(`/api/calls/cl_nonexistent00/answer`), 404, "not found");
    await outsiderWs.expectNone("call:answered", () => true, 300);
  });
});

describe("PATCH /api/calls/:id", () => {
  async function dmCall(kind = "voice") {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const dm = await createDm(a, b);
    const aWs = await open(a.api);
    const bWs = await open(b.api);
    const call = await startCall(a, dm.id, { kind });
    return { a, b, dm, aWs, bWs, call };
  }

  test("отклонение собеседником: call:updated обоим и сообщение «Звонок отклонён» от звонящего", async () => {
    const { a, b, dm, aWs, bWs, call } = await dmCall();
    const updated = await patchCall(b, call.id, { status: "declined" });
    expect(updated).toMatchObject({ id: call.id, status: "declined", durationSec: 0 });

    for (const ws of [aWs, bWs]) {
      const e = expectShape(callUpdated, await ws.waitFor("call:updated", (e) => e.call?.id === call.id), "call:updated");
      expect(e.call).toEqual(updated);
      const m = await ws.waitFor("message:new", (e) => e.chatId === dm.id);
      expectShape(message, m.message, "сообщение о звонке");
      expect(m.message).toMatchObject({ chatId: dm.id, senderId: a.id, type: "call", text: "📞 Звонок отклонён", readByIds: [a.id] });
    }
    const card = await b.api.get(`/api/chats/${dm.id}`);
    expect(card.body.chat.lastMessage).toMatchObject({ type: "call", text: "📞 Звонок отклонён" });
  });

  test("завершённый разговор: длительность округляется вниз, сообщение «Звонок · м:сс»", async () => {
    const { a, aWs, call } = await dmCall();
    const updated = await patchCall(a, call.id, { status: "completed", durationSec: 65.9 });
    expect(updated).toMatchObject({ status: "completed", durationSec: 65 });
    const m = await aWs.waitFor("message:new", (e) => e.message?.type === "call");
    expect(m.message.text).toBe("📞 Звонок · 1:05");
  });

  test("тексты для видеозвонка и пропущенного; ended без длительности — «пропущенный»", async () => {
    let { a, aWs, call } = await dmCall("video");
    await patchCall(a, call.id, { status: "completed", durationSec: 5 });
    expect((await aWs.waitFor("message:new", (e) => e.message?.type === "call")).message.text).toBe("📞 Видеозвонок · 0:05");

    ({ a, aWs, call } = await dmCall("video"));
    await patchCall(a, call.id, { status: "declined" });
    expect((await aWs.waitFor("message:new", (e) => e.message?.type === "call")).message.text).toBe("📞 Видеозвонок отклонён");

    ({ a, aWs, call } = await dmCall("video"));
    await patchCall(a, call.id, { status: "missed" });
    expect((await aWs.waitFor("message:new", (e) => e.message?.type === "call")).message.text).toBe("📞 Пропущенный видеозвонок");

    ({ a, aWs, call } = await dmCall());
    await patchCall(a, call.id, { status: "missed" });
    expect((await aWs.waitFor("message:new", (e) => e.message?.type === "call")).message.text).toBe("📞 Пропущенный звонок");

    // Звонящий сбросил до ответа (status "ended") или completed с durationSec 0 — запись
    // «Пропущенный звонок»; звонящему клиент показывает её как «Отменённый» (callLogInfo).
    ({ a, aWs, call } = await dmCall());
    await patchCall(a, call.id, { status: "ended" });
    expect((await aWs.waitFor("message:new", (e) => e.message?.type === "call")).message.text).toBe("📞 Пропущенный звонок");

    ({ a, aWs, call } = await dmCall());
    await patchCall(a, call.id, { status: "completed", durationSec: 0 });
    expect((await aWs.waitFor("message:new", (e) => e.message?.type === "call")).message.text).toBe("📞 Пропущенный звонок");
  });

  test("повторное завершение уже завершённого: call:updated есть, второго сообщения нет; вернуть в ongoing нельзя", async () => {
    const { a, aWs, call } = await dmCall();
    await patchCall(a, call.id, { status: "ended" });
    await aWs.waitFor("message:new", (e) => e.message?.type === "call");
    aWs.clear();

    await patchCall(a, call.id, { status: "missed" });
    await aWs.waitFor("call:updated", (e) => e.call?.status === "missed");
    await aWs.expectNone("message:new", () => true, 300);

    // Завершённый звонок не «оживить».
    aWs.clear();
    expectError(await a.api.patch(`/api/calls/${call.id}`, { status: "ongoing" }), 400, "Звонок уже завершён");
    await aWs.expectNone("call:updated", () => true, 300);
  });

  test("неизвестный статус и пустое тело — звонок как есть, без событий; отрицательная длительность → 0", async () => {
    const { a, aWs, call } = await dmCall();
    aWs.clear();
    expect(await patchCall(a, call.id, { status: "bogus" })).toEqual(call);
    expect(await patchCall(a, call.id, {})).toEqual(call);
    await aWs.expectNone("call:updated", () => true, 300);
    // Длительность только числом: строка не приводится.
    expect(await patchCall(a, call.id, { durationSec: "30" })).toEqual(call);
    expect(await patchCall(a, call.id, { durationSec: -5 })).toMatchObject({ status: "ongoing", durationSec: 0 });
    // Только длительность — call:updated есть, сообщения в ленте нет.
    await aWs.waitFor("call:updated", (e) => e.call?.id === call.id);
    await aWs.expectNone("message:new", () => true, 200);
  });

  test("посторонний и несуществующий звонок — 404", async () => {
    const { call } = await dmCall();
    const outsider = await registerUser(server().baseUrl);
    expectError(await outsider.api.patch(`/api/calls/${call.id}`, { status: "ended" }), 404, "not found");
    expectError(await outsider.api.patch(`/api/calls/cl_nonexistent00`, { status: "ended" }), 404, "not found");
  });

  test("групповой звонок на 3+: не звонящий «завершает» — на деле выходит, звонок продолжается", async () => {
    const { baseUrl } = server();
    const [a, b, c] = await registerUsers(baseUrl, 3);
    const group = await createGroup(a, [b, c]);
    const aWs = await open(a.api);
    const cWs = await open(c.api);
    const call = await startCall(a, group.id, { ringAll: true });
    sameIds(call.participantIds, [a.id, b.id, c.id]);

    const res = expectOk(await b.api.patch(`/api/calls/${call.id}`, { status: "ended" }), callBody);
    expect(res.call.status).toBe("ongoing");
    sameIds(res.call.participantIds, [a.id, c.id]);
    for (const ws of [aWs, cWs]) {
      const e = expectShape(callParticipantsUpdated, await ws.waitFor("call:participants-updated", (e) => e.call?.id === call.id), "participants-updated");
      sameIds(e.call.participantIds, [a.id, c.id]);
    }
    await aWs.expectNone("call:updated", () => true, 200);
  });
});

describe("GET /api/calls — история", () => {
  test("звонки участника с направлением, собеседником и группой; посторонним не видны", async () => {
    const { baseUrl } = server();
    const [a, b, c, outsider] = await registerUsers(baseUrl, 4);
    const dm = await createDm(a, b);
    const group = await createGroup(b, [a, c], { title: "Созвон" });
    const dmCall = await startCall(a, dm.id);
    await new Promise((r) => setTimeout(r, 5));
    const groupCall = await startCall(b, group.id, { ringAll: true, kind: "video" });

    const list = expectOk(await a.api.get("/api/calls"), z.strictObject({ calls: z.array(callListItem) }));
    // Новые сверху.
    expect(list.calls.map((c) => c.id)).toEqual([groupCall.id, dmCall.id]);
    expect(list.calls[1]).toMatchObject({ direction: "outgoing", otherUser: { id: b.id }, group: null, chatId: dm.id });
    expect(list.calls[0]).toMatchObject({ direction: "incoming", group: { title: "Созвон" }, kind: "video" });
    // В групповом звонке «собеседник» — первый участник, кроме меня.
    expect(list.calls[0].otherUser?.id).toBe(groupCall.participantIds.find((id) => id !== a.id));

    const bList = expectOk(await b.api.get("/api/calls"), z.strictObject({ calls: z.array(callListItem) }));
    expect(bList.calls.find((c) => c.id === dmCall.id)).toMatchObject({ direction: "incoming", otherUser: { id: a.id } });

    expect((await outsider.api.get("/api/calls")).body).toEqual({ calls: [] });
  });

  test("собеседник в истории и в call:incoming — с учётом приватности lastSeen", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const dm = await createDm(a, b);
    await setPrivacy(a, { lastSeen: "nobody" });
    const bWs = await open(b.api);
    const call = await startCall(a, dm.id);

    // В профиле lastSeen скрыт — и в звонках тоже (publicUserFor, как в остальном API).
    expect((await b.api.get(`/api/users/${a.id}`)).body.user).not.toHaveProperty("lastSeen");
    const incoming = await bWs.waitFor("call:incoming", (e) => e.call?.id === call.id);
    expect(incoming.call.otherUser).not.toHaveProperty("lastSeen");
    expect(incoming.call.otherUser.online).toBe(false);
    const list = (await b.api.get("/api/calls")).body.calls;
    expect(list[0].otherUser).not.toHaveProperty("lastSeen");
    expect(list[0].otherUser.online).toBe(false);
  });
});
