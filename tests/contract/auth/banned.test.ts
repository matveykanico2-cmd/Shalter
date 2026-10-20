// Заблокированный аккаунт: 403 banned на защищённых маршрутах и отказы во входе
// всеми способами. Блокирует главный админ — сервер с PREMIUM_ADMIN_PHONE.
import { afterAll, describe, expect, test } from "vitest";
import { bannedBody, qrPollBody, qrStartBody, recoverSentBody, sessionBody, totpSetupBody, twoFactorChallenge, twoFactorEnabledBody } from "../../schemas/auth";
import { selfUser } from "../../schemas/user";
import { okBody } from "../../schemas/common";
import { Api } from "../../support/client";
import { expectError, expectOk, expectShape } from "../../support/expect";
import { registerUser, type TestUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { connectWs, type WsClient } from "../../support/ws";
import { countSystem } from "./helpers";
import { totp } from "./totp";

const ADMIN_PHONE = "+70000000777";
const server = useServer({ env: { PREMIUM_ADMIN_PHONE: ADMIN_PHONE, ALLOW_ADMIN_PHONE_SIGNUP: "1" } });
const sockets: WsClient[] = [];
afterAll(async () => {
  await Promise.all(sockets.map((s) => s.close()));
});

let admin: TestUser;
async function getAdmin(): Promise<TestUser> {
  admin ??= await registerUser(server().baseUrl, { phone: ADMIN_PHONE, name: "Админ" });
  return admin;
}

async function ban(user: TestUser, reason = "спам") {
  const res = await (await getAdmin()).api.post(`/api/admin/users/${user.id}/ban`, { banned: true, reason });
  expect(res.status, res.text).toBe(200);
}
async function unban(user: TestUser) {
  const res = await (await getAdmin()).api.post(`/api/admin/users/${user.id}/ban`, { banned: false });
  expect(res.status, res.text).toBe(200);
}

const BAN_TEXT = "Аккаунт заблокирован администрацией Shalter. Причина: спам";

describe("регистрация на админский номер", () => {
  test("разрешена через ALLOW_ADMIN_PHONE_SIGNUP=1; selfUser главного админа", async () => {
    const a = await getAdmin();
    expectShape(selfUser, a.self, "selfUser админа");
    expect(a.self).toMatchObject({ phone: ADMIN_PHONE, isPrimaryAdmin: true, isDeveloper: true, isVerified: true });
  });
});

describe("заблокированный пользователь", () => {
  test("403 banned с причиной на защищённых маршрутах, сокет закрыт, после разбана — снова доступ", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    const ws = await connectWs(user.api);
    sockets.push(ws);
    await ban(user);

    const res = await user.api.get("/api/chats");
    expect(res.status).toBe(403);
    expect(expectShape(bannedBody, res.body)).toEqual({ error: "banned", banReason: "спам" });
    expect((await user.api.get("/api/sessions")).status).toBe(403);
    expect((await user.api.post("/api/auth/verify-password", { password: user.password })).status).toBe(403);
    // GET /session бан не проверяет — клиент видит isBanned у себя.
    expect(expectOk(await user.api.get("/api/auth/session"), sessionBody).user).toMatchObject({ id: user.id, isBanned: true });

    const closed = await Promise.race([ws.closed, new Promise<never>((_, r) => setTimeout(() => r(new Error("сокет не закрыт")), 4000))]);
    expect(closed).toEqual({ code: 4001, reason: "session_revoked" });

    await unban(user);
    expect((await user.api.get("/api/chats")).status).toBe(200);
  });

  test("вход паролем, восстановление по паре — 403 с текстом; восстановление и вход по коду молча ничего не шлют", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    await ban(user);
    const api = new Api(baseUrl);
    expectError(await api.post("/api/auth/login-email", { email: user.email, password: user.password }), 403, BAN_TEXT);
    // Неверный пароль у заблокированного — всё равно 401, бан не раскрывается.
    expectError(await api.post("/api/auth/login-email", { email: user.email, password: "wrong-1" }), 401, "Неверный email или пароль");
    expectError(await api.post("/api/auth/recover/pair/check", { email: user.email, phone: user.phone }), 403, BAN_TEXT);
    expectError(await api.post("/api/auth/recover/pair/reset", { email: user.email, phone: user.phone, password: "new-pass-1" }), 403, BAN_TEXT);
    expect(expectOk(await api.post("/api/auth/recover/phone/start", { phone: user.phone }), recoverSentBody)).toEqual({ ok: true, sent: true });
    // Вход кодом: ответ тот же, что и всем (бан не раскрывается), но код в чат не уходит.
    expectOk(await api.post("/api/auth/code/start", { phone: user.phone }), okBody);
    await unban(user);
    expect(await countSystem(user.api, (t) => t.startsWith("🔢"))).toBe(0);
  });

  test("QR, подтверждённый до бана, отдаёт status=banned", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    const tv = new Api(baseUrl);
    const { token } = expectOk(await tv.post("/api/auth/qr/start"), qrStartBody);
    expectOk(await user.api.post("/api/auth/qr/confirm", { token }), okBody);
    await ban(user);
    expect(expectOk(await tv.get("/api/auth/qr/poll", { query: { token } }), qrPollBody)).toEqual({ status: "banned", error: BAN_TEXT });
    expect(tv.cookies.has("session_uids")).toBe(false);
  });

  test("бан между первым и вторым шагом входа — 403 и билет сгорает", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    const { secret } = expectOk(await user.api.post("/api/auth/2fa/setup", {}), totpSetupBody);
    expectOk(await user.api.post("/api/auth/2fa/enable", { code: totp(secret) }), twoFactorEnabledBody);
    const device = new Api(baseUrl);
    const { ticket } = expectOk(await device.post("/api/auth/login-email", { email: user.email, password: user.password }), twoFactorChallenge);
    await ban(user);
    expectError(await device.post("/api/auth/2fa/login", { ticket, code: totp(secret) }), 403, BAN_TEXT);
    await unban(user);
    expectError(await device.post("/api/auth/2fa/login", { ticket, code: totp(secret) }), 400, "Время на ввод кода истекло — войдите заново");
  });

  test("причина обрезается по краям и попадает в текст ошибки входа", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    await ban(user, "  нарушение правил  ");
    expectError(
      await new Api(baseUrl).post("/api/auth/login-email", { email: user.email, password: user.password }),
      403,
      "Аккаунт заблокирован администрацией Shalter. Причина: нарушение правил"
    );
  });
});
