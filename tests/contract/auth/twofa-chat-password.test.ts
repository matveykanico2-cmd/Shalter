// Двухфакторная аутентификация кодом из чата «Shalter» и облачным паролем.
import { describe, expect, test } from "vitest";
import {
  chatSetupBody,
  cloudPasswordDisabledBody,
  cloudPasswordSetBody,
  hintBody,
  loginBody,
  sessionBody,
  totpSetupBody,
  twoFactorChallenge,
  twoFactorDisabledBody,
  twoFactorEnabledBody,
  twoFactorStatusBody,
} from "../../schemas/auth";
import { okBody } from "../../schemas/common";
import { Api } from "../../support/client";
import { expectError, expectOk } from "../../support/expect";
import { login, registerUser, type TestUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { countSystem, lastCode, waitSystemMessage } from "./helpers";
import { totp } from "./totp";

const server = useServer();

const CONFIRM_CODE = "🔢 Код подтверждения:";

async function startLogin(user: TestUser) {
  const api = new Api(server().baseUrl);
  const body = expectOk(await api.post("/api/auth/login-email", { email: user.email, password: user.password }), twoFactorChallenge);
  return { api, ticket: body.ticket, body };
}

describe("2FA кодом из чата", () => {
  test("setup присылает код; enable — неверный код, верный код", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    expect(expectOk(await user.api.post("/api/auth/2fa/setup", { method: "chat" }), chatSetupBody)).toEqual({ method: "chat" });
    const msg = await waitSystemMessage(user.api, (t) => t.startsWith(CONFIRM_CODE));
    expect(msg.text).toMatch(/^🔢 Код подтверждения: \d{6}\n\nНикому не сообщайте его — даже сотрудникам Shalter\. Действует 5 минут\.$/);
    expect(expectOk(await user.api.get("/api/auth/2fa"), twoFactorStatusBody)).toEqual({
      enabled: false,
      method: "chat",
      pending: false,
      cloudPasswordHint: "",
      recoveryCodesLeft: 0,
      enabledAt: null,
    });

    const code = /(\d{6})/.exec(msg.text)![1];
    expectError(
      await user.api.post("/api/auth/2fa/enable", { code: code === "000000" ? "111111" : "000000" }),
      400,
      "Неверный код или номер — введите код из чата либо номер телефона аккаунта"
    );
    const enabled = expectOk(await user.api.post("/api/auth/2fa/enable", { code }), twoFactorEnabledBody);
    expect(enabled.recoveryCodes).toHaveLength(8);
    expect(expectOk(await user.api.get("/api/auth/2fa"), twoFactorStatusBody)).toMatchObject({ enabled: true, method: "chat", recoveryCodesLeft: 8 });
  });

  test("enable можно подтвердить номером телефона аккаунта", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    expectOk(await user.api.post("/api/auth/2fa/setup", { method: "chat" }), chatSetupBody);
    const spaced = `${user.phone.slice(0, 2)} ${user.phone.slice(2, 5)} ${user.phone.slice(5)}`;
    expectOk(await user.api.post("/api/auth/2fa/enable", { code: spaced }), twoFactorEnabledBody);
    expect(expectOk(await user.api.get("/api/auth/session"), sessionBody).user).toMatchObject({ twoFactorEnabled: true, twoFactorMethod: "chat" });
  });

  test("вход: код уходит в чат сам, send-code присылает новый, отключение кодом из чата", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    expectOk(await user.api.post("/api/auth/2fa/setup", { method: "chat" }), chatSetupBody);
    expectOk(await user.api.post("/api/auth/2fa/enable", { code: user.phone }), twoFactorEnabledBody);
    const sentBefore = await countSystem(user.api, (t) => t.startsWith(CONFIRM_CODE));

    const { api, ticket, body } = await startLogin(user);
    expect(body).toMatchObject({ method: "chat", hint: null, name: user.name });
    expect(await countSystem(user.api, (t) => t.startsWith(CONFIRM_CODE))).toBe(sentBefore + 1);
    const firstCode = await lastCode(user.api, CONFIRM_CODE);

    // Повторная отправка по билету — новый код, прежний больше не подходит.
    expectOk(await api.post("/api/auth/2fa/send-code", { ticket }), okBody);
    expect(await countSystem(user.api, (t) => t.startsWith(CONFIRM_CODE))).toBe(sentBefore + 2);
    const secondCode = await lastCode(user.api, CONFIRM_CODE);
    if (firstCode !== secondCode) {
      const res = await api.post("/api/auth/2fa/login", { ticket, code: firstCode });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "Неверный код. Осталось попыток: 4", attemptsLeft: 4 });
    }
    expectOk(await api.post("/api/auth/2fa/login", { ticket, code: secondCode }), loginBody);

    // Отключение: неверный код, затем код, присланный по send-code с сессией.
    expectError(await user.api.post("/api/auth/2fa/disable", { code: "abc" }), 400, "Неверный код — введите код из чата или код восстановления");
    expectOk(await user.api.post("/api/auth/2fa/send-code", {}), okBody);
    const disableCode = await lastCode(user.api, CONFIRM_CODE);
    expect(expectOk(await user.api.post("/api/auth/2fa/disable", { code: disableCode }), twoFactorDisabledBody)).toEqual({ enabled: false });
    expect(expectOk(await user.api.get("/api/auth/2fa"), twoFactorStatusBody)).toMatchObject({ enabled: false, method: "totp" });
  });
});

describe("2FA облачным паролем", () => {
  test("ошибки проверки — точные тексты", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    const post = (body: Record<string, unknown>) => user.api.post("/api/auth/2fa/cloud-password", body);
    expectError(await post({ accountPassword: "wrong-1", password: "cloud-123" }), 403, "Неверный пароль от аккаунта");
    expectError(await post({ password: "cloud-123" }), 403, "Неверный пароль от аккаунта");
    expectError(await post({ accountPassword: user.password, password: "12345" }), 400, "Облачный пароль — не короче 6 знаков");
    expectError(
      await post({ accountPassword: user.password, password: user.password }),
      400,
      "Облачный пароль должен отличаться от пароля аккаунта — иначе второй шаг ничего не добавляет"
    );
    expectError(
      await post({ accountPassword: user.password, password: "Cloud-123", hint: " cloud-123 " }),
      400,
      "Подсказка не должна повторять сам пароль — её видно до входа"
    );
    expectError(await user.api.post("/api/auth/2fa/cloud-password/disable", { password: "x" }), 400, "Облачный пароль не установлен");

    // При включённом TOTP облачный пароль не ставится.
    const { secret } = expectOk(await user.api.post("/api/auth/2fa/setup", {}), totpSetupBody);
    expectOk(await user.api.post("/api/auth/2fa/enable", { code: totp(secret) }), twoFactorEnabledBody);
    expectError(await post({ accountPassword: user.password, password: "cloud-123" }), 400, "Сначала отключите текущий способ подтверждения входа");
  });

  test("включение, вход с подсказкой, смена, отключение через cloud-password/disable", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    const other = await login(baseUrl, user);

    const set = expectOk(
      await user.api.post("/api/auth/2fa/cloud-password", { accountPassword: user.password, password: "cloud-123", hint: "  любимый кот  " }),
      cloudPasswordSetBody
    );
    expect(set).toEqual({ ok: true, enabled: true, method: "password", hint: "любимый кот" });
    // Остальные сеансы завершаются.
    expectError(await other.get("/api/chats"), 401, "session_revoked");
    expect(expectOk(await user.api.get("/api/auth/2fa"), twoFactorStatusBody)).toEqual({
      enabled: true,
      method: "password",
      pending: false,
      cloudPasswordHint: "любимый кот",
      // У облачного пароля кодов восстановления нет.
      recoveryCodesLeft: 0,
      enabledAt: null,
    });
    // ПОВЕДЕНИЕ-ВОПРОС: о включении облачного пароля в чат «Shalter» не сообщается
    // (у TOTP и кода из чата — сообщается).
    expect(await countSystem(user.api, (t) => t.includes("двухфакторная"))).toBe(0);

    const { api, ticket, body } = await startLogin(user);
    expect(body).toMatchObject({ method: "password", hint: "любимый кот" });
    expect(expectOk(await api.post("/api/auth/2fa/hint", { ticket }), hintBody)).toEqual({ hint: "любимый кот" });
    expectError(await api.post("/api/auth/2fa/hint", {}), 400, "Срок ожидания истёк — войдите заново");
    // ПОВЕДЕНИЕ-ВОПРОС: для облачного пароля текст ошибки говорит про «приложение-аутентификатор».
    expectError(await api.post("/api/auth/2fa/send-code", { ticket }), 400, "Этот аккаунт подтверждает вход кодом из приложения-аутентификатора");
    const bad = await api.post("/api/auth/2fa/login", { ticket, code: "not-it" });
    expect(bad.status).toBe(400);
    expect(bad.body).toEqual({ error: "Неверный код. Осталось попыток: 4", attemptsLeft: 4 });
    expectOk(await api.post("/api/auth/2fa/login", { ticket, code: "cloud-123" }), loginBody);

    // Смена облачного пароля требует текущий.
    expectError(
      await user.api.post("/api/auth/2fa/cloud-password", { accountPassword: user.password, currentPassword: "nope-12", password: "cloud-456" }),
      403,
      "Неверный текущий облачный пароль"
    );
    const changed = expectOk(
      await user.api.post("/api/auth/2fa/cloud-password", { accountPassword: user.password, currentPassword: "cloud-123", password: "cloud-456" }),
      cloudPasswordSetBody
    );
    expect(changed.hint).toBeNull();

    // Отключение.
    expectError(await user.api.post("/api/auth/2fa/cloud-password/disable", { password: "cloud-123" }), 403, "Неверный облачный пароль");
    expect(expectOk(await user.api.post("/api/auth/2fa/cloud-password/disable", { password: "cloud-456" }), cloudPasswordDisabledBody)).toEqual({
      ok: true,
      enabled: false,
    });
    // ПОВЕДЕНИЕ-ВОПРОС: способ остаётся «password» и после отключения облачного пароля.
    expect(expectOk(await user.api.get("/api/auth/2fa"), twoFactorStatusBody)).toMatchObject({ enabled: false, method: "password", cloudPasswordHint: "" });
    expectOk(await new Api(baseUrl).post("/api/auth/login-email", { email: user.email, password: user.password }), loginBody);
  });

  test("отключение через /2fa/disable облачным паролем", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    expectOk(await user.api.post("/api/auth/2fa/cloud-password", { accountPassword: user.password, password: "cloud-123" }), cloudPasswordSetBody);
    expectError(await user.api.post("/api/auth/2fa/disable", { code: "wrong-1" }), 400, "Неверный облачный пароль");
    expect(expectOk(await user.api.post("/api/auth/2fa/disable", { code: "cloud-123" }), twoFactorDisabledBody)).toEqual({ enabled: false });
    expect(expectOk(await user.api.get("/api/auth/2fa"), twoFactorStatusBody)).toEqual({
      enabled: false,
      method: "totp",
      pending: false,
      cloudPasswordHint: "",
      recoveryCodesLeft: 0,
      enabledAt: null,
    });
    // ПОВЕДЕНИЕ-ВОПРОС: при отключении облачного пароля оповещения «🔓» нет (у TOTP/чата — есть).
    expect(await countSystem(user.api, (t) => t.startsWith("🔓"))).toBe(0);
  });
});
