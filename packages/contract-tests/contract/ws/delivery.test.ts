// Доставка событий по сокетам: секретный чат — только на привязанное устройство,
// сигналы эфира между участниками, отложенное «когда будет в сети» — при подключении.
import { afterAll, describe, expect, test } from "vitest";
import { liveCreateBody, liveStateBody } from "../../schemas/live";
import { scheduledEnvelope, scheduledList } from "../../schemas/messages";
import { expectOk } from "../../support/expect";
import { createDm, createGroup, login, registerUser, registerUsers, sendText, type TestUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { connectWs, type WsClient } from "../../support/ws";

const server = useServer({ env: { RTMP_HTTP_PORT: "9", RTMP_PORT: "19351" } });
const sockets: WsClient[] = [];
afterAll(async () => {
  await Promise.all(sockets.map((s) => s.close()));
});
async function track(p: Promise<WsClient>) {
  const s = await p;
  sockets.push(s);
  return s;
}

describe("секретный чат", () => {
  test("события — только на устройство, к которому чат привязан; обычный чат — на все устройства", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const secret = (await a.api.post("/api/chats/secret", { userId: b.id })).body.chat;
    // Первое обращение b с этого устройства привязывает чат к нему.
    expect((await b.api.get(`/api/chats/${secret.id}/messages`)).status).toBe(200);
    const other = await login(baseUrl, b);
    const [bound, unbound] = await Promise.all([track(connectWs(b.api)), track(connectWs(other))]);

    const msg = await sendText(a, secret.id, "только сюда");
    await bound.waitFor("message:new", (e) => e.message?.id === msg.id);
    await unbound.expectNone("message:new", (e) => e.chatId === secret.id);

    const dm = await createDm(a, b);
    const plain = await sendText(a, dm.id, "везде");
    await Promise.all([bound, unbound].map((s) => s.waitFor("message:new", (e) => e.message?.id === plain.id)));
  });
});

describe("live:signal:send", () => {
  test("сигнал между участниками эфира доходит адресату; от постороннего и постороннему — нет", async () => {
    const { baseUrl } = server();
    const [a, b, c] = await registerUsers(baseUrl, 3);
    const group = await createGroup(a, [b, c]);
    const stream = expectOk(await a.api.post("/api/live", { chatId: group.id }), liveCreateBody).stream;
    expectOk(await b.api.post(`/api/live/${stream.id}/join`), liveStateBody);
    const [aWs, bWs, cWs] = await Promise.all([a, b, c].map((u: TestUser) => track(connectWs(u.api))));

    bWs.send({ type: "live:signal:send", streamId: stream.id, toUserId: a.id, kind: "offer", data: { sdp: "x" } });
    const got = await aWs.waitFor("live:signal");
    expect(got).toEqual({ type: "live:signal", streamId: stream.id, fromUserId: b.id, kind: "offer", data: { sdp: "x" } });

    cWs.send({ type: "live:signal:send", streamId: stream.id, toUserId: a.id, kind: "offer", data: {} });
    aWs.send({ type: "live:signal:send", streamId: stream.id, toUserId: c.id, kind: "answer", data: {} });
    aWs.send({ type: "live:signal:send", streamId: "nope", toUserId: b.id, kind: "answer", data: {} });
    await aWs.expectNone("live:signal", (e) => e.fromUserId === c.id);
    await cWs.expectNone("live:signal");
    await bWs.expectNone("live:signal");
  });
});

describe("«Когда будет в сети»", () => {
  test("собеседник не в сети — сообщение ждёт и уходит, когда он подключается", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const dm = await createDm(a, b);
    // Регистрация ставит online: true; закрытие последнего сокета — «не в сети».
    await (await connectWs(b.api)).close();
    await new Promise((r) => setTimeout(r, 200));

    const sched = `/api/chats/${dm.id}/messages/scheduled`;
    expectOk(await a.api.post(sched, { text: "появился", whenOnline: true }), scheduledEnvelope);
    await new Promise((r) => setTimeout(r, 300));
    expect(expectOk(await a.api.get(sched), scheduledList).scheduled).toHaveLength(1);

    const bWs = await track(connectWs(b.api));
    await bWs.waitFor("message:new", (e) => e.message?.text === "появился");
    expect(expectOk(await a.api.get(sched), scheduledList).scheduled).toEqual([]);
  });
});
