// Участники звонка: добавить, убрать, выйти; ссылка-приглашение и вход по ней.
import { describe, expect, test } from "vitest";
import { z } from "zod";
import { expectError, expectOk, expectShape } from "../../support/expect";
import { createDm, createGroup, registerUser, registerUsers } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { callBody } from "../../schemas/calls";
import { okBody } from "../../schemas/common";
import { callIncoming, callParticipantsUpdated, callUpdated } from "../../schemas/ws";
import { setPrivacy, socketPool } from "../ws/helpers";
import { addToCall, patchCall, sameIds, startCall } from "./helpers";

const server = useServer();
const open = socketPool();

async function dmCallOf3() {
  const { baseUrl } = server();
  const [a, b, c] = await registerUsers(baseUrl, 3);
  const dm = await createDm(a, b);
  const [aWs, bWs, cWs] = await Promise.all([open(a.api), open(b.api), open(c.api)]);
  const call = await startCall(a, dm.id);
  return { a, b, c, dm, aWs, bWs, cWs, call };
}

describe("POST /api/calls/:id/participants", () => {
  test("добавленному — call:incoming с профилем звонящего, остальным — call:participants-updated", async () => {
    const { a, b, c, aWs, bWs, cWs, call } = await dmCallOf3();
    // Добавить может любой участник, не только звонящий; добавляемому не нужно быть в чате.
    const updated = await addToCall(b, call.id, c);
    sameIds(updated.participantIds, [a.id, b.id, c.id]);
    expect(updated).toMatchObject({ id: call.id, callerId: a.id, status: "ongoing" });

    const inc = expectShape(callIncoming, await cWs.waitFor("call:incoming", (e) => e.call?.id === call.id), "call:incoming");
    expect(inc.call).toMatchObject({ ...updated, otherUser: { id: a.id } });
    for (const ws of [aWs, bWs]) {
      const e = expectShape(callParticipantsUpdated, await ws.waitFor("call:participants-updated", (e) => e.call?.id === call.id), "participants-updated");
      expect(e.call).toEqual(updated);
    }
    await cWs.expectNone("call:participants-updated", () => true, 200);
  });

  test("уже участник — звонок как есть, без событий", async () => {
    const { a, b, aWs, bWs, call } = await dmCallOf3();
    aWs.clear();
    bWs.clear();
    expect(await addToCall(a, call.id, b)).toEqual(call);
    await bWs.expectNone("call:incoming", () => true, 250);
    await aWs.expectNone("call:participants-updated", () => true, 50);
  });

  test("ошибки: звонки запрещены — 403; нет userId, несуществующий, посторонний и нет звонка — 404", async () => {
    const { a, c, call } = await dmCallOf3();
    await setPrivacy(c, { calls: "nobody" });
    expectError(await a.api.post(`/api/calls/${call.id}/participants`, { userId: c.id }), 403, "Пользователь ограничил звонки");
    expectError(await a.api.post(`/api/calls/${call.id}/participants`, {}), 404, "Пользователь не найден");
    expectError(await a.api.post(`/api/calls/${call.id}/participants`, { userId: 5 }), 404, "Пользователь не найден");
    expectError(await a.api.post(`/api/calls/${call.id}/participants`, { userId: "u_nonexistent00" }), 404, "Пользователь не найден");

    const outsider = await registerUser(server().baseUrl);
    expectError(await outsider.api.post(`/api/calls/${call.id}/participants`, { userId: outsider.id }), 404, "not found");
    expectError(await a.api.post(`/api/calls/cl_nonexistent00/participants`, { userId: c.id }), 404, "not found");
  });
});

describe("DELETE /api/calls/:id/participants/:userId", () => {
  test("звонящий убирает участника: тому call:updated со status ended, остальным participants-updated", async () => {
    const { a, b, c, aWs, bWs, cWs, call } = await dmCallOf3();
    await addToCall(a, call.id, c);
    aWs.clear();
    bWs.clear();

    const res = expectOk(await a.api.delete(`/api/calls/${call.id}/participants/${c.id}`), callBody);
    sameIds(res.call.participantIds, [a.id, b.id]);
    expect(res.call.status).toBe("ongoing");

    const removed = expectShape(callUpdated, await cWs.waitFor("call:updated", (e) => e.call?.id === call.id), "call:updated");
    // Убранному — тот же звонок, но с подменённым статусом (в базе он ongoing).
    expect(removed.call).toEqual({ ...res.call, status: "ended" });
    for (const ws of [aWs, bWs]) {
      const e = await ws.waitFor("call:participants-updated", (e) => e.call?.id === call.id);
      expect(e.call).toEqual(res.call);
    }
  });

  test("не звонящий — 403; себя — 400; не участник — звонок как есть; посторонний — 404", async () => {
    const { a, b, c, call } = await dmCallOf3();
    expectError(await b.api.delete(`/api/calls/${call.id}/participants/${a.id}`), 403, "Убрать участника может только тот, кто начал звонок");
    expectError(await a.api.delete(`/api/calls/${call.id}/participants/${a.id}`), 400, "Чтобы выйти самому, завершите звонок");
    expect(expectOk(await a.api.delete(`/api/calls/${call.id}/participants/${c.id}`), callBody).call).toEqual(call);
    expectError(await c.api.delete(`/api/calls/${call.id}/participants/${b.id}`), 404, "not found");
    expectError(await a.api.delete(`/api/calls/cl_nonexistent00/participants/${b.id}`), 404, "not found");
  });
});

describe("POST /api/calls/:id/leave", () => {
  test("выход из звонка на троих — participants-updated оставшимся; второй выход — completed", async () => {
    const { baseUrl } = server();
    const [a, b, c] = await registerUsers(baseUrl, 3);
    const group = await createGroup(a, [b, c]);
    const [aWs, bWs, cWs] = await Promise.all([open(a.api), open(b.api), open(c.api)]);
    const call = await startCall(a, group.id, { ringAll: true });

    expectOk(await c.api.post(`/api/calls/${call.id}/leave`), okBody);
    for (const ws of [aWs, bWs]) {
      const e = await ws.waitFor("call:participants-updated", (e) => e.call?.id === call.id);
      sameIds(e.call.participantIds, [a.id, b.id]);
    }
    // Ушедшему ничего не шлётся.
    await cWs.expectNone("call:participants-updated", () => true, 200);

    expectOk(await b.api.post(`/api/calls/${call.id}/leave`), okBody);
    const done = expectShape(callUpdated, await aWs.waitFor("call:updated", (e) => e.call?.id === call.id), "call:updated");
    expect(done.call).toMatchObject({ status: "completed", participantIds: [a.id] });
    expect(done.call.durationSec).toBeGreaterThanOrEqual(0);
    await bWs.expectNone("call:updated", () => true, 200);

    const history = (await a.api.get("/api/calls")).body.calls;
    expect(history.find((x: any) => x.id === call.id)).toMatchObject({ status: "completed" });
    // Вышедшие пропадают и из истории — она строится по call_participants.
    expect((await c.api.get("/api/calls")).body.calls.find((x: any) => x.id === call.id)).toBeUndefined();
  });

  test("выход из лички — сразу completed для собеседника", async () => {
    const { a, b, aWs, call } = await dmCallOf3();
    expectOk(await b.api.post(`/api/calls/${call.id}/leave`), okBody);
    const e = await aWs.waitFor("call:updated", (e) => e.call?.id === call.id);
    expect(e.call).toMatchObject({ status: "completed", participantIds: [a.id] });
  });

  test("посторонний и несуществующий звонок — {ok:true}", async () => {
    const { call } = await dmCallOf3();
    const outsider = await registerUser(server().baseUrl);
    expectOk(await outsider.api.post(`/api/calls/${call.id}/leave`), okBody);
    expectOk(await outsider.api.post(`/api/calls/cl_nonexistent00/leave`), okBody);
  });
});

describe("ссылка-приглашение", () => {
  const inviteBody = z.strictObject({ url: z.string().regex(/^https?:\/\/[^/]+\/call-join\/[0-9a-f]{32}$/) });

  test("POST /:id/invite-link — постоянная ссылка; вход по ней — participants-updated остальным", async () => {
    const { baseUrl } = server();
    const { a, b, aWs, bWs, call } = await dmCallOf3();
    const first = expectOk(await a.api.post(`/api/calls/${call.id}/invite-link`), inviteBody);
    // Повторно (и другим участником) — та же ссылка.
    expect(expectOk(await b.api.post(`/api/calls/${call.id}/invite-link`), inviteBody).url).toBe(first.url);
    const token = first.url.split("/").pop()!;

    // Токен виден участникам в самом звонке.
    const after = await patchCall(a, call.id, {});
    expect(after.joinToken).toBe(token);

    const guest = await registerUser(baseUrl);
    const guestWs = await open(guest.api);
    const joined = expectOk(await guest.api.post(`/api/calls/join/${token}`), callBody);
    sameIds(joined.call.participantIds, [a.id, b.id, guest.id]);
    expect(joined.call.joinToken).toBe(token);
    for (const ws of [aWs, bWs]) {
      const e = await ws.waitFor("call:participants-updated", (e) => e.call?.id === call.id);
      expect(e.call).toEqual(joined.call);
    }
    await guestWs.expectNone("call:participants-updated", () => true, 200);

    // Повторный вход — без ошибок, участник не дублируется.
    const again = expectOk(await guest.api.post(`/api/calls/join/${token}`), callBody);
    expect(again.call.participantIds.filter((id) => id === guest.id)).toHaveLength(1);
  });

  test("вход по ссылке не учитывает приватность звонков", async () => {
    const { baseUrl } = server();
    const { a, call } = await dmCallOf3();
    const token = (await a.api.post(`/api/calls/${call.id}/invite-link`)).body.url.split("/").pop();
    const guest = await registerUser(baseUrl);
    await setPrivacy(guest, { calls: "nobody" });
    expect((await guest.api.post(`/api/calls/join/${token}`)).status).toBe(200);
  });

  test("ошибки: посторонний — 404, завершённый звонок — 400; вход в завершённый и по чужому токену — 404", async () => {
    const { baseUrl } = server();
    const { a, call } = await dmCallOf3();
    const outsider = await registerUser(baseUrl);
    expectError(await outsider.api.post(`/api/calls/${call.id}/invite-link`), 404, "not found");
    expectError(await a.api.post(`/api/calls/cl_nonexistent00/invite-link`), 404, "not found");

    const token = (await a.api.post(`/api/calls/${call.id}/invite-link`)).body.url.split("/").pop();
    await patchCall(a, call.id, { status: "ended" });
    expectError(await a.api.post(`/api/calls/${call.id}/invite-link`), 400, "Звонок уже завершён");
    expectError(await outsider.api.post(`/api/calls/join/${token}`), 404, "Ссылка недействительна или звонок уже завершён");
    expectError(await outsider.api.post(`/api/calls/join/${"0".repeat(32)}`), 404, "Ссылка недействительна или звонок уже завершён");
  });
});
