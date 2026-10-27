// Ключи доступа (passkeys): регистрация, список, удаление и вход. Роль
// аутентификатора играет программный ключ ES256 (./webauthn.ts).
import { describe, expect, test } from "vitest";
import {
  loginBody,
  passkeyAddedBody,
  passkeyLoginStartBody,
  passkeyRegisterStartBody,
  passkeysBody,
  sessionBody,
  totpSetupBody,
  twoFactorChallenge,
  twoFactorEnabledBody,
} from "../../schemas/auth";
import { okBody } from "../../schemas/common";
import { Api } from "../../support/client";
import { expectError, expectOk } from "../../support/expect";
import { registerUser, type TestUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { waitSystemMessage } from "./helpers";
import { totp } from "./totp";
import { SoftAuthenticator } from "./webauthn";

const server = useServer();

async function registerStart(user: TestUser) {
  return expectOk(await user.api.post("/api/auth/passkey/register/start"), passkeyRegisterStartBody);
}

async function addPasskey(user: TestUser, name?: string) {
  const key = new SoftAuthenticator(server().baseUrl);
  const { challenge } = await registerStart(user);
  const body = expectOk(await user.api.post("/api/auth/passkey/register/finish", { ...key.attestation(challenge), name }), passkeyAddedBody);
  return { key, passkey: body.passkey };
}

async function loginChallenge(api: Api): Promise<string> {
  return expectOk(await api.post("/api/auth/passkey/login/start"), passkeyLoginStartBody).challenge;
}

describe("без сессии", () => {
  test("регистрация, список и удаление ключей — 401", async () => {
    const api = new Api(server().baseUrl);
    expectError(await api.post("/api/auth/passkey/register/start"), 401, "unauthorized");
    expectError(await api.post("/api/auth/passkey/register/finish", {}), 401, "unauthorized");
    expectError(await api.get("/api/auth/passkeys"), 401, "unauthorized");
    expectError(await api.delete("/api/auth/passkeys/whatever"), 401, "unauthorized");
  });
});

describe("POST /api/auth/passkey/register/start", () => {
  test("параметры для navigator.credentials.create()", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl, { name: "Пётр" });
    const start = await registerStart(user);
    expect(start).toMatchObject({
      rp: { id: new URL(baseUrl).hostname, name: "Shalter" },
      user: { id: Buffer.from(user.id).toString("base64url"), name: user.username, displayName: "Пётр" },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      timeout: 120000,
      excludeCredentials: [],
    });
    expect(Buffer.from(start.challenge, "base64url")).toHaveLength(32);
    expect((await registerStart(user)).challenge).not.toBe(start.challenge);
    expect(expectOk(await user.api.get("/api/auth/passkeys"), passkeysBody)).toEqual({ passkeys: [] });
  });
});

describe("POST /api/auth/passkey/register/finish", () => {
  test("мусор и неподходящие ответы аутентификатора — 400 с причиной", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    const other = await registerUser(baseUrl);
    const key = new SoftAuthenticator(baseUrl);
    const finish = (body: unknown) => user.api.post("/api/auth/passkey/register/finish", body);

    expectError(await finish({}), 400, "Не удалось добавить ключ: bad base64url");
    expectError(await finish({ clientDataJSON: Buffer.from("{oops").toString("base64url") }), 400, "Не удалось добавить ключ: bad clientDataJSON");

    let { challenge } = await registerStart(user);
    const getType = { ...key.attestation(challenge), clientDataJSON: key.clientData("webauthn.get", challenge).toString("base64url") };
    expectError(await finish(getType), 400, "Не удалось добавить ключ: wrong ceremony type");
    expectError(await finish(key.attestation(challenge, { origin: "https://evil.example" })), 400, "Не удалось добавить ключ: wrong origin");
    expectError(await finish(key.attestation("never-issued")), 400, "Не удалось добавить ключ: Запрос устарел — попробуйте ещё раз");

    // Challenge одноразовый и привязан к пользователю.
    ({ challenge } = await registerStart(other));
    expectError(await finish(key.attestation(challenge)), 400, "Не удалось добавить ключ: Запрос устарел — попробуйте ещё раз");
    ({ challenge } = await registerStart(user));
    expectError(await finish(key.attestation(challenge, { rpId: "evil.example" })), 400, "Не удалось добавить ключ: wrong rpId");
    expectError(await finish(key.attestation(challenge)), 400, "Не удалось добавить ключ: Запрос устарел — попробуйте ещё раз");
    ({ challenge } = await registerStart(user));
    expectError(await finish(key.attestation(challenge, { flags: 0x40 })), 400, "Не удалось добавить ключ: user not present");

    expect(expectOk(await user.api.get("/api/auth/passkeys"), passkeysBody).passkeys).toEqual([]);
  });

  test("успех: ключ в списке, оповещение в чат, повтор — 409, исключение при следующей регистрации", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    const { key, passkey } = await addPasskey(user, `  ${"Мой ноутбук ".repeat(10)}`);
    expect(passkey.id).toBe(key.id);
    // Имя обрезается по краям и до 60 символов.
    expect(passkey.name).toBe("Мой ноутбук ".repeat(10).trim().slice(0, 60));

    const msg = await waitSystemMessage(user.api, (t) => t.startsWith("🔑"));
    expect(msg.text).toBe(
      `🔑 К аккаунту добавлен ключ доступа «${passkey.name}». Если это были не вы — удалите его в Настройки → Конфиденциальность и завершите чужие сеансы.`
    );

    const list = expectOk(await user.api.get("/api/auth/passkeys"), passkeysBody).passkeys;
    expect(list).toEqual([{ id: key.id, name: passkey.name, createdAt: passkey.createdAt }]);
    expect((await registerStart(user)).excludeCredentials).toEqual([{ type: "public-key", id: key.id }]);

    const { challenge } = await registerStart(user);
    expectError(await user.api.post("/api/auth/passkey/register/finish", key.attestation(challenge)), 409, "Этот ключ уже добавлен");

    // Без имени — имя из User-Agent.
    const { passkey: unnamed } = await addPasskey(user);
    expect(unnamed.name).toBe("Браузер, неизвестная ОС");
  });
});

describe("DELETE /api/auth/passkeys/:id", () => {
  test("неизвестный и чужой ключ — 404, свой — удаляется", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    const other = await registerUser(baseUrl);
    const { key } = await addPasskey(user);
    expectError(await user.api.delete("/api/auth/passkeys/unknown"), 404, "Ключ не найден");
    expectError(await other.api.delete(`/api/auth/passkeys/${key.id}`), 404, "Ключ не найден");
    expectOk(await user.api.delete(`/api/auth/passkeys/${key.id}`), okBody);
    expect(expectOk(await user.api.get("/api/auth/passkeys"), passkeysBody).passkeys).toEqual([]);
    expectError(await user.api.delete(`/api/auth/passkeys/${key.id}`), 404, "Ключ не найден");

    // Удалённым ключом войти нельзя.
    const device = new Api(baseUrl);
    const challenge = await loginChallenge(device);
    expectError(await device.post("/api/auth/passkey/login/finish", key.assertion(challenge)), 401, "Этот ключ не привязан ни к одному аккаунту");
  });
});

describe("вход по ключу: /api/auth/passkey/login/*", () => {
  test("login/start — публичный, параметры для navigator.credentials.get()", async () => {
    const { baseUrl } = server();
    const body = expectOk(await new Api(baseUrl).post("/api/auth/passkey/login/start"), passkeyLoginStartBody);
    expect(body).toMatchObject({ rpId: new URL(baseUrl).hostname, userVerification: "preferred", timeout: 120000 });
  });

  test("ошибки login/finish — 401 с причиной", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    const { key } = await addPasskey(user);
    const device = new Api(baseUrl);
    const finish = (body: unknown) => device.post("/api/auth/passkey/login/finish", body);

    expectError(await finish({}), 401, "Этот ключ не привязан ни к одному аккаунту");
    expectError(await finish({ id: "garbage" }), 401, "Этот ключ не привязан ни к одному аккаунту");
    expectError(await finish({ id: key.id }), 401, "Вход по ключу не удался: bad base64url");
    expectError(await finish(key.assertion("never-issued")), 401, "Вход по ключу не удался: Запрос устарел — попробуйте ещё раз");
    let challenge = await loginChallenge(device);
    expectError(await finish(key.assertion(challenge, { corruptSignature: true })), 401, "Вход по ключу не удался: bad signature");
    // challenge сгорел даже после неудачи.
    expectError(await finish(key.assertion(challenge)), 401, "Вход по ключу не удался: Запрос устарел — попробуйте ещё раз");

    challenge = await loginChallenge(device);
    expectOk(await finish(key.assertion(challenge, { signCount: 5 })), loginBody);
    // Счётчик подписи не должен идти назад — признак клона ключа.
    challenge = await loginChallenge(device);
    expectError(await finish(key.assertion(challenge, { signCount: 5 })), 401, "Вход по ключу не удался: signCount went backwards");
    expect(device.cookies.has("session_uids")).toBe(true);
  });

  test("успех: вход с нового устройства, lastUsedAt обновлён", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    const { key } = await addPasskey(user);
    const device = new Api(baseUrl);
    const body = expectOk(await device.post("/api/auth/passkey/login/finish", key.assertion(await loginChallenge(device))), loginBody);
    expect(body).toMatchObject({ alreadyLinked: false, user: { id: user.id } });
    expect(expectOk(await device.get("/api/auth/session"), sessionBody).user?.id).toBe(user.id);
    const [item] = expectOk(await user.api.get("/api/auth/passkeys"), passkeysBody).passkeys;
    expect(item.lastUsedAt).toEqual(expect.any(String));
    await waitSystemMessage(user.api, (t) => t.startsWith("🔐 Выполнен вход в аккаунт с нового устройства."));
  });

  test("ключ не обходит 2FA — выдаётся билет второго шага", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    const { key } = await addPasskey(user);
    const { secret } = expectOk(await user.api.post("/api/auth/2fa/setup", {}), totpSetupBody);
    expectOk(await user.api.post("/api/auth/2fa/enable", { code: totp(secret) }), twoFactorEnabledBody);

    const device = new Api(baseUrl);
    const body = expectOk(await device.post("/api/auth/passkey/login/finish", key.assertion(await loginChallenge(device))), twoFactorChallenge);
    expect(body).toMatchObject({ method: "totp", name: user.name });
    expect(device.cookies.has("session_uids")).toBe(false);
  });
});
