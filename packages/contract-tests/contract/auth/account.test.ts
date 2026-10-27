// Смена пароля, смена почты и удаление аккаунта.
import { afterAll, describe, expect, test } from "vitest";
import { okBody } from "../../schemas/common";
import { emailChangeSentBody, emailChangedBody, loginBody, remainingBody, sessionBody, sessionsBody, userBody, usernameAvailableBody } from "../../schemas/auth";
import { Api } from "../../support/client";
import { expectError, expectOk } from "../../support/expect";
import { createDm, createGroup, login, registerUser, sendText, uniq, uniqPhone } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { connectWs, type WsClient } from "../../support/ws";
import { SYSTEM_BOT_ID, lastMailCode, readOutbox } from "./helpers";

const server = useServer();
const sockets: WsClient[] = [];
afterAll(async () => {
  await Promise.all(sockets.map((s) => s.close()));
});

describe("POST /api/auth/change-password", () => {
  test("401 без сессии и ошибки проверки", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    expectError(await new Api(baseUrl).post("/api/auth/change-password", { currentPassword: user.password, newPassword: "another1" }), 401, "unauthorized");
    expectError(await user.api.post("/api/auth/change-password", { currentPassword: "wrong-1", newPassword: "another1" }), 401, "Неверный текущий пароль");
    expectError(await user.api.post("/api/auth/change-password", {}), 401, "Неверный текущий пароль");
    expectError(await user.api.post("/api/auth/change-password", { currentPassword: user.password, newPassword: "12345" }), 400, "Новый пароль — не короче 6 символов");
    expectError(await user.api.post("/api/auth/change-password", { currentPassword: user.password, newPassword: user.password }), 400, "Новый пароль совпадает со старым");
    // Пароль не сменился.
    await login(baseUrl, user);
  });

  test("успех: остальные сеансы завершены, текущий жив, оповещение от «Shalter», вход новым паролем", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    const other = await login(baseUrl, user);
    const ws = await connectWs(user.api);
    sockets.push(ws);

    expectOk(await user.api.post("/api/auth/change-password", { currentPassword: user.password, newPassword: "brand-new-1" }), okBody);

    const event = await ws.waitFor("message:new", (e) => e.message?.senderId === SYSTEM_BOT_ID && e.message.text.startsWith("🔐 Пароль изменён"));
    expect(event.message.text).toBe(
      "🔐 Пароль изменён. Все остальные сеансы завершены.\n\nЕсли это были не вы — восстановите доступ и включите двухфакторную аутентификацию: Настройки → Конфиденциальность."
    );
    expectError(await other.get("/api/chats"), 401, "session_revoked");
    expect((await user.api.get("/api/chats")).status).toBe(200);
    const sessions = expectOk(await user.api.get("/api/sessions"), sessionsBody).sessions;
    expect(sessions).toHaveLength(1);

    expectError(await new Api(baseUrl).post("/api/auth/login-email", { email: user.email, password: user.password }), 401, "Неверный email или пароль");
    expectOk(await new Api(baseUrl).post("/api/auth/login-email", { email: user.email, password: "brand-new-1" }), loginBody);
  });
});

describe("POST /api/auth/email/start", () => {
  test("401 без сессии и ошибки проверки", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    const other = await registerUser(baseUrl);
    const fresh = `${uniq("e")}@test.invalid`;
    expectError(await new Api(baseUrl).post("/api/auth/email/start", { email: fresh, password: user.password }), 401, "unauthorized");
    expectError(await user.api.post("/api/auth/email/start", { email: fresh, password: "wrong-1" }), 401, "Неверный пароль");
    expectError(await user.api.post("/api/auth/email/start", { email: "broken", password: user.password }), 400, "Введите корректный адрес почты");
    expectError(await user.api.post("/api/auth/email/start", { password: user.password }), 400, "Введите корректный адрес почты");
    expectError(await user.api.post("/api/auth/email/start", { email: ` ${user.email.toUpperCase()} `, password: user.password }), 400, "Это уже ваш адрес");
    expectError(await user.api.post("/api/auth/email/start", { email: other.email, password: user.password }), 409, "Этот адрес уже привязан к другому аккаунту");
  });

  test("успех: код уходит на новый адрес, адрес меняется только после /email/verify", async () => {
    const { baseUrl, dataDir } = server();
    const user = await registerUser(baseUrl);
    const ws = await connectWs(user.api);
    sockets.push(ws);
    const handle = uniq("New");
    const next = `${handle.toLowerCase()}@test.invalid`;
    const res = await user.api.post("/api/auth/email/start", { email: ` ${handle}@Test.Invalid `, password: user.password });
    expect(expectOk(res, emailChangeSentBody)).toEqual({ ok: true, sent: true, email: next });

    // До подтверждения адрес прежний: вход по старому работает, по новому — нет.
    expect(expectOk(await user.api.get("/api/auth/session"), sessionBody).user?.email).toBe(user.email);
    expectError(await new Api(baseUrl).post("/api/auth/login-email", { email: next, password: user.password }), 401, "Неверный email или пароль");

    expectError(await new Api(baseUrl).post("/api/auth/email/verify", { code: "123456" }), 401, "unauthorized");
    expectError(await user.api.post("/api/auth/email/verify", {}), 400, "Неверный или устаревший код");
    // Код приходит только письмом — без каталога данных дальше не пройти.
    if (!dataDir) return;
    const mail = readOutbox(dataDir).filter((m) => m.to === next);
    expect(mail).toHaveLength(1);
    expect(mail[0].subject).toBe("Подтвердите адрес почты в Shalter");
    expect(mail[0].text).toMatch(
      /^Код для привязки этого адреса к аккаунту Shalter: \d{6}\n\nНикому не сообщайте его — даже сотрудникам Shalter\. Действует 15 минут\.\n\nЕсли вы не меняли адрес почты — просто проигнорируйте письмо\.\n?$/
    );
    const code = lastMailCode(dataDir, next, "Подтвердите адрес почты в Shalter");
    expectError(await user.api.post("/api/auth/email/verify", { code: code === "000000" ? "111111" : "000000" }), 400, "Неверный или устаревший код");

    const body = expectOk(await user.api.post("/api/auth/email/verify", { code: ` ${code} ` }), emailChangedBody);
    expect(body.user).toMatchObject({ id: user.id, email: next });
    const event = await ws.waitFor("message:new", (e) => e.message?.senderId === SYSTEM_BOT_ID);
    expect(event.message.text).toBe(`📧 Адрес почты изменён на ${next}.\n\nЕсли это были не вы — немедленно смените пароль.`);
    expect(expectOk(await user.api.get("/api/auth/session"), sessionBody).user?.email).toBe(next);
    // Код одноразовый.
    expectError(await user.api.post("/api/auth/email/verify", { code }), 400, "Неверный или устаревший код");

    expectError(await new Api(baseUrl).post("/api/auth/login-email", { email: user.email, password: user.password }), 401, "Неверный email или пароль");
    expectOk(await new Api(baseUrl).post("/api/auth/login-email", { email: next, password: user.password }), loginBody);
  });

  test("адрес, занятый пока ждали код, — 409 на /email/verify", async () => {
    const { baseUrl, dataDir } = server();
    if (!dataDir) return;
    const user = await registerUser(baseUrl);
    const next = `${uniq("race").toLowerCase()}@test.invalid`;
    expectOk(await user.api.post("/api/auth/email/start", { email: next, password: user.password }), emailChangeSentBody);
    const code = lastMailCode(dataDir, next, "Подтвердите адрес почты в Shalter");
    expectOk(
      await new Api(baseUrl).post("/api/auth/register-email", { name: "Б", email: next, password: "secret123", phone: uniqPhone(), username: uniq("b") }),
      userBody
    );
    expectError(await user.api.post("/api/auth/email/verify", { code }), 409, "Этот адрес уже привязан к другому аккаунту");
    expect(expectOk(await user.api.get("/api/auth/session"), sessionBody).user?.email).toBe(user.email);
  });
});

describe("POST /api/auth/delete-account", () => {
  test("401 без сессии и при неверном пароле", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    expectError(await new Api(baseUrl).post("/api/auth/delete-account", { password: user.password }), 401, "unauthorized");
    expectError(await user.api.post("/api/auth/delete-account", { password: "wrong-1" }), 401, "Неверный пароль");
    expectError(await user.api.post("/api/auth/delete-account", {}), 401, "Неверный пароль");
    expect((await user.api.get("/api/chats")).status).toBe(200);
  });

  test("успех: аккаунт, сеансы и личные чаты удалены; группа осталась у остальных", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    const friend = await registerUser(baseUrl);
    const otherDevice = await login(baseUrl, user);
    const dm = await createDm(user, friend);
    await sendText(user, dm.id, "пока");
    const group = await createGroup(user, [friend]);

    const body = expectOk(await user.api.post("/api/auth/delete-account", { password: user.password }), remainingBody);
    expect(body).toEqual({ ok: true, remaining: [] });
    expect(user.api.cookies.has("session_uids")).toBe(false);

    expectError(await otherDevice.get("/api/chats"), 401, "session_revoked");
    expectError(await new Api(baseUrl).post("/api/auth/login-email", { email: user.email, password: user.password }), 401, "Неверный email или пароль");
    // Юзернейм освободился.
    expect(expectOk(await new Api(baseUrl).get("/api/auth/username-available", { query: { u: user.username } }), usernameAvailableBody).available).toBe(true);

    const chats = (await friend.api.get("/api/chats")).body.chats.map((c: any) => c.id);
    expect(chats).not.toContain(dm.id);
    expect(chats).toContain(group.id);
    const card = await friend.api.get(`/api/chats/${group.id}`);
    expect(card.body.chat.memberIds).toEqual([friend.id]);
    expect(card.body.chat.ownerId).toBe(friend.id);
  });

  test("на устройстве с двумя аккаунтами остаётся второй", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const handle = uniq("b");
    const b = expectOk(
      await a.api.post("/api/auth/register-email", { name: "Б", email: `${handle}@test.invalid`, password: "secret123", phone: uniqPhone(), username: handle }),
      userBody
    ).user;
    const body = expectOk(await a.api.post("/api/auth/delete-account", { password: "secret123" }), remainingBody);
    expect(body.remaining).toEqual([a.id]);
    const session = expectOk(await a.api.get("/api/auth/session"), sessionBody);
    expect(session.user?.id).toBe(a.id);
    expect(session.accounts.map((u) => u.id)).toEqual([a.id]);
    expectError(await new Api(baseUrl).post("/api/auth/login-email", { email: `${handle}@test.invalid`, password: "secret123" }), 401, "Неверный email или пароль");
    void b;
  });
});
