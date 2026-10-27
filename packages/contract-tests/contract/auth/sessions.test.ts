// Устройства (сеансы): список, завершение одного, завершение всех остальных,
// и что завершённое устройство получает 401 session_revoked и теряет сокет.
import { afterAll, describe, expect, test } from "vitest";
import { okBody } from "../../schemas/common";
import { loginBody, sessionBody, sessionsBody, switchBody, userBody } from "../../schemas/auth";
import { Api } from "../../support/client";
import { expectError, expectOk } from "../../support/expect";
import { registerUser, uniq, uniqPhone, type TestUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { connectWs, rejectedWsStatus, type WsClient } from "../../support/ws";
import { countSystem } from "./helpers";

const server = useServer();
const sockets: WsClient[] = [];
afterAll(async () => {
  await Promise.all(sockets.map((s) => s.close()));
});

const CHROME_WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const FIREFOX_LINUX = "Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0";

async function loginAs(user: TestUser, ua?: string): Promise<Api> {
  const api = new Api(server().baseUrl);
  const res = await api.post("/api/auth/login-email", { email: user.email, password: user.password }, { headers: ua ? { "user-agent": ua } : {} });
  expectOk(res, loginBody);
  return api;
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`не дождались: ${what}`)), ms))]);
}

describe("GET /api/sessions", () => {
  test("401 без сессии", async () => {
    expectError(await new Api(server().baseUrl).get("/api/sessions"), 401, "unauthorized");
  });

  test("список устройств: строгая форма, текущее помечено, устройство из User-Agent", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    const chrome = await loginAs(user, CHROME_WIN);
    const firefox = await loginAs(user, FIREFOX_LINUX);

    const body = expectOk(await chrome.get("/api/sessions"), sessionsBody);
    expect(body.sessions).toHaveLength(3);
    for (const s of body.sessions) {
      expect(s.userId).toBe(user.id);
      // Настоящий device_id наружу не отдаётся: deviceId — это id записи.
      expect(s.deviceId).toBe(s.id);
    }
    const current = body.sessions.filter((s) => s.current);
    expect(current).toHaveLength(1);
    expect(current[0].device).toBe("Chrome, Windows");
    expect(body.sessions.map((s) => s.device).sort()).toEqual(["Chrome, Windows", "Firefox, Linux", "Браузер, неизвестная ОС"].sort());
    for (const s of body.sessions) expect(s.location).toMatch(/127\.0\.0\.1|::1/);
    for (const s of body.sessions) expect(Object.values(s)).not.toContain(chrome.cookies.get("device_id"));
    // Порядок — по последней активности, самые свежие сверху.
    const times = body.sessions.map((s) => Date.parse(s.lastActive));
    expect([...times].sort((a, b) => b - a)).toEqual(times);

    const fromFirefox = expectOk(await firefox.get("/api/sessions"), sessionsBody);
    expect(fromFirefox.sessions.find((s) => s.current)?.device).toBe("Firefox, Linux");
  });
});

describe("DELETE /api/sessions/:id", () => {
  test("ошибки: чужой/неизвестный сеанс — 404, свой текущий — 400", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    const other = await registerUser(baseUrl);
    expectError(await new Api(baseUrl).delete("/api/sessions/sess_whatever"), 401, "unauthorized");
    expectError(await user.api.delete("/api/sessions/sess_unknown123"), 404, "Сеанс не найден");

    const mine = expectOk(await user.api.get("/api/sessions"), sessionsBody).sessions[0];
    const foreign = expectOk(await other.api.get("/api/sessions"), sessionsBody).sessions[0];
    expectError(await user.api.delete(`/api/sessions/${foreign.id}`), 404, "Сеанс не найден");
    expectError(await user.api.delete(`/api/sessions/${mine.id}`), 400, "Нельзя завершить текущий сеанс — используйте выход из аккаунта");
  });

  test("завершённое устройство: 401 session_revoked, сессия пуста, сокет закрыт 4001, повторный вход без оповещения", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    const phone = await loginAs(user);
    const phoneWs = await connectWs(phone);
    sockets.push(phoneWs);
    const alertsBefore = await countSystem(user.api, (t) => t.startsWith("🔐 Выполнен вход"));
    expect(alertsBefore).toBe(1);

    const target = expectOk(await user.api.get("/api/sessions"), sessionsBody).sessions.find((s) => !s.current)!;
    expectOk(await user.api.delete(`/api/sessions/${target.id}`), okBody);

    expectError(await phone.get("/api/chats"), 401, "session_revoked");
    expectError(await phone.post("/api/auth/verify-password", { password: user.password }), 401, "session_revoked");
    expect(expectOk(await phone.get("/api/auth/session"), sessionBody)).toEqual({ user: null, accounts: [] });
    // Сокет закрывается сразу при отзыве сессии.
    const closed = await withTimeout(phoneWs.closed, 1000, "закрытие сокета");
    expect(closed).toEqual({ code: 4001, reason: "session_revoked" });
    expect(await rejectedWsStatus(phone)).toBe(401);

    // Список больше не показывает завершённый сеанс.
    const left = expectOk(await user.api.get("/api/sessions"), sessionsBody).sessions;
    expect(left.map((s) => s.id)).not.toContain(target.id);

    // Повторный вход с того же устройства восстанавливает ту же запись; устройство
    // уже известно — оповещения о новом входе нет.
    expectOk(await phone.post("/api/auth/login-email", { email: user.email, password: user.password }), loginBody);
    expect(expectOk(await phone.get("/api/auth/session"), sessionBody).user?.id).toBe(user.id);
    const again = expectOk(await user.api.get("/api/sessions"), sessionsBody).sessions;
    expect(again.map((s) => s.id)).toContain(target.id);
    expect(await countSystem(user.api, (t) => t.startsWith("🔐 Выполнен вход"))).toBe(alertsBefore);
  });

  test("на устройстве с двумя аккаунтами завершение одного переключает на другой", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const shared = await loginAs(a);
    const handle = uniq("b");
    const b = expectOk(
      await shared.post("/api/auth/register-email", { name: "Б", email: `${handle}@test.invalid`, password: "secret123", phone: uniqPhone(), username: handle }),
      userBody
    ).user;
    expectOk(await shared.post("/api/auth/switch", { userId: a.id }), switchBody);

    const target = expectOk(await a.api.get("/api/sessions"), sessionsBody).sessions.find((s) => !s.current)!;
    expectOk(await a.api.delete(`/api/sessions/${target.id}`), okBody);

    // Активный аккаунт отозван — запросы идут от имени оставшегося.
    const session = expectOk(await shared.get("/api/auth/session"), sessionBody);
    expect(session.user?.id).toBe(b.id);
    expect(session.accounts.map((u) => u.id)).toEqual([b.id]);
    expect((await shared.get("/api/chats")).status).toBe(200);
  });
});

describe("POST /api/sessions/terminate-others", () => {
  test("401 без сессии; завершает все устройства, кроме текущего", async () => {
    const { baseUrl } = server();
    expectError(await new Api(baseUrl).post("/api/sessions/terminate-others"), 401, "unauthorized");

    const user = await registerUser(baseUrl);
    const d2 = await loginAs(user);
    const d3 = await loginAs(user);
    const other = await registerUser(baseUrl);
    expect(expectOk(await d2.get("/api/sessions"), sessionsBody).sessions).toHaveLength(3);

    expectOk(await d2.post("/api/sessions/terminate-others"), okBody);
    const left = expectOk(await d2.get("/api/sessions"), sessionsBody).sessions;
    expect(left).toHaveLength(1);
    expect(left[0].current).toBe(true);
    expectError(await user.api.get("/api/chats"), 401, "session_revoked");
    expectError(await d3.get("/api/chats"), 401, "session_revoked");
    // Чужие сеансы не затронуты.
    expect((await other.api.get("/api/chats")).status).toBe(200);
  });
});
