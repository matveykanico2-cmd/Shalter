// Вход по коду из чата «Shalter» (code/start → code/verify) и по QR-коду
// (qr/start → qr/poll → qr/confirm с уже вошедшего устройства).
import { describe, expect, test } from "vitest";
import { okBody } from "../../schemas/common";
import { loginBody, qrPollBody, qrStartBody, sessionBody } from "../../schemas/auth";
import { Api } from "../../support/client";
import { expectError, expectOk } from "../../support/expect";
import { registerUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { SYSTEM_BOT_ID, countSystem, lastCode, waitSystemMessage } from "./helpers";

const server = useServer();

const LOGIN_CODE = "🔢 Код для входа в Shalter:";

describe("вход по коду: /api/auth/code/start + /api/auth/code/verify", () => {
  test("code/start: неизвестный номер — 404", async () => {
    const api = new Api(server().baseUrl);
    expectError(await api.post("/api/auth/code/start", { phone: "+70000000000" }), 404, "Аккаунт с таким номером не найден");
    expectError(await api.post("/api/auth/code/start", {}), 404, "Аккаунт с таким номером не найден");
  });

  test("код приходит в чат «Shalter», вход с нового устройства, повторно код не работает", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    const device = new Api(baseUrl);
    // Номер можно ввести с пробелами, скобками и дефисами.
    const spaced = `${user.phone.slice(0, 2)} (${user.phone.slice(2, 5)}) ${user.phone.slice(5, 8)}-${user.phone.slice(8)}`;
    expectOk(await device.post("/api/auth/code/start", { phone: spaced }), okBody);

    const msg = await waitSystemMessage(user.api, (t) => t.startsWith(LOGIN_CODE));
    expect(msg.text).toMatch(/^🔢 Код для входа в Shalter: \d{6}\n\nНикому не сообщайте его — даже сотрудникам Shalter\. Действует 5 минут\.$/);
    const code = /(\d{6})/.exec(msg.text)![1];

    expectError(await device.post("/api/auth/code/verify", { phone: user.phone, code: code === "000000" ? "111111" : "000000" }), 401, "Неверный или устаревший код");
    expectError(await device.post("/api/auth/code/verify", { phone: "+70000000000", code }), 401, "Неверный или устаревший код");
    const body = expectOk(await device.post("/api/auth/code/verify", { phone: spaced, code: ` ${code} ` }), loginBody);
    expect(body).toMatchObject({ alreadyLinked: false, user: { id: user.id } });
    expect(expectOk(await device.get("/api/auth/session"), sessionBody).user?.id).toBe(user.id);
    // Новое устройство — оповещение о входе.
    await waitSystemMessage(user.api, (t) => t.startsWith("🔐 Выполнен вход в аккаунт с нового устройства."));

    // Код одноразовый.
    expectError(await new Api(baseUrl).post("/api/auth/code/verify", { phone: user.phone, code }), 401, "Неверный или устаревший код");
  });

  test("после 5 неверных попыток код сгорает", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    const device = new Api(baseUrl);
    expectOk(await device.post("/api/auth/code/start", { phone: user.phone }), okBody);
    const code = await lastCode(user.api, LOGIN_CODE);
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) expectError(await device.post("/api/auth/code/verify", { phone: user.phone, code: wrong }), 401, "Неверный или устаревший код");
    expectError(await device.post("/api/auth/code/verify", { phone: user.phone, code }), 401, "Неверный или устаревший код");

    // Новый запрос выдаёт новый код, старый — недействителен.
    expectOk(await device.post("/api/auth/code/start", { phone: user.phone }), okBody);
    expect(await countSystem(user.api, (t) => t.startsWith(LOGIN_CODE))).toBe(2);
    const fresh = await lastCode(user.api, LOGIN_CODE);
    expectOk(await device.post("/api/auth/code/verify", { phone: user.phone, code: fresh }), loginBody);
  });
});

describe("вход по QR: /api/auth/qr/*", () => {
  test("qr/start — токен и ссылка; poll неизвестного токена — expired", async () => {
    const { baseUrl } = server();
    const tv = new Api(baseUrl);
    const start = expectOk(await tv.post("/api/auth/qr/start"), qrStartBody);
    expect(start.loginUrl).toBe(`${baseUrl}/qr-login?token=${start.token}`);
    expect(tv.cookies.get("device_id")).toMatch(/^[0-9a-f]{24}$/);
    expect(expectOk(await tv.get("/api/auth/qr/poll", { query: { token: start.token } }), qrPollBody)).toEqual({ status: "pending" });
    expect(expectOk(await tv.get("/api/auth/qr/poll", { query: { token: "deadbeef" } }), qrPollBody)).toEqual({ status: "expired" });
    expect(expectOk(await tv.get("/api/auth/qr/poll"), qrPollBody)).toEqual({ status: "expired" });
  });

  test("qr/confirm: 401 без сессии, 410 для неизвестного токена, 409 при повторе", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    const tv = new Api(baseUrl);
    const { token } = expectOk(await tv.post("/api/auth/qr/start"), qrStartBody);
    expectError(await new Api(baseUrl).post("/api/auth/qr/confirm", { token }), 401, "unauthorized");
    expectError(await user.api.post("/api/auth/qr/confirm", { token: "nope" }), 410, "QR-код устарел, обновите его на другом устройстве");
    expectError(await user.api.post("/api/auth/qr/confirm", {}), 410, "QR-код устарел, обновите его на другом устройстве");
    expectOk(await user.api.post("/api/auth/qr/confirm", { token }), okBody);
    expectError(await user.api.post("/api/auth/qr/confirm", { token }), 409, "Этот код уже использован");
  });

  test("подтверждение с телефона: вход получает только показавшее QR устройство, один раз", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    const tv = new Api(baseUrl);
    const { token } = expectOk(await tv.post("/api/auth/qr/start"), qrStartBody);
    expectOk(await user.api.post("/api/auth/qr/confirm", { token }), okBody);

    // Подсмотревший токен (другой device_id) получает expired, токен при этом не тратится.
    const spy = new Api(baseUrl);
    expect(expectOk(await spy.get("/api/auth/qr/poll", { query: { token } }), qrPollBody)).toEqual({ status: "expired" });
    expect(spy.cookies.has("session_uids")).toBe(false);

    const done = expectOk(await tv.get("/api/auth/qr/poll", { query: { token } }), qrPollBody);
    expect(done).toMatchObject({ status: "confirmed", user: { id: user.id, email: user.email } });
    expect(expectOk(await tv.get("/api/auth/session"), sessionBody).user?.id).toBe(user.id);
    const alert = await waitSystemMessage(user.api, (t) => t.startsWith("🔐 Выполнен вход в аккаунт с нового устройства."));
    expect(alert.senderId).toBe(SYSTEM_BOT_ID);

    // Токен израсходован.
    expect(expectOk(await tv.get("/api/auth/qr/poll", { query: { token } }), qrPollBody)).toEqual({ status: "expired" });
  });
});
