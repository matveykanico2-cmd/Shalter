// Восстановление доступа: по паре «почта + телефон» и по коду из чата «Shalter».
import { describe, expect, test } from "vitest";
import { loginBody, pairCheckBody, recoverSentBody, sessionBody, totpSetupBody, twoFactorEnabledBody, userBody } from "../../schemas/auth";
import { Api } from "../../support/client";
import { expectError, expectOk } from "../../support/expect";
import { login, registerUser, type TestUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { countSystem, lastCode, lastMailCode, readOutbox, waitSystemMessage } from "./helpers";
import { totp } from "./totp";

const server = useServer();

const PAIR_CODE_SUBJECT = "Код для восстановления доступа к Shalter";

const TWO_FA_PAIR =
  "На аккаунте включена двухфакторная аутентификация — этот способ для него отключён. Войдите с кодом или используйте код восстановления.";

async function withTotp(user: TestUser) {
  const { secret } = expectOk(await user.api.post("/api/auth/2fa/setup", {}), totpSetupBody);
  expectOk(await user.api.post("/api/auth/2fa/enable", { code: totp(secret) }), twoFactorEnabledBody);
}

describe("POST /api/auth/recover/pair/check", () => {
  test("ошибки проверки и успех", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl, { name: "Мария" });
    const other = await registerUser(baseUrl);
    const api = new Api(baseUrl);
    expectError(await api.post("/api/auth/recover/pair/check", { email: "bad", phone: user.phone }), 400, "Введите корректный адрес почты");
    expectError(await api.post("/api/auth/recover/pair/check", { email: user.email, phone: "+7999" }), 400, "Введите номер телефона полностью");
    expectError(await api.post("/api/auth/recover/pair/check", {}), 400, "Введите корректный адрес почты");
    expectError(await api.post("/api/auth/recover/pair/check", { email: user.email, phone: other.phone }), 400, "Почта и телефон не совпадают ни с одним аккаунтом");
    expectError(await api.post("/api/auth/recover/pair/check", { email: "nobody@test.invalid", phone: user.phone }), 400, "Почта и телефон не совпадают ни с одним аккаунтом");

    const ok = expectOk(await api.post("/api/auth/recover/pair/check", { email: ` ${user.email.toUpperCase()} `, phone: user.phone }), pairCheckBody);
    expect(ok).toEqual({ ok: true, name: "Мария" });
    // Проверка сессию не создаёт, а шлёт код на адрес аккаунта — почта и номер не секреты.
    expect(api.cookies.has("session_uids")).toBe(false);
    const { dataDir } = server();
    if (dataDir) {
      const mail = readOutbox(dataDir).filter((m) => m.to === user.email && m.subject === PAIR_CODE_SUBJECT).at(-1);
      expect(mail?.text).toMatch(
        /^Код для смены пароля в Shalter: \d{6}\n\nНикому не сообщайте его — даже сотрудникам Shalter\. Действует 15 минут\.\n\nЕсли вы не запрашивали восстановление доступа — просто проигнорируйте письмо, пароль останется прежним\.\n?$/
      );
      // Ошибочные проверки писем не шлют.
      expect(readOutbox(dataDir).filter((m) => m.to === other.email)).toEqual([]);
    }
  });

  test("с включённой 2FA способ отключён — 409", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    await withTotp(user);
    expectError(await new Api(baseUrl).post("/api/auth/recover/pair/check", { email: user.email, phone: user.phone }), 409, TWO_FA_PAIR);
    expectError(await new Api(baseUrl).post("/api/auth/recover/pair/reset", { email: user.email, phone: user.phone, password: "new-pass-1" }), 409, TWO_FA_PAIR);
  });
});

describe("POST /api/auth/recover/pair/reset", () => {
  test("ошибки проверки", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    const api = new Api(baseUrl);
    // Длина пароля проверяется первой.
    expectError(await api.post("/api/auth/recover/pair/reset", { email: "bad", phone: "1", password: "123" }), 400, "Пароль — не короче 6 символов");
    expectError(await api.post("/api/auth/recover/pair/reset", { email: user.email, phone: "+70000000000", password: "new-pass-1" }), 400, "Почта и телефон не совпадают ни с одним аккаунтом");
    // Без кода из письма (или с неверным) пароль не меняется.
    const NO_CODE = "Неверный или устаревший код из письма";
    expectError(await api.post("/api/auth/recover/pair/reset", { email: user.email, phone: user.phone, password: "new-pass-1" }), 400, NO_CODE);
    expectOk(await api.post("/api/auth/recover/pair/check", { email: user.email, phone: user.phone }), pairCheckBody);
    expectError(await api.post("/api/auth/recover/pair/reset", { email: user.email, phone: user.phone, password: "new-pass-1", code: "12345" }), 400, NO_CODE);
    const { dataDir } = server();
    if (dataDir) {
      // Вместе с «12345» выше — 5 неверных попыток: код сгорает, верный уже не подходит.
      const code = lastMailCode(dataDir, user.email, PAIR_CODE_SUBJECT);
      const wrong = code === "000000" ? "111111" : "000000";
      for (let i = 0; i < 4; i++) {
        expectError(await api.post("/api/auth/recover/pair/reset", { email: user.email, phone: user.phone, password: "new-pass-1", code: wrong }), 400, NO_CODE);
      }
      expectError(await api.post("/api/auth/recover/pair/reset", { email: user.email, phone: user.phone, password: "new-pass-1", code }), 400, NO_CODE);
    }
    await login(baseUrl, user); // пароль прежний
  });

  test("успех: пароль сменён, все сеансы завершены, вход на этом устройстве, оповещение в чат и письмо", async () => {
    const { baseUrl, dataDir } = server();
    // Код приходит только письмом — без каталога данных его не прочитать.
    if (!dataDir) return;
    const user = await registerUser(baseUrl);
    const old = await login(baseUrl, user);
    const device = new Api(baseUrl);

    // Почты и номера мало (номер при регистрации не подтверждается) — нужен код из письма на адрес аккаунта.
    expectOk(await device.post("/api/auth/recover/pair/check", { email: user.email, phone: user.phone }), pairCheckBody);
    const code = lastMailCode(dataDir, user.email, PAIR_CODE_SUBJECT);
    const body = expectOk(await device.post("/api/auth/recover/pair/reset", { email: user.email, phone: user.phone, password: "new-pass-1", code: ` ${code} ` }), userBody);
    expect(body.user.id).toBe(user.id);
    expect(expectOk(await device.get("/api/auth/session"), sessionBody).user?.id).toBe(user.id);

    expectError(await user.api.get("/api/chats"), 401, "session_revoked");
    expectError(await old.get("/api/chats"), 401, "session_revoked");

    const msg = await waitSystemMessage(device, (t) => t.includes("восстановление по почте"));
    expect(msg.text).toMatch(
      /^🔐 Пароль изменён через восстановление по почте и номеру телефона \(\d{2}\.\d{2}, \d{2}:\d{2}\)\. Все сеансы завершены\.\n\nЕсли это были не вы — восстановите доступ и включите двухфакторную аутентификацию: Настройки → Конфиденциальность\. С ней этот способ восстановления не работает\.$/
    );
    // Одно оповещение — от входа old; сам сброс не шлёт «новый вход»: к моменту
    // записи сеанса все прежние уже отозваны.
    expect(await countSystem(device, (t) => t.startsWith("🔐 Выполнен вход"))).toBe(1);

    {
      const mail = await waitMailWithSubject(dataDir, user.email, "Пароль в Shalter изменён");
      expect(mail.text).toMatch(/^Пароль вашего аккаунта Shalter изменён \d{2}\.\d{2}, \d{2}:\d{2} через восстановление по адресу почты и номеру телефона\./);
    }

    expectError(await new Api(baseUrl).post("/api/auth/login-email", { email: user.email, password: user.password }), 401, "Неверный email или пароль");
    expectOk(await new Api(baseUrl).post("/api/auth/login-email", { email: user.email, password: "new-pass-1" }), loginBody);
    // Код одноразовый.
    expectError(
      await new Api(baseUrl).post("/api/auth/recover/pair/reset", { email: user.email, phone: user.phone, password: "new-pass-2", code }),
      400,
      "Неверный или устаревший код из письма"
    );
  });
});

/** Письмо «Пароль изменён» уходит без ожидания ответа маршрута — ждём его по теме. */
async function waitMailWithSubject(dataDir: string, to: string, subject: string, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const hit = readOutbox(dataDir).find((m) => m.to === to && m.subject === subject);
    if (hit) return hit;
    if (Date.now() > deadline) throw new Error(`письмо «${subject}» для ${to} не появилось в outbox`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe("восстановление по коду из чата: /api/auth/recover/phone/*", () => {
  test("start: ошибки, неизвестный номер не раскрывается, 2FA — 409", async () => {
    const { baseUrl } = server();
    const api = new Api(baseUrl);
    expectError(await api.post("/api/auth/recover/phone/start", { phone: "12" }), 400, "Введите номер телефона полностью");
    expectError(await api.post("/api/auth/recover/phone/start", {}), 400, "Введите номер телефона полностью");
    expect(expectOk(await api.post("/api/auth/recover/phone/start", { phone: "+70000000001" }), recoverSentBody)).toEqual({ ok: true, sent: true });

    const user = await registerUser(baseUrl);
    await withTotp(user);
    expectError(
      await api.post("/api/auth/recover/phone/start", { phone: user.phone }),
      409,
      "На аккаунте включена двухфакторная аутентификация — войдите с кодом из приложения или используйте код восстановления."
    );
  });

  test("verify: ошибки и успешная смена пароля со входом", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    const device = new Api(baseUrl);
    expectOk(await device.post("/api/auth/recover/phone/start", { phone: user.phone }), recoverSentBody);
    const msg = await waitSystemMessage(user.api, (t) => t.startsWith("🔢 Код для смены пароля:"));
    expect(msg.text).toMatch(
      /^🔢 Код для смены пароля: \d{6}\n\nНикому не сообщайте его — даже сотрудникам Shalter\. Действует 5 минут\.\n\nЕсли вы не запрашивали смену пароля — просто не вводите код, пароль останется прежним\.$/
    );
    const code = await lastCode(user.api, "🔢 Код для смены пароля:");
    const wrong = code === "000000" ? "111111" : "000000";

    expectError(await device.post("/api/auth/recover/phone/verify", { phone: user.phone, code, password: "123" }), 400, "Пароль — не короче 6 символов");
    expectError(await device.post("/api/auth/recover/phone/verify", { phone: user.phone, code: wrong, password: "new-pass-1" }), 400, "Неверный или устаревший код");
    expectError(await device.post("/api/auth/recover/phone/verify", { phone: "+70000000002", code, password: "new-pass-1" }), 400, "Неверный или устаревший код");

    const body = expectOk(await device.post("/api/auth/recover/phone/verify", { phone: user.phone, code, password: "new-pass-1" }), loginBody);
    expect(body).toMatchObject({ alreadyLinked: false, user: { id: user.id } });
    expectError(await user.api.get("/api/chats"), 401, "session_revoked");
    const notice = await waitSystemMessage(device, (t) => t.startsWith("🔐 Пароль изменён по коду"));
    expect(notice.text).toBe(
      "🔐 Пароль изменён по коду из этого чата, все остальные сеансы завершены.\n\nЕсли это были не вы — смените пароль и включите двухфакторную аутентификацию: Настройки → Конфиденциальность."
    );
    expectOk(await new Api(baseUrl).post("/api/auth/login-email", { email: user.email, password: "new-pass-1" }), loginBody);
    // Код одноразовый.
    expectError(await new Api(baseUrl).post("/api/auth/recover/phone/verify", { phone: user.phone, code, password: "new-pass-2" }), 400, "Неверный или устаревший код");
  });
});
