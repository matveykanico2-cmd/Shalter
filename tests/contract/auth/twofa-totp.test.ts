// Двухфакторная аутентификация через приложение-аутентификатор (TOTP):
// настройка, включение, вход по билету, коды восстановления, отключение,
// а также запрос удаления аккаунта по билету второго шага.
import { describe, expect, test } from "vitest";
import {
  hintBody,
  loginBody,
  qrStartBody,
  qrPollBody,
  scheduleDeletionBody,
  sessionBody,
  totpSetupBody,
  twoFactorChallenge,
  twoFactorDisabledBody,
  twoFactorEnabledBody,
  twoFactorLoginError,
  twoFactorStatusBody,
} from "../../schemas/auth";
import { okBody } from "../../schemas/common";
import { Api } from "../../support/client";
import { expectError, expectOk, expectShape } from "../../support/expect";
import { login, registerUser, type TestUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { SYSTEM_BOT_ID, countSystem, waitSystemMessage } from "./helpers";
import { STEP_SECONDS, totp, wrongTotp } from "./totp";

const server = useServer();

const DEFAULT_STATUS = { enabled: false, method: "totp", pending: false, cloudPasswordHint: "", recoveryCodesLeft: 0, enabledAt: null };

/** Если до смены шага TOTP меньше 2 с — дождаться следующего шага, чтобы код не «протух» по пути. */
async function awayFromStepBoundary() {
  const left = STEP_SECONDS * 1000 - (Date.now() % (STEP_SECONDS * 1000));
  if (left < 2000) await new Promise((r) => setTimeout(r, left + 50));
}

async function enableTotp(user: TestUser): Promise<{ secret: string; recoveryCodes: string[] }> {
  const { secret } = expectOk(await user.api.post("/api/auth/2fa/setup", {}), totpSetupBody);
  await awayFromStepBoundary();
  // Код прошлого шага (окно ±1): принятый шаг повторно не засчитывается, а тестам
  // дальше нужен свежий код текущего шага.
  const { recoveryCodes } = expectOk(await user.api.post("/api/auth/2fa/enable", { code: totp(secret, Date.now(), -1) }), twoFactorEnabledBody);
  return { secret, recoveryCodes };
}

async function startLogin(user: TestUser): Promise<{ api: Api; ticket: string; body: any }> {
  const api = new Api(server().baseUrl);
  const body = expectOk(await api.post("/api/auth/login-email", { email: user.email, password: user.password }), twoFactorChallenge);
  return { api, ticket: body.ticket, body };
}

describe("GET/POST /api/auth/2fa — без сессии", () => {
  test("все маршруты настройки отвечают 401 unauthorized", async () => {
    const api = new Api(server().baseUrl);
    expectError(await api.get("/api/auth/2fa"), 401, "unauthorized");
    expectError(await api.post("/api/auth/2fa/setup", {}), 401, "unauthorized");
    expectError(await api.post("/api/auth/2fa/enable", { code: "123456" }), 401, "unauthorized");
    expectError(await api.post("/api/auth/2fa/disable", { code: "123456" }), 401, "unauthorized");
    expectError(await api.post("/api/auth/2fa/send-code", {}), 401, "unauthorized");
    expectError(await api.post("/api/auth/2fa/cloud-password", {}), 401, "unauthorized");
    expectError(await api.post("/api/auth/2fa/cloud-password/disable", {}), 401, "unauthorized");
  });

  test("завершённый сеанс получает session_revoked, как и в остальных маршрутах", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    const other = await login(baseUrl, user);
    expectOk(await user.api.post("/api/sessions/terminate-others"), okBody);
    expectError(await other.get("/api/chats"), 401, "session_revoked");
    // Маршруты /2fa отвечают так же, как и остальные под requireUserId.
    expectError(await other.get("/api/auth/2fa"), 401, "session_revoked");
    expectError(await other.post("/api/auth/2fa/setup", {}), 401, "session_revoked");
    expectError(await other.post("/api/auth/2fa/send-code", {}), 401, "session_revoked");
  });
});

describe("TOTP: настройка и включение", () => {
  test("статус по умолчанию, setup, ошибки enable, включение и оповещение", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    expect(expectOk(await user.api.get("/api/auth/2fa"), twoFactorStatusBody)).toEqual(DEFAULT_STATUS);
    expectError(await user.api.post("/api/auth/2fa/enable", { code: "123456" }), 400, "Сначала отсканируйте QR-код");

    const setup = expectOk(await user.api.post("/api/auth/2fa/setup", {}), totpSetupBody);
    expect(setup.otpauthUri).toBe(
      `otpauth://totp/Shalter%3A${user.username}?secret=${setup.secret}&issuer=Shalter&algorithm=SHA1&digits=6&period=30`
    );
    expect(expectOk(await user.api.get("/api/auth/2fa"), twoFactorStatusBody)).toEqual({ ...DEFAULT_STATUS, pending: true });

    // Повторный setup до включения выдаёт новый секрет — старый перестаёт работать.
    const second = expectOk(await user.api.post("/api/auth/2fa/setup", { method: "totp" }), totpSetupBody);
    expect(second.secret).not.toBe(setup.secret);

    await awayFromStepBoundary();
    expectError(await user.api.post("/api/auth/2fa/enable", { code: wrongTotp(second.secret) }), 400, "Неверный код — проверьте, что время на устройстве точное, и попробуйте снова");
    expectError(await user.api.post("/api/auth/2fa/enable", {}), 400, "Неверный код — проверьте, что время на устройстве точное, и попробуйте снова");

    // Код из соседнего шага (−30 с) тоже принимается — окно ±1 шаг.
    await awayFromStepBoundary();
    const enabled = expectOk(await user.api.post("/api/auth/2fa/enable", { code: totp(second.secret, Date.now(), -1) }), twoFactorEnabledBody);
    expect(enabled.recoveryCodes).toHaveLength(8);
    expect(new Set(enabled.recoveryCodes).size).toBe(8);

    const msg = await waitSystemMessage(user.api, (t) => t.includes("включена двухфакторная"));
    expect(msg.text).toBe("🔐 На вашем аккаунте включена двухфакторная аутентификация. Если это были не вы — немедленно смените пароль.");

    const status = expectOk(await user.api.get("/api/auth/2fa"), twoFactorStatusBody);
    expect(status).toEqual({ ...DEFAULT_STATUS, enabled: true, recoveryCodesLeft: 8, enabledAt: expect.any(String) });
    const me = expectOk(await user.api.get("/api/auth/session"), sessionBody).user!;
    expect(me).toMatchObject({ twoFactorEnabled: true, twoFactorMethod: "totp", totpEnabledAt: status.enabledAt });

    expectError(await user.api.post("/api/auth/2fa/setup", {}), 400, "Двухфакторная аутентификация уже включена");
    expectError(await user.api.post("/api/auth/2fa/enable", { code: totp(second.secret) }), 400, "Двухфакторная аутентификация уже включена");
  });

  test("disable без включённой 2FA сбрасывает незавершённую настройку", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    expectOk(await user.api.post("/api/auth/2fa/setup", {}), totpSetupBody);
    expect(expectOk(await user.api.post("/api/auth/2fa/disable", {}), twoFactorDisabledBody)).toEqual({ enabled: false });
    expect(expectOk(await user.api.get("/api/auth/2fa"), twoFactorStatusBody)).toEqual(DEFAULT_STATUS);
  });
});

describe("TOTP: вход по билету /api/auth/2fa/login", () => {
  test("login-email отдаёт билет вместо сессии; неверный код уменьшает попытки; верный — входит", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    const { secret } = await enableTotp(user);

    const { api, ticket, body } = await startLogin(user);
    expect(body).toEqual({
      twoFactorRequired: true,
      ticket,
      expiresInSec: 300,
      name: user.name,
      method: "totp",
      hint: null,
      scheduledDeletionAt: null,
    });
    // Сессия ещё не создана.
    expect(api.cookies.has("session_uids")).toBe(false);
    expectError(await api.get("/api/chats"), 401, "unauthorized");

    // Подсказка есть только у облачного пароля; отправка кода — только для способа «чат».
    expect(expectOk(await api.post("/api/auth/2fa/hint", { ticket }), hintBody)).toEqual({ hint: null });
    expectError(await api.post("/api/auth/2fa/send-code", { ticket }), 400, "Этот аккаунт подтверждает вход кодом из приложения-аутентификатора");

    expectError(await api.post("/api/auth/2fa/login", { code: "123456" }), 400, "Время на ввод кода истекло — войдите заново");
    expectError(await api.post("/api/auth/2fa/login", { ticket: "bogus", code: "123456" }), 400, "Время на ввод кода истекло — войдите заново");

    await awayFromStepBoundary();
    const bad = await api.post("/api/auth/2fa/login", { ticket, code: wrongTotp(secret) });
    expect(bad.status).toBe(400);
    expect(expectShape(twoFactorLoginError, bad.body)).toEqual({ error: "Неверный код. Осталось попыток: 4", attemptsLeft: 4 });

    const usedCode = totp(secret);
    const ok = expectOk(await api.post("/api/auth/2fa/login", { ticket, code: ` ${usedCode} ` }), loginBody);
    expect(ok).toMatchObject({ alreadyLinked: false, user: { id: user.id, twoFactorEnabled: true } });
    expect(expectOk(await api.get("/api/auth/session"), sessionBody).user?.id).toBe(user.id);
    // Новое устройство после второго шага — оповещение о входе.
    await waitSystemMessage(user.api, (t) => t.startsWith("🔐 Выполнен вход в аккаунт с нового устройства."));

    // Билет одноразовый.
    expectError(await api.post("/api/auth/2fa/login", { ticket, code: totp(secret) }), 400, "Время на ввод кода истекло — войдите заново");

    // Принятый код второй раз не подходит (RFC 6238 §5.2) — даже с новым билетом
    // и пока он ещё в окне: это обычный неверный код.
    const replay = await startLogin(user);
    const replayed = await replay.api.post("/api/auth/2fa/login", { ticket: replay.ticket, code: usedCode });
    expect(replayed.status).toBe(400);
    expect(expectShape(twoFactorLoginError, replayed.body)).toEqual({ error: "Неверный код. Осталось попыток: 4", attemptsLeft: 4 });
    // Код соседнего, ещё не использованного шага подходит — и тоже только один раз.
    await awayFromStepBoundary();
    const next = totp(secret, Date.now(), 1);
    expectOk(await replay.api.post("/api/auth/2fa/login", { ticket: replay.ticket, code: next }), loginBody);
    const again = await startLogin(user);
    expect((await again.api.post("/api/auth/2fa/login", { ticket: again.ticket, code: next })).status).toBe(400);
  });

  test("после 5 неверных кодов билет сгорает", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    const { secret } = await enableTotp(user);
    const { api, ticket } = await startLogin(user);
    await awayFromStepBoundary();
    const wrong = wrongTotp(secret);
    for (let left = 4; left >= 1; left--) {
      const res = await api.post("/api/auth/2fa/login", { ticket, code: wrong });
      expect(res.status).toBe(400);
      expect(expectShape(twoFactorLoginError, res.body)).toEqual({ error: `Неверный код. Осталось попыток: ${left}`, attemptsLeft: left });
    }
    const last = await api.post("/api/auth/2fa/login", { ticket, code: wrong });
    expect(last.status).toBe(400);
    expect(expectShape(twoFactorLoginError, last.body)).toEqual({ error: "Слишком много неверных кодов — войдите заново", attemptsLeft: 0 });
    expectError(await api.post("/api/auth/2fa/login", { ticket, code: totp(secret) }), 400, "Время на ввод кода истекло — войдите заново");
  });

  test("коды восстановления: вход без учёта регистра и дефиса, каждый — один раз", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    const { recoveryCodes } = await enableTotp(user);
    const [rc] = recoveryCodes;

    const a = await startLogin(user);
    expectOk(await a.api.post("/api/auth/2fa/login", { ticket: a.ticket, code: rc.replace("-", "").toLowerCase() }), loginBody);
    expect(expectOk(await user.api.get("/api/auth/2fa"), twoFactorStatusBody).recoveryCodesLeft).toBe(7);

    const b = await startLogin(user);
    const reused = await b.api.post("/api/auth/2fa/login", { ticket: b.ticket, code: rc });
    expect(reused.status).toBe(400);
    expect(reused.body).toEqual({ error: "Неверный код. Осталось попыток: 4", attemptsLeft: 4 });
  });

  test("вход по QR не спрашивает второй фактор (подтверждает уже вошедшее устройство)", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    await enableTotp(user);
    const tv = new Api(baseUrl);
    const { token } = expectOk(await tv.post("/api/auth/qr/start"), qrStartBody);
    expectOk(await user.api.post("/api/auth/qr/confirm", { token }), okBody);
    expect(expectOk(await tv.get("/api/auth/qr/poll", { query: { token } }), qrPollBody)).toMatchObject({ status: "confirmed", user: { id: user.id } });
  });
});

describe("TOTP: отключение /api/auth/2fa/disable", () => {
  test("неверный код, отключение кодом приложения, оповещение", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    const { secret } = await enableTotp(user);
    await awayFromStepBoundary();
    expectError(await user.api.post("/api/auth/2fa/disable", { code: wrongTotp(secret) }), 400, "Неверный код");
    expectError(await user.api.post("/api/auth/2fa/disable", {}), 400, "Неверный код");
    expect(expectOk(await user.api.post("/api/auth/2fa/disable", { code: totp(secret) }), twoFactorDisabledBody)).toEqual({ enabled: false });
    const msg = await waitSystemMessage(user.api, (t) => t.startsWith("🔓"));
    expect(msg.text).toBe("🔓 Двухфакторная аутентификация отключена. Если это были не вы — срочно смените пароль.");
    expect(expectOk(await user.api.get("/api/auth/2fa"), twoFactorStatusBody)).toEqual(DEFAULT_STATUS);
    // Снова обычный вход по паролю.
    expectOk(await new Api(baseUrl).post("/api/auth/login-email", { email: user.email, password: user.password }), loginBody);
  });

  test("отключение кодом восстановления", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    const { recoveryCodes } = await enableTotp(user);
    expect(expectOk(await user.api.post("/api/auth/2fa/disable", { code: ` ${recoveryCodes[3]} ` }), twoFactorDisabledBody)).toEqual({ enabled: false });
    expect(expectOk(await user.api.get("/api/auth/2fa"), twoFactorStatusBody).enabled).toBe(false);
  });
});

describe("удаление аккаунта по билету: /api/auth/schedule-deletion, /api/auth/cancel-deletion", () => {
  test("без билета — 400", async () => {
    const api = new Api(server().baseUrl);
    expectError(await api.post("/api/auth/schedule-deletion", {}), 400, "Время на подтверждение истекло — войдите заново");
    expectError(await api.post("/api/auth/cancel-deletion", { ticket: "bogus" }), 400, "Время на подтверждение истекло — войдите заново");
  });

  test("запрос удаления тратит билет; отмена — нет", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    const { secret } = await enableTotp(user);

    const first = await startLogin(user);
    const before = Date.now();
    const scheduled = expectOk(await first.api.post("/api/auth/schedule-deletion", { ticket: first.ticket }), scheduleDeletionBody);
    const delta = Date.parse(scheduled.deleteAt) - before;
    expect(delta).toBeGreaterThanOrEqual(7 * 86400_000 - 1000);
    expect(delta).toBeLessThanOrEqual(7 * 86400_000 + 5000);
    const warn = await waitSystemMessage(user.api, (t) => t.startsWith("⚠️"));
    expect(warn.text).toMatch(/^⚠️ Запрошено удаление аккаунта — он будет удалён \d{1,2} [а-я]+\. Если передумаете, просто войдите в аккаунт до этой даты — удаление отменится\.$/);
    expect(warn.senderId).toBe(SYSTEM_BOT_ID);
    expectError(await first.api.post("/api/auth/2fa/login", { ticket: first.ticket, code: totp(secret) }), 400, "Время на ввод кода истекло — войдите заново");

    const second = await startLogin(user);
    // Билет сообщает о запланированном удалении — клиент предлагает его отменить.
    expect(second.body.scheduledDeletionAt).toBe(scheduled.deleteAt);
    expectOk(await second.api.post("/api/auth/cancel-deletion", { ticket: second.ticket }), okBody);
    const cancelled = await waitSystemMessage(user.api, (t) => t.startsWith("✅"));
    expect(cancelled.text).toBe("✅ Удаление аккаунта отменено.");
    // Отмена билет не тратит — можно продолжить вход.
    await awayFromStepBoundary();
    expectOk(await second.api.post("/api/auth/2fa/login", { ticket: second.ticket, code: totp(secret) }), loginBody);
    expect(await countSystem(user.api, (t) => t.startsWith("⚠️"))).toBe(1);
  });
});
