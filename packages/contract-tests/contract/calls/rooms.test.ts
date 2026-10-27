// Голосовой чат группы («комната», kind = voice-room): GET /room/:chatId,
// POST /room/:chatId/join и /leave.
import { describe, expect, test } from "vitest";
import { z } from "zod";
import { expectError, expectOk, expectShape } from "../../support/expect";
import { createChannel, createDm, createGroup, registerUser, registerUsers } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { call, callBody } from "../../schemas/calls";
import { okBody } from "../../schemas/common";
import { voicechatUpdated } from "../../schemas/ws";
import { socketPool } from "../ws/helpers";
import { sameIds } from "./helpers";

const server = useServer();
const open = socketPool();
const roomBody = z.strictObject({ call: call.nullable() });

describe("голосовой чат группы", () => {
  test("полный цикл: пусто → первый создаёт комнату → второй входит → выходят → ended", async () => {
    const { baseUrl } = server();
    const [a, b, c] = await registerUsers(baseUrl, 3);
    const group = await createGroup(a, [b, c]);
    const [aWs, bWs, cWs] = await Promise.all([open(a.api), open(b.api), open(c.api)]);

    expect(expectOk(await b.api.get(`/api/calls/room/${group.id}`), roomBody)).toEqual({ call: null });

    // Первый вход создаёт комнату; voicechat:updated — всем участникам группы, включая вошедшего.
    const created = expectOk(await b.api.post(`/api/calls/room/${group.id}/join`), callBody).call;
    expect(created).toMatchObject({ chatId: group.id, kind: "voice-room", callerId: b.id, status: "ongoing", participantIds: [b.id], direction: "outgoing" });
    for (const ws of [aWs, bWs, cWs]) {
      const e = expectShape(voicechatUpdated, await ws.waitFor("voicechat:updated", (e) => e.call?.id === created.id), "voicechat:updated");
      expect(e).toEqual({ type: "voicechat:updated", chatId: group.id, call: created });
    }
    // GET /room отдаёт активную комнату любому участнику группы.
    expect(expectOk(await a.api.get(`/api/calls/room/${group.id}`), roomBody).call).toEqual(created);

    aWs.clear();
    bWs.clear();
    cWs.clear();
    const joined = expectOk(await c.api.post(`/api/calls/room/${group.id}/join`), callBody).call;
    expect(joined.id).toBe(created.id);
    sameIds(joined.participantIds, [b.id, c.id]);
    // participants-updated — тем, кто уже в комнате; вошедшему — нет.
    expect((await bWs.waitFor("call:participants-updated", (e) => e.call?.id === created.id)).call).toEqual(joined);
    await cWs.waitFor("voicechat:updated", (e) => e.call?.id === created.id);
    await aWs.waitFor("voicechat:updated", (e) => e.call?.id === created.id);
    await cWs.expectNone("call:participants-updated", () => true, 200);
    await aWs.expectNone("call:participants-updated", () => true, 50);

    // Повторный вход — тот же состав.
    sameIds(expectOk(await c.api.post(`/api/calls/room/${group.id}/join`), callBody).call.participantIds, [b.id, c.id]);

    aWs.clear();
    bWs.clear();
    expectOk(await b.api.post(`/api/calls/room/${group.id}/leave`), okBody);
    const left = await aWs.waitFor("voicechat:updated", (e) => e.chatId === group.id);
    expect(left.call).toMatchObject({ id: created.id, status: "ongoing", participantIds: [c.id] });
    expect((await cWs.waitFor("call:participants-updated", (e) => e.call?.participantIds?.length === 1)).call.participantIds).toEqual([c.id]);

    aWs.clear();
    cWs.clear();
    expectOk(await c.api.post(`/api/calls/room/${group.id}/leave`), okBody);
    // Последний вышел — комната завершена, в voicechat:updated call: null.
    expect(await aWs.waitFor("voicechat:updated", (e) => e.chatId === group.id)).toEqual({ type: "voicechat:updated", chatId: group.id, call: null });
    expect(expectOk(await a.api.get(`/api/calls/room/${group.id}`), roomBody)).toEqual({ call: null });
    expect((await a.api.get("/api/calls")).body.calls).toEqual([]);
    // Вышедшие удаляются из call_participants — завершённой комнаты нет ни в чьей истории.
    expect((await c.api.get("/api/calls")).body.calls.find((x: any) => x.id === created.id)).toBeUndefined();

    // Новый вход — уже новая комната.
    const fresh = expectOk(await a.api.post(`/api/calls/room/${group.id}/join`), callBody).call;
    expect(fresh.id).not.toBe(created.id);
  });

  test("join: личка, канал, не участник, нет чата — 404", async () => {
    const { baseUrl } = server();
    const [a, b, outsider] = await registerUsers(baseUrl, 3);
    const dm = await createDm(a, b);
    const channel = await createChannel(a, [b]);
    const group = await createGroup(a, [b]);
    for (const chatId of [dm.id, channel.id]) {
      expectError(await a.api.post(`/api/calls/room/${chatId}/join`), 404, "not found");
    }
    expectError(await outsider.api.post(`/api/calls/room/${group.id}/join`), 404, "not found");
    expectError(await a.api.post(`/api/calls/room/c_nonexistent00/join`), 404, "not found");
  });

  test("GET /room: не участник и нет чата — 404; личка — call: null", async () => {
    const { baseUrl } = server();
    const [a, b, outsider] = await registerUsers(baseUrl, 3);
    const group = await createGroup(a, [b]);
    expectError(await outsider.api.get(`/api/calls/room/${group.id}`), 404, "not found");
    expectError(await a.api.get(`/api/calls/room/c_nonexistent00`), 404, "not found");
    expect((await a.api.get(`/api/calls/room/${(await createDm(a, b)).id}`)).body).toEqual({ call: null });
  });

  test("leave: нет чата — 404; не в комнате (и даже не в группе) — {ok:true}", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const outsider = await registerUser(baseUrl);
    const group = await createGroup(a, [b]);
    expectError(await a.api.post(`/api/calls/room/c_nonexistent00/leave`), 404, "not found");
    expectOk(await a.api.post(`/api/calls/room/${group.id}/leave`), okBody);
    await a.api.post(`/api/calls/room/${group.id}/join`);
    expectOk(await outsider.api.post(`/api/calls/room/${group.id}/leave`), okBody);
    expect((await a.api.get(`/api/calls/room/${group.id}`)).body.call.participantIds).toEqual([a.id]);
  });
});
