// Предел размера входящего WS-кадра (maxPayload 64 КБ, server/ws.js).
import { describe, expect, test } from "vitest";
import { registerUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { closedWithin, socketPool } from "./helpers";

const server = useServer();
const open = socketPool();

describe("maxPayload", () => {
  test("кадр больше 64 КБ — сокет закрывается с кодом 1009, сервер продолжает работать", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const ws = await open(a.api);
    ws.socket.send(JSON.stringify({ type: "ping", pad: "x".repeat(64 * 1024) }));
    const closed = await closedWithin(ws, 3000);
    expect(closed.code).toBe(1009);
    // Процесс сервера переживает такой кадр: тот же пользователь снова подключается.
    const again = await open(a.api);
    expect(again.socket.readyState).toBe(1);
    expect((await a.api.get("/api/version")).status).toBe(200);
  });
});
