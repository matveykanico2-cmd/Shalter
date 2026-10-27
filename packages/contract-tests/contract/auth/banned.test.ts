// Заблокированный аккаунт, как в Telegram: войти можно (любым способом), но все
// защищённые маршруты отвечают 403 banned с причиной и сроком — клиент показывает
// экран блокировки. Восстановление пароля закрыто. Блокировка на срок снимается сама.
// Блокирует главный админ — сервер с PREMIUM_ADMIN_PHONE.
import { afterAll, describe, expect, test } from "vitest";
import { bannedBody, loginBody, qrPollBody, qrStartBody, recoverSentBody, sessionBody, totpSetupBody, twoFactorChallenge, twoFactorEnabledBody } from "../../schemas/auth";
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

async function ban(user: TestUser, reason = "спам", extra: Record<string, unknown> = {}) {
  const res = await (await getAdmin()).api.post(`/api/admin/users/${user.id}/ban`, { banned: true, reason, ...extra });
  expect(res.status, res.text).toBe(200);
  return res.body.user;
}

async function expectBanned(api: Api, banReason = "спам") {
  const res = await api.get("/api/chats");
  expect(res.status).toBe(403);
  return expect(expectShape(bannedBody, res.body)).toMatchObject({ error: "banned", banReason });
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
  test("403 banned с причиной и сроком на защищённых маршрутах, сокет закрыт, после разбана — снова доступ", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    const ws = await connectWs(user.api);
    sockets.push(ws);
    await ban(user);

    const res = await user.api.get("/api/chats");
    expect(res.status).toBe(403);
    const body = expectShape(bannedBody, res.body);
    expect(body).toEqual({ error: "banned", banReason: "спам", bannedAt: expect.any(String), bannedUntil: null });
    expect(Date.now() - Date.parse(body.bannedAt!)).toBeLessThan(60_000);
    expect((await user.api.get("/api/sessions")).status).toBe(403);
    expect((await user.api.post("/api/auth/verify-password", { password: user.password })).status).toBe(403);
    // GET /session бан не проверяет — клиент видит isBanned у себя.
    expect(expectOk(await user.api.get("/api/auth/session"), sessionBody).user).toMatchObject({ id: user.id, isBanned: true });

    const closed = await Promise.race([ws.closed, new Promise<never>((_, r) => setTimeout(() => r(new Error("сокет не закрыт")), 4000))]);
    expect(closed).toEqual({ code: 4001, reason: "session_revoked" });

    await unban(user);
    expect((await user.api.get("/api/chats")).status).toBe(200);
  });

  test("вход паролем пускает в аккаунт (дальше — 403 banned), выход работает; восстановление пароля закрыто", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    await ban(user);
    const api = new Api(baseUrl);
    // Неверный пароль у заблокированного — 401, как у всех.
    expectError(await api.post("/api/auth/login-email", { email: user.email, password: "wrong-1" }), 401, "Неверный email или пароль");
    expect(expectOk(await api.post("/api/auth/login-email", { email: user.email, password: user.password }), loginBody).user).toMatchObject({ id: user.id });
    expect(JSON.parse(api.cookies.get("session_uids")!)).toEqual([user.id]);
    await expectBanned(api);
    // «Назад» на экране блокировки — обычный выход.
    expect((await api.post("/api/auth/logout", {})).body).toEqual({ ok: true, remaining: [] });
    expect((await api.get("/api/chats")).status).toBe(401);

    expectError(await api.post("/api/auth/recover/pair/check", { email: user.email, phone: user.phone }), 403, BAN_TEXT);
    expectError(await api.post("/api/auth/recover/pair/reset", { email: user.email, phone: user.phone, password: "new-pass-1" }), 403, BAN_TEXT);
    expect(expectOk(await api.post("/api/auth/recover/phone/start", { phone: user.phone }), recoverSentBody)).toEqual({ ok: true, sent: true });
    // Код для входа заблокированному приходит (войти он может), код смены пароля — нет.
    expectOk(await api.post("/api/auth/code/start", { phone: user.phone }), okBody);
    await unban(user);
    expect(await countSystem(user.api, (t) => t.startsWith("🔢 Код для входа"))).toBe(1);
    expect(await countSystem(user.api, (t) => t.startsWith("🔢 Код для смены пароля"))).toBe(0);
  });

  test("QR, подтверждённый до бана, входит в аккаунт — дальше 403 banned", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    const tv = new Api(baseUrl);
    const { token } = expectOk(await tv.post("/api/auth/qr/start"), qrStartBody);
    expectOk(await user.api.post("/api/auth/qr/confirm", { token }), okBody);
    await ban(user);
    expect(expectOk(await tv.get("/api/auth/qr/poll", { query: { token } }), qrPollBody)).toMatchObject({ status: "confirmed", user: { id: user.id } });
    await expectBanned(tv);
  });

  test("бан между первым и вторым шагом входа — второй шаг пускает, дальше 403 banned", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    const { secret } = expectOk(await user.api.post("/api/auth/2fa/setup", {}), totpSetupBody);
    expectOk(await user.api.post("/api/auth/2fa/enable", { code: totp(secret) }), twoFactorEnabledBody);
    const device = new Api(baseUrl);
    const { ticket } = expectOk(await device.post("/api/auth/login-email", { email: user.email, password: user.password }), twoFactorChallenge);
    await ban(user);
    // Код следующего шага: код текущего уже потрачен на включение 2FA.
    expect(expectOk(await device.post("/api/auth/2fa/login", { ticket, code: totp(secret, Date.now(), 1) }), loginBody).user).toMatchObject({ id: user.id });
    await expectBanned(device);
  });

  test("причина обрезается по краям", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    await ban(user, "  нарушение правил  ");
    await expectBanned(user.api, "нарушение правил");
  });
});

describe("блокировка на срок", () => {
  test("срок — в ответе админу, в 403 и в сообщении бота; истёкшая блокировка снимается сама", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    const peer = await registerUser(baseUrl);
    const before = Date.now();
    const label = await ban(user, "флуд", { durationSec: 3600 });
    const until = Date.parse(label.bannedUntil);
    expect(until - before).toBeGreaterThanOrEqual(3600_000 - 5_000);
    expect(until - before).toBeLessThan(3600_000 + 5_000);
    const res = await user.api.get("/api/chats");
    expect(expectShape(bannedBody, res.body)).toMatchObject({ banReason: "флуд", bannedUntil: label.bannedUntil });
    // Бессрочная блокировка — «навсегда», на срок — «до …».
    await unban(user);
    expect(await countSystem(user.api, (t) => /^🚫 Ваш аккаунт заблокирован администрацией Shalter до \d{2}\.\d{2}\.\d{4}, \d{2}:\d{2} \(МСК\)\.\nПричина: флуд$/.test(t))).toBe(1);

    // Секундная блокировка истекает без участия админа: доступ, поиск и список админа.
    await ban(user, "флуд", { durationSec: 1 });
    await expectBanned(user.api, "флуд");
    await new Promise((r) => setTimeout(r, 1_200));
    expect((await user.api.get("/api/chats")).status).toBe(200);
    expect((await user.api.get("/api/auth/session")).body.user.isBanned).toBe(false);
    expect((await peer.api.get("/api/search", { query: { q: user.name } })).body.users.map((u: { id: string }) => u.id)).toContain(user.id);
    const dash = (await (await getAdmin()).api.get("/api/admin/moderation")).body;
    expect(dash.banned.map((u: { id: string }) => u.id)).not.toContain(user.id);
  });

  test("некорректный срок — 400, блокировка не ставится", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    const admin = await getAdmin();
    for (const durationSec of [0, -5, 1.5, "3600", 11 * 365 * 24 * 3600]) {
      expectError(
        await admin.api.post(`/api/admin/users/${user.id}/ban`, { banned: true, reason: "x", durationSec }),
        400,
        "Срок блокировки — целое число секунд, не больше 10 лет"
      );
    }
    expect((await user.api.get("/api/chats")).status).toBe(200);
  });
});

describe("заблокированный и поиск по номерам", () => {
  test("POST /api/contacts/match: заблокированного не находят — он в notFound; после снятия блокировки — снова находят", async () => {
    const [seeker, target] = [await registerUser(server().baseUrl), await registerUser(server().baseUrl)];
    await ban(target);
    let res = await seeker.api.post("/api/contacts/match", { contacts: [{ phone: target.phone, name: "Т" }] });
    expect(res.body).toEqual({ found: [], notFound: [{ phone: target.phone, name: "Т" }], checked: 1 });
    await unban(target);
    res = await seeker.api.post("/api/contacts/match", { contacts: [{ phone: target.phone, name: "Т" }] });
    expect(res.body.found.map((f: { user: { id: string } }) => f.user.id)).toEqual([target.id]);
  });
});
