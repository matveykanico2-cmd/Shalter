// Прямые эфиры /api/live: HTTP/WS-контракт. RTMP-сервер в тестах не поднимается
// (SHALTER_TEST_MODE), а внутренний адрес FLV-потока направлен в закрытый порт 9,
// поэтому /feed.flv проверяется только на отказах.
import { afterAll, describe, expect, test } from "vitest";
import { chatBody } from "../../schemas/chats";
import { okBody } from "../../schemas/common";
import {
  liveChatBody,
  liveCreateBody,
  liveLeaveBody,
  liveMessageBody,
  liveStateBody,
  liveStopBody,
} from "../../schemas/live";
import { Api } from "../../support/client";
import { expectError, expectOk } from "../../support/expect";
import { createChannel, createDm, createGroup, registerUser, uniq, type TestUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { connectWs, type WsClient } from "../../support/ws";

const ADMIN_PHONE = "+70000000913";
const server = useServer({ env: { PREMIUM_ADMIN_PHONE: ADMIN_PHONE, ALLOW_ADMIN_PHONE_SIGNUP: "1", RTMP_HTTP_PORT: "9", RTMP_PORT: "19350" } });

const sockets: WsClient[] = [];
afterAll(async () => {
  await Promise.all(sockets.map((s) => s.close()));
});
async function ws(user: TestUser) {
  const s = await connectWs(user.api);
  sockets.push(s);
  return s;
}

const live = (rest = "") => `/api/live${rest}`;
const start = (u: TestUser, body: Record<string, unknown>) => u.api.post(live(), body);
const join = (u: TestUser, id: string) => u.api.post(live(`/${id}/join`));

async function startStream(host: TestUser, chatId: string, extra: Record<string, unknown> = {}) {
  return expectOk(await start(host, { chatId, ...extra }), liveCreateBody).stream;
}

describe("доступ", () => {
  test("401 без сессии на всех маршрутах", async () => {
    const api = new Api(server().baseUrl);
    const id = "live_1_abc";
    for (const res of await Promise.all([
      api.post(live(), { chatId: "c_x0000000" }),
      api.get(live("/chat/c_x0000000")),
      api.get(live(`/${id}`)),
      api.get(live(`/${id}/feed.flv`)),
      api.post(live(`/${id}/join`)),
      api.post(live(`/${id}/leave`)),
      api.post(live(`/${id}/hand`), {}),
      api.post(live(`/${id}/participants/u_x0000000/role`), {}),
      api.post(live(`/${id}/participants/u_x0000000/mute`), {}),
      api.post(live(`/${id}/stop`)),
      api.post(live(`/${id}/messages`), { text: "x" }),
      api.patch(live(`/${id}/messages/lm_1_abc`), { text: "x" }),
      api.delete(live(`/${id}/messages/lm_1_abc`)),
    ])) expectError(res, 401, "unauthorized");
  });

  test("несуществующий эфир — 404, чужой — 403", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const outsider = await registerUser(baseUrl);
    const group = await createGroup(a, []);
    const stream = await startStream(a, group.id);
    const calls = (u: TestUser, id: string) => [
      u.api.get(live(`/${id}`)),
      u.api.get(live(`/${id}/feed.flv`)),
      u.api.post(live(`/${id}/join`)),
      u.api.post(live(`/${id}/leave`)),
      u.api.post(live(`/${id}/hand`), {}),
      u.api.post(live(`/${id}/participants/${a.id}/role`), {}),
      u.api.post(live(`/${id}/participants/${a.id}/mute`), {}),
      u.api.post(live(`/${id}/stop`)),
      u.api.post(live(`/${id}/messages`), { text: "x" }),
      u.api.patch(live(`/${id}/messages/lm_1_abc`), { text: "x" }),
      u.api.delete(live(`/${id}/messages/lm_1_abc`)),
    ];
    for (const res of await Promise.all(calls(a, "live_1_nonexistent"))) expectError(res, 404, "Эфир не найден");
    for (const res of await Promise.all(calls(outsider, stream.id))) expectError(res, 403, "Нет доступа к этому эфиру");
  });
});

describe("POST /api/live и GET /chat/:chatId", () => {
  test("админ начинает эфир: live:started участникам чата; повтор возвращает тот же", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const outsider = await registerUser(baseUrl);
    const group = await createGroup(a, [b]);
    const [aWs, bWs, outWs] = await Promise.all([ws(a), ws(b), ws(outsider)]);

    expect(expectOk(await b.api.get(live(`/chat/${group.id}`)), liveChatBody)).toEqual({ stream: null, viewers: 0, canHost: false });
    expect(expectOk(await a.api.get(live(`/chat/${group.id}`)), liveChatBody)).toEqual({ stream: null, viewers: 0, canHost: true });

    const res = expectOk(await start(a, { chatId: group.id, title: `  ${"Э".repeat(100)}  ` }), liveCreateBody);
    expect(res.ingest).toBeNull();
    expect(res).not.toHaveProperty("already");
    const stream = res.stream;
    expect(stream).toEqual({
      id: stream.id,
      chatId: group.id,
      hostId: a.id,
      title: "Э".repeat(80),
      withVideo: true,
      source: "webrtc",
      rtmpLive: false,
      status: "live",
      startedAt: stream.startedAt,
      endedAt: null,
    });
    for (const sock of [aWs, bWs]) {
      expect(await sock.waitFor("live:started", (e) => e.chatId === group.id)).toEqual({ type: "live:started", chatId: group.id, stream });
    }
    await outWs.expectNone("live:started");

    // Ведущий WebRTC-эфира сразу в участниках.
    expect(expectOk(await b.api.get(live(`/chat/${group.id}`)), liveChatBody)).toEqual({ stream, viewers: 1, canHost: false, canStop: false });
    expect(expectOk(await a.api.get(live(`/chat/${group.id}`)), liveChatBody)).toEqual({ stream, viewers: 1, canHost: true, canStop: true });

    bWs.clear();
    const again = expectOk(await start(a, { chatId: group.id, title: "другой", source: "rtmp" }), liveCreateBody);
    expect(again).toEqual({ stream, already: true, ingest: null });
    await bWs.expectNone("live:started");
  });

  test("ошибки создания; канал, withVideo:false", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const outsider = await registerUser(baseUrl);
    const group = await createGroup(a, [b]);
    const dm = await createDm(a, b);
    const mod = await registerUser(baseUrl);
    const channel = await createChannel(a, [b, mod]);

    expectError(await start(a, {}), 404, "Чат не найден");
    expectError(await start(a, { chatId: "c_nonexistent00" }), 404, "Чат не найден");
    expectError(await start(outsider, { chatId: group.id }), 404, "Чат не найден");
    expectError(await start(a, { chatId: dm.id }), 400, "Эфир бывает в канале или группе — для двоих есть звонок");
    expectError(await start(b, { chatId: group.id }), 403, "Начать эфир может только администратор");
    expectError(await start(b, { chatId: channel.id }), 403, "Начать эфир может только администратор");

    // Модератор считается персоналом и может вести эфир.
    expectOk(await a.api.post(`/api/chats/${channel.id}/members`, { userId: mod.id, role: "mod" }), chatBody);
    const s = await startStream(mod, channel.id, { withVideo: false });
    expect(s).toMatchObject({ hostId: mod.id, withVideo: false, title: "" });
    expect(expectOk(await a.api.get(live(`/chat/${channel.id}`)), liveChatBody)).toMatchObject({ canHost: true, canStop: true });
  });

  test("RTMP-эфир: ключ для OBS только ведущему, без авто-участия; feed.flv", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const group = await createGroup(a, [b]);
    const res = expectOk(await start(a, { chatId: group.id, source: "rtmp" }), liveCreateBody);
    expect(res.stream.source).toBe("rtmp");
    expect(res.ingest).toEqual({ url: "rtmp://127.0.0.1:19350/live", key: expect.stringMatching(/^[a-f0-9]{32}$/) });
    const key = res.ingest!.key;

    expect(expectOk(await a.api.get(live(`/chat/${group.id}`)), liveChatBody)).toMatchObject({ viewers: 0 });
    const asHost = expectOk(await a.api.get(live(`/${res.stream.id}`)), liveStateBody);
    expect(asHost).toEqual({ stream: res.stream, participants: [], messages: [], ingest: { url: "rtmp://127.0.0.1:19350/live", key } });
    expect(expectOk(await b.api.get(live(`/${res.stream.id}`)), liveStateBody).ingest).toBeNull();
    expect(expectOk(await start(a, { chatId: group.id }), liveCreateBody)).toEqual({ stream: res.stream, already: true, ingest: { url: "rtmp://127.0.0.1:19350/live", key } });

    // Поток не идёт — внутренний FLV недоступен.
    expectError(await b.api.get(live(`/${res.stream.id}/feed.flv`)), 503, "Вещание не идёт");
    const webrtcGroup = await createGroup(a, [b]);
    const webrtc = await startStream(a, webrtcGroup.id);
    expectError(await b.api.get(live(`/${webrtc.id}/feed.flv`)), 404, "Этот эфир идёт не через OBS");

    // Ведущий RTMP-эфира присоединяется с ролью host.
    const joined = expectOk(await join(a, res.stream.id), liveStateBody);
    expect(joined.participants.map((p) => [p.userId, p.role])).toEqual([[a.id, "host"]]);
    expect(joined.ingest).toEqual({ url: "rtmp://127.0.0.1:19350/live", key });
    expect(expectOk(await a.api.post(live(`/${res.stream.id}/stop`)), liveStopBody).stream.status).toBe("ended");
  });
});

describe("участники: join / leave / hand / role / mute", () => {
  test("вход и выход зрителя: live:state участникам эфира", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl, { name: "Зритель" });
    const c = await registerUser(baseUrl);
    const group = await createGroup(a, [b, c]);
    const stream = await startStream(a, group.id);
    const [aWs, bWs, cWs] = await Promise.all([ws(a), ws(b), ws(c)]);

    const state = expectOk(await join(b, stream.id), liveStateBody);
    expect(state.ingest).toBeNull();
    expect(state.participants.map((p) => ({ userId: p.userId, role: p.role, handRaised: p.handRaised, mutedByHost: p.mutedByHost }))).toEqual([
      { userId: a.id, role: "host", handRaised: false, mutedByHost: false },
      { userId: b.id, role: "viewer", handRaised: false, mutedByHost: false },
    ]);
    expect(state.participants[1].user).toMatchObject({ id: b.id, name: "Зритель" });
    expect(await aWs.waitFor("live:state", (e) => e.streamId === stream.id)).toEqual({ type: "live:state", streamId: stream.id });
    await bWs.waitFor("live:state", (e) => e.streamId === stream.id);
    // Участник чата, не вошедший в эфир, состояние не получает.
    await cWs.expectNone("live:state");

    // Повторный вход ничего не дублирует.
    expect(expectOk(await join(b, stream.id), liveStateBody).participants).toHaveLength(2);

    aWs.clear();
    bWs.clear();
    expect(expectOk(await b.api.post(live(`/${stream.id}/leave`)), liveLeaveBody)).toEqual({ ok: true });
    await aWs.waitFor("live:state", (e) => e.streamId === stream.id);
    // Ушедший тоже получает live:state — чтобы закрыть экран.
    await bWs.waitFor("live:state", (e) => e.streamId === stream.id);
    expect(expectOk(await a.api.get(live(`/${stream.id}`)), liveStateBody).participants.map((p) => p.userId)).toEqual([a.id]);
    // Выйти, не будучи в эфире, — тоже ok.
    expect(expectOk(await c.api.post(live(`/${stream.id}/leave`)), liveLeaveBody)).toEqual({ ok: true });
  });

  test("рука, роль и микрофон: управляет только ведущий", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const c = await registerUser(baseUrl);
    const group = await createGroup(a, [b, c], { adminIds: [c.id] });
    const stream = await startStream(a, group.id);
    expectOk(await join(b, stream.id), liveStateBody);
    const bWs = await ws(b);
    const participant = async (id: string) =>
      expectOk(await a.api.get(live(`/${stream.id}`)), liveStateBody).participants.find((p) => p.userId === id)!;

    expectError(await c.api.post(live(`/${stream.id}/hand`), {}), 404, "Вы не в эфире");
    expect(expectOk(await b.api.post(live(`/${stream.id}/hand`), {}), okBody)).toEqual({ ok: true });
    expect((await participant(b.id)).handRaised).toBe(true);
    await bWs.waitFor("live:state", (e) => e.streamId === stream.id);
    expectOk(await b.api.post(live(`/${stream.id}/hand`), { raised: false }), okBody);
    expect((await participant(b.id)).handRaised).toBe(false);
    expectOk(await b.api.post(live(`/${stream.id}/hand`), { raised: "yes" }), okBody);
    expect((await participant(b.id)).handRaised).toBe(true);

    const role = (u: TestUser, target: string, body: unknown) => u.api.post(live(`/${stream.id}/participants/${target}/role`), body);
    const mute = (u: TestUser, target: string, body: unknown) => u.api.post(live(`/${stream.id}/participants/${target}/mute`), body);
    // Админ чата, но не ведущий.
    expectError(await role(c, b.id, { role: "speaker" }), 403, "Управлять эфиром может только ведущий");
    expectError(await mute(c, b.id, {}), 403, "Управлять эфиром может только ведущий");
    expectError(await role(a, c.id, { role: "speaker" }), 404, "Этого человека нет в эфире");
    expectError(await mute(a, c.id, {}), 404, "Этого человека нет в эфире");
    expectError(await role(a, a.id, { role: "viewer" }), 400, "Ведущего нельзя лишить слова");

    bWs.clear();
    expectOk(await role(a, b.id, { role: "speaker" }), okBody);
    // Слово даётся с опущенной рукой и включённым микрофоном.
    expect(await participant(b.id)).toMatchObject({ role: "speaker", handRaised: false, mutedByHost: false });
    await bWs.waitFor("live:state", (e) => e.streamId === stream.id);

    expectOk(await mute(a, b.id, {}), okBody);
    expect((await participant(b.id)).mutedByHost).toBe(true);
    expectOk(await mute(a, b.id, { muted: false }), okBody);
    expect((await participant(b.id)).mutedByHost).toBe(false);
    expectOk(await mute(a, b.id, { muted: true }), okBody);
    // Любая роль, кроме speaker, — viewer; смена роли снимает выключение микрофона.
    expectOk(await role(a, b.id, { role: "host" }), okBody);
    expect(await participant(b.id)).toMatchObject({ role: "viewer", mutedByHost: false });
    // ПОВЕДЕНИЕ-ВОПРОС: ведущий может «выключить микрофон» самому себе (mute не проверяет роль host).
    expectOk(await mute(a, a.id, {}), okBody);
    expect((await participant(a.id)).mutedByHost).toBe(true);
  });
});

describe("завершение эфира", () => {
  test("stop: ведущий или админ; live:ended всем участникам чата; повтор — как есть", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const admin = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const outsider = await registerUser(baseUrl);
    const group = await createGroup(a, [admin, b], { adminIds: [admin.id] });
    const stream = await startStream(a, group.id);
    const [bWs, outWs] = await Promise.all([ws(b), ws(outsider)]);

    expectError(await b.api.post(live(`/${stream.id}/stop`)), 403, "Завершить эфир может ведущий или администратор чата");
    const stopped = expectOk(await admin.api.post(live(`/${stream.id}/stop`)), liveStopBody).stream;
    expect(stopped).toMatchObject({ id: stream.id, status: "ended", endedAt: expect.any(String) });
    // b в эфир не входил, но live:ended получает — как участник чата.
    expect(await bWs.waitFor("live:ended", (e) => e.streamId === stream.id)).toEqual({ type: "live:ended", chatId: group.id, streamId: stream.id });
    await outWs.expectNone("live:ended");

    expect(expectOk(await a.api.post(live(`/${stream.id}/stop`)), liveStopBody).stream).toEqual(stopped);
    expect(expectOk(await b.api.get(live(`/chat/${group.id}`)), liveChatBody)).toEqual({ stream: null, viewers: 0, canHost: false });
    expect(expectOk(await b.api.get(live(`/${stream.id}`)), liveStateBody).stream.status).toBe("ended");
    expectError(await join(b, stream.id), 410, "Эфир уже завершён");
    expectError(await a.api.post(live(`/${stream.id}/messages`), { text: "x" }), 410, "Эфир завершён");

    // После завершения можно начать новый эфир.
    const next = await startStream(a, group.id);
    expect(next.id).not.toBe(stream.id);
  });

  test("выход ведущего завершает эфир", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const group = await createGroup(a, [b]);
    const stream = await startStream(a, group.id);
    expectOk(await join(b, stream.id), liveStateBody);
    const bWs = await ws(b);

    expect(expectOk(await a.api.post(live(`/${stream.id}/leave`)), liveLeaveBody)).toEqual({ ok: true, ended: true });
    await bWs.waitFor("live:ended", (e) => e.streamId === stream.id);
    expect(expectOk(await b.api.get(live(`/${stream.id}`)), liveStateBody).stream.status).toBe("ended");
    // ПОВЕДЕНИЕ-ВОПРОС: зрители остаются в participants завершённого эфира.
    expect(expectOk(await b.api.get(live(`/${stream.id}`)), liveStateBody).participants.map((p) => p.userId)).toEqual([b.id]);
    // Повторный выход ведущего из завершённого эфира — просто ok.
    expect(expectOk(await a.api.post(live(`/${stream.id}/leave`)), liveLeaveBody)).toEqual({ ok: true });
  });
});

describe("чат эфира: /messages", () => {
  test("отправка, правка, удаление: события участникам эфира", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl, { name: "Болтун" });
    const c = await registerUser(baseUrl);
    const group = await createGroup(a, [b, c]);
    const stream = await startStream(a, group.id);
    expectOk(await join(b, stream.id), liveStateBody);
    const [aWs, cWs] = await Promise.all([ws(a), ws(c)]);

    expectError(await b.api.post(live(`/${stream.id}/messages`), { text: "   " }), 400, "Пустое сообщение");
    expectError(await b.api.post(live(`/${stream.id}/messages`), {}), 400, "Пустое сообщение");

    // Писать может и не вошедший в эфир участник чата.
    const fromC = expectOk(await c.api.post(live(`/${stream.id}/messages`), { text: "я снаружи" }), liveMessageBody).message;
    const sent = expectOk(await b.api.post(live(`/${stream.id}/messages`), { text: `  ${"ы".repeat(600)}  ` }), liveMessageBody).message;
    expect(sent.text).toBe("ы".repeat(500));
    expect(sent.user).toMatchObject({ id: b.id, name: "Болтун" });
    expect(sent).not.toHaveProperty("editedAt");
    expect(await aWs.waitFor("live:message", (e) => e.message?.id === sent.id)).toEqual({ type: "live:message", streamId: stream.id, message: sent });
    // c не в эфире — сообщений эфира не получает.
    await cWs.expectNone("live:message");

    const state = expectOk(await a.api.get(live(`/${stream.id}`)), liveStateBody);
    expect(state.messages.map((m) => m.id)).toEqual([fromC.id, sent.id]);
    expect(state.messages[1]).toEqual(sent);

    const msg = (u: TestUser, id: string, method: "patch" | "delete", body?: unknown) =>
      method === "patch" ? u.api.patch(live(`/${stream.id}/messages/${id}`), body) : u.api.delete(live(`/${stream.id}/messages/${id}`));
    expectError(await msg(b, "lm_1_nonexistent", "patch", { text: "x" }), 404, "Сообщение не найдено");
    expectError(await msg(b, "lm_1_nonexistent", "delete"), 404, "Сообщение не найдено");
    expectError(await msg(a, sent.id, "patch", { text: "чужое" }), 403, "Править можно только своё сообщение");
    expectError(await msg(b, sent.id, "patch", { text: " " }), 400, "Пустое сообщение");

    const edited = expectOk(await msg(b, sent.id, "patch", { text: "исправил" }), liveMessageBody).message;
    expect(edited).toMatchObject({ id: sent.id, text: "исправил", createdAt: sent.createdAt, editedAt: expect.any(String) });
    expect(await aWs.waitFor("live:message-updated", (e) => e.message?.id === sent.id)).toEqual({
      type: "live:message-updated",
      streamId: stream.id,
      message: edited,
    });
    expect(expectOk(await a.api.get(live(`/${stream.id}`)), liveStateBody).messages[1]).toEqual(edited);

    // Чужое удаляет ведущий; рядовой участник — нет.
    expectError(await msg(c, sent.id, "delete"), 403, "Удалить чужое сообщение может ведущий или администратор чата");
    expect(expectOk(await msg(a, sent.id, "delete"), okBody)).toEqual({ ok: true });
    expect(await aWs.waitFor("live:message-deleted", (e) => e.messageId === sent.id)).toEqual({
      type: "live:message-deleted",
      streamId: stream.id,
      messageId: sent.id,
    });
    // Своё удаляет автор.
    expectOk(await msg(c, fromC.id, "delete"), okBody);
    expect(expectOk(await a.api.get(live(`/${stream.id}`)), liveStateBody).messages).toEqual([]);

    // Сообщение другого эфира по этому адресу не находится.
    const otherGroup = await createGroup(a, [b]);
    const other = await startStream(a, otherGroup.id);
    const foreign = expectOk(await a.api.post(live(`/${other.id}/messages`), { text: "там" }), liveMessageBody).message;
    expectError(await msg(a, foreign.id, "delete"), 404, "Сообщение не найдено");
  });

  test("модератор платформы (раздел moderation) удаляет чужое сообщение", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const staff = await registerUser(baseUrl, { phone: ADMIN_PHONE, username: uniq("adm") });
    const group = await createGroup(a, [b, staff]);
    const stream = await startStream(a, group.id);
    const sent = expectOk(await b.api.post(live(`/${stream.id}/messages`), { text: "нарушение" }), liveMessageBody).message;
    expectOk(await staff.api.delete(live(`/${stream.id}/messages/${sent.id}`)), okBody);
  });
});
