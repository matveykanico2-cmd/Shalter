// Сигналинг WebRTC: основной путь — WS call:signal:send → call:signal адресату;
// запасной — POST /:id/signal и поллинг GET /:id/signal?after=seq.
import { describe, expect, test } from "vitest";
import { z } from "zod";
import { expectError, expectOk, expectShape } from "../../support/expect";
import { createDm, login, registerUser, registerUsers } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { signal } from "../../schemas/calls";
import { callSignal } from "../../schemas/ws";
import { socketPool } from "../ws/helpers";
import { startCall } from "./helpers";

const server = useServer();
const open = socketPool();
const signalBody = z.strictObject({ signal });
const signalsBody = z.strictObject({ signals: z.array(signal) });

async function setup() {
  const { baseUrl } = server();
  const [a, b, outsider] = await registerUsers(baseUrl, 3);
  const [aWs, bWs, outsiderWs] = await Promise.all([open(a.api), open(b.api), open(outsider.api)]);
  const call = await startCall(a, (await createDm(a, b)).id);
  return { a, b, outsider, aWs, bWs, outsiderWs, call };
}

describe("сигналы по HTTP", () => {
  test("POST /:id/signal — сигнал в ответе и call:signal только адресату", async () => {
    const { a, b, aWs, bWs, outsiderWs, call } = await setup();
    const offer = { type: "offer", sdp: "v=0…" };
    const sent = expectOk(await a.api.post(`/api/calls/${call.id}/signal`, { toUserId: b.id, kind: "offer", data: offer }), signalBody).signal;
    expect(sent).toMatchObject({ callId: call.id, fromUserId: a.id, toUserId: b.id, kind: "offer", data: offer });

    const e = expectShape(callSignal, await bWs.waitFor("call:signal", (e) => e.signal?.id === sent.id), "call:signal");
    expect(e.signal).toEqual(sent);
    await aWs.expectNone("call:signal", () => true, 250);
    await outsiderWs.expectNone("call:signal", () => true, 50);
  });

  test("GET /:id/signal?after= — только адресованные мне, по возрастанию seq, после указанного", async () => {
    const { a, b, call } = await setup();
    const s1 = (await a.api.post(`/api/calls/${call.id}/signal`, { toUserId: b.id, kind: "offer", data: { n: 1 } })).body.signal;
    const s2 = (await a.api.post(`/api/calls/${call.id}/signal`, { toUserId: b.id, kind: "candidate", data: { n: 2 } })).body.signal;
    await b.api.post(`/api/calls/${call.id}/signal`, { toUserId: a.id, kind: "answer", data: { n: 3 } });
    // Без data ключа нет в ответе, а из базы приходит null.
    const s4 = expectOk(await a.api.post(`/api/calls/${call.id}/signal`, { toUserId: b.id, kind: "bye" }), signalBody).signal;
    expect(s4).not.toHaveProperty("data");
    expect(s2.seq).toBeGreaterThan(s1.seq);

    const all = expectOk(await b.api.get(`/api/calls/${call.id}/signal`), signalsBody).signals;
    expect(all).toEqual([s1, s2, { ...s4, data: null }]);
    expect(expectOk(await b.api.get(`/api/calls/${call.id}/signal`, { query: { after: s1.seq } }), signalsBody).signals.map((s) => s.id)).toEqual([s2.id, s4.id]);
    expect((await b.api.get(`/api/calls/${call.id}/signal`, { query: { after: s4.seq } })).body).toEqual({ signals: [] });
    // Нечисловой after — как 0.
    expect((await b.api.get(`/api/calls/${call.id}/signal`, { query: { after: "abc" } })).body.signals).toHaveLength(3);
    // Свои отправленные себе не видны: звонящему — только ответ b.
    expect((await a.api.get(`/api/calls/${call.id}/signal`)).body.signals.map((s: any) => s.kind)).toEqual(["answer"]);
  });

  test("ошибки: адресат не в звонке — 400; посторонний и нет звонка — 404; без kind — 400", async () => {
    const { a, b, outsider, call } = await setup();
    expectError(await a.api.post(`/api/calls/${call.id}/signal`, { toUserId: outsider.id, kind: "offer" }), 400, "invalid recipient");
    expectError(await a.api.post(`/api/calls/${call.id}/signal`, { kind: "offer" }), 400, "invalid recipient");
    expectError(await outsider.api.post(`/api/calls/${call.id}/signal`, { toUserId: a.id, kind: "offer" }), 404, "not found");
    expectError(await outsider.api.get(`/api/calls/${call.id}/signal`), 404, "not found");
    expectError(await a.api.get(`/api/calls/cl_nonexistent00/signal`), 404, "not found");
    expectError(await a.api.post(`/api/calls/cl_nonexistent00/signal`, { toUserId: b.id, kind: "offer" }), 404, "not found");
    expectError(await a.api.post(`/api/calls/${call.id}/signal`, { toUserId: b.id }), 400, "invalid kind");
    expectError(await a.api.post(`/api/calls/${call.id}/signal`, { toUserId: b.id, kind: 5 }), 400, "invalid kind");
  });
});

describe("сигналы по WebSocket", () => {
  test("call:signal:send → call:signal на все устройства адресата; сигнал виден и поллингом", async () => {
    const { baseUrl } = server();
    const { a, b, aWs, bWs, outsiderWs, call } = await setup();
    const bPhone = await open(await login(baseUrl, b));
    const candidate = { candidate: "candidate:1 1 udp 2122260223 10.0.0.1 54321 typ host", sdpMid: "0" };

    aWs.send({ type: "call:signal:send", callId: call.id, toUserId: b.id, kind: "candidate", data: candidate });
    const got = expectShape(callSignal, await bWs.waitFor("call:signal", (e) => e.signal?.kind === "candidate"), "call:signal").signal;
    expect(got).toMatchObject({ callId: call.id, fromUserId: a.id, toUserId: b.id, kind: "candidate", data: candidate });
    expect((await bPhone.waitFor("call:signal", (e) => e.signal?.id === got.id)).signal).toEqual(got);
    await aWs.expectNone("call:signal", () => true, 250);
    await outsiderWs.expectNone("call:signal", () => true, 50);

    const polled = (await b.api.get(`/api/calls/${call.id}/signal`)).body.signals;
    expect(polled).toEqual([got]);
  });

  test("посторонний, адресат вне звонка, нет звонка — сигнал молча отбрасывается", async () => {
    const { baseUrl } = server();
    const { a, b, outsider, aWs, bWs, outsiderWs, call } = await setup();
    const stranger = await registerUser(baseUrl);
    const strangerWs = await open(stranger.api);

    outsiderWs.send({ type: "call:signal:send", callId: call.id, toUserId: b.id, kind: "offer", data: {} });
    aWs.send({ type: "call:signal:send", callId: call.id, toUserId: stranger.id, kind: "offer", data: {} });
    aWs.send({ type: "call:signal:send", callId: "cl_nonexistent00", toUserId: b.id, kind: "offer", data: {} });
    aWs.send({ type: "call:signal:send", toUserId: b.id, kind: "offer" });

    await bWs.expectNone("call:signal", () => true, 400);
    await strangerWs.expectNone("call:signal", () => true, 0);
    expect((await b.api.get(`/api/calls/${call.id}/signal`)).body.signals).toEqual([]);
    // Ответа-ошибки отправителю тоже нет.
    expect(outsiderWs.events.filter((e) => e.type !== "presence:update")).toEqual([]);
    void outsider;
  });
});
