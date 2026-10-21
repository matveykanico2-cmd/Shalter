// WebSocket-шлюз /ws: кого пускает, ping/pong, ограничения и доставка на все
// сокеты пользователя.
import { describe, expect, test } from "vitest";
import WebSocket from "ws";
import { Api } from "../../support/client";
import { expectShape } from "../../support/expect";
import { createDm, login, registerUser, sendText } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { rejectedWsStatus, wsUrl } from "../../support/ws";
import { pong } from "../../schemas/ws";
import { expectAlive, socketPool } from "./helpers";

const server = useServer();
const open = socketPool();

describe("подключение к /ws", () => {
  test("без cookie сессии — 401 на upgrade", async () => {
    const { baseUrl } = server();
    expect(await rejectedWsStatus(new Api(baseUrl))).toBe(401);
  });

  test("поддельный session_uids без живой сессии устройства — 401", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    // Тот же список аккаунтов, но чужой device_id — сессии для пары нет.
    const forged = new Api(baseUrl);
    forged.cookies.set("session_uids", JSON.stringify([a.id]));
    forged.cookies.set("active_uid", a.id);
    forged.cookies.set("device_id", "0".repeat(24));
    expect(await rejectedWsStatus(forged)).toBe(401);
    // Без device_id вовсе — тоже 401.
    forged.cookies.delete("device_id");
    expect(await rejectedWsStatus(forged)).toBe(401);
  });

  test("с живой сессией сокет открывается", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const ws = await open(a.api);
    expect(ws.socket.readyState).toBe(WebSocket.OPEN);
  });
});

describe("протокол", () => {
  test("ping → ровно {\"type\":\"pong\"}", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const ws = await open(a.api);
    const raw = new Promise<string>((resolve) =>
      ws.socket.on("message", (data) => {
        const s = data.toString();
        if (s.includes("pong")) resolve(s);
      })
    );
    ws.send({ type: "ping" });
    expect(await raw).toBe('{"type":"pong"}');
    expectShape(pong, await ws.waitFor("pong"), "pong");
  });

  test("не-JSON и неизвестные типы молча игнорируются, сокет остаётся открытым", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const ws = await open(a.api);
    ws.socket.send("это не json");
    ws.send({ type: "nonexistent:event", x: 1 });
    ws.send({ noType: true });
    await expectAlive(ws);
    // Кроме pong (и своего presence) ничего не пришло — ни ошибок, ни эха.
    expect(ws.events.filter((e) => e.type !== "pong" && e.type !== "presence:update")).toEqual([]);
  });

  test("сообщение чуть меньше 64 КБ проходит", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const ws = await open(a.api);
    const frame = JSON.stringify({ type: "ping", pad: "" });
    ws.socket.send(JSON.stringify({ type: "ping", pad: "x".repeat(64 * 1024 - frame.length) }));
    await ws.waitFor("pong", () => true, 2000);
    expect(ws.socket.readyState).toBe(WebSocket.OPEN);
  });

  test("сокет на другом пути (/ws/x) не апгрейдится этим шлюзом", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    // Чужой путь — сразу 404.
    const socket = new WebSocket(wsUrl(a.api) + "/x", { headers: { cookie: a.api.cookieHeader() } });
    const outcome = await new Promise<string>((resolve) => {
      socket.once("open", () => resolve("open"));
      socket.once("unexpected-response", (_req, res) => resolve(`http ${res.statusCode}`));
      socket.once("error", () => resolve("error"));
      setTimeout(() => resolve("timeout"), 500);
    });
    socket.terminate();
    expect(outcome).toBe("http 404");
  });
});

describe("несколько сокетов одного пользователя", () => {
  test("события приходят на все сокеты — и одной вкладки, и другого устройства", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const tab1 = await open(b.api);
    const tab2 = await open(b.api.clone());
    const phone = await open(await login(baseUrl, b));
    const outsider = await open((await registerUser(baseUrl)).api);

    const dm = await createDm(a, b);
    const sent = await sendText(a, dm.id, "всем вкладкам");
    for (const ws of [tab1, tab2, phone]) {
      const e = await ws.waitFor("message:new", (e) => e.message?.id === sent.id);
      expect(e.message).toMatchObject({ chatId: dm.id, text: "всем вкладкам" });
    }
    await outsider.expectNone("message:new", (e) => e.message?.id === sent.id, 300);
  });

  test("закрытие одного сокета не мешает остальным получать события", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const first = await open(b.api);
    const second = await open(b.api.clone());
    await first.close();

    const dm = await createDm(a, b);
    const sent = await sendText(a, dm.id, "после закрытия");
    await second.waitFor("message:new", (e) => e.message?.id === sent.id);
  });
});
