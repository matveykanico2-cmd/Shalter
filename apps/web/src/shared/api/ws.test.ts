import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeApi, FakeSocket,fakeSocket } from "../lib/test";

import { createWsClient } from "./ws";

let client: ReturnType<typeof createWsClient>;

beforeEach(() => {
  vi.useFakeTimers();
  fakeSocket();
  client = createWsClient(() => "ws://test/ws");
});

afterEach(() => {
  client.stop();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("клиент WebSocket", () => {
  it("события по типу; pong и не-JSON — мимо; при открытии — ws:reconnected", () => {
    const got: string[] = [];
    client.on("message:deleted", (e) => got.push(`deleted ${e.id}`));
    client.on("ws:reconnected", () => got.push("reconnected"));
    client.start();
    const socket = FakeSocket.last();
    expect(socket.url).toBe("ws://test/ws");
    socket.open();
    socket.receive({ type: "pong" });
    socket.dispatchEvent(new MessageEvent("message", { data: "{oops" }));
    socket.receive({ type: "message:deleted", chatId: "c_1", id: "m_1" });
    expect(got).toEqual(["reconnected", "deleted m_1"]);
  });

  it("ping раз в 20 с; нет ответа 6 с — новый сокет", () => {
    client.start();
    const first = FakeSocket.last();
    first.open();
    vi.advanceTimersByTime(20_000);
    expect(first.sent).toEqual(['{"type":"ping"}']);
    vi.advanceTimersByTime(6_000);
    expect(FakeSocket.sockets).toHaveLength(2);
    expect(first.readyState).toBe(FakeSocket.CLOSED);
  });

  it("обрыв — переподключение через 1 с, дальше пауза растёт", () => {
    client.start();
    FakeSocket.last().serverClose(1006);
    vi.advanceTimersByTime(999);
    expect(FakeSocket.sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.sockets).toHaveLength(2);
    FakeSocket.last().serverClose(1006);
    vi.advanceTimersByTime(1499);
    expect(FakeSocket.sockets).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.sockets).toHaveLength(3);
  });

  it("статус: обрыв короче 2 с не показывается; первый раз — «ещё не открывался»", () => {
    client.start();
    expect(client.status()).toEqual({ open: false, down: false, everOpened: false });
    vi.advanceTimersByTime(2000);
    expect(client.status()).toEqual({ open: false, down: true, everOpened: false });
    FakeSocket.last().open();
    expect(client.status()).toEqual({ open: true, down: false, everOpened: true });
    FakeSocket.last().serverClose(1006);
    vi.advanceTimersByTime(1000);
    FakeSocket.last().serverClose(1006); // неудачная попытка не продлевает паузу
    vi.advanceTimersByTime(1000);
    expect(client.status()).toEqual({ open: false, down: true, everOpened: true });
  });

  it.each([
    [{ status: 401, body: { error: "session_revoked" } }, "session_revoked"],
    [{ status: 403, body: { error: "banned" } }, "banned"],
    [{ status: 401, body: { error: "unauthorized" } }, "signed_out"],
  ])("4001 — причина из GET /api/sessions (%j), без переподключения", async (reply, reason) => {
    fakeApi({ "GET /api/sessions": reply });
    const revoked = vi.fn();
    client.on("ws:revoked", revoked);
    client.start();
    FakeSocket.last().serverClose(4001);
    await vi.runAllTimersAsync();
    expect(revoked).toHaveBeenCalledWith({ type: "ws:revoked", reason });
    expect(FakeSocket.sockets).toHaveLength(1);
  });

  it("4001, но сеанс жив (закрыли сокет другого аккаунта) — переподключаемся", async () => {
    fakeApi({ "GET /api/sessions": { body: { sessions: [] } } });
    const revoked = vi.fn();
    client.on("ws:revoked", revoked);
    client.start();
    FakeSocket.last().serverClose(4001);
    await vi.advanceTimersByTimeAsync(1000);
    expect(revoked).not.toHaveBeenCalled();
    expect(FakeSocket.sockets).toHaveLength(2);
  });

  it("stop — сокет закрыт, переподключения нет", () => {
    client.start();
    client.stop();
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.sockets).toHaveLength(1);
  });
});
