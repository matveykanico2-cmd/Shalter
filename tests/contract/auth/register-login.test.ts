// Регистрация по email, вход по паролю, сессия устройства, несколько аккаунтов
// на одном устройстве, выход, проверка пароля, доступность юзернейма.
import { afterAll, describe, expect, test } from "vitest";
import { okBody } from "../../schemas/common";
import { selfUser } from "../../schemas/user";
import {
  loginBody,
  remainingBody,
  sessionBody,
  switchBody,
  userBody,
  usernameAvailableBody,
} from "../../schemas/auth";
import { Api } from "../../support/client";
import { expectError, expectOk, expectShape } from "../../support/expect";
import { createChannel, login, registerUser, uniq, uniqPhone } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { connectWs, type WsClient } from "../../support/ws";
import { SYSTEM_BOT_ID, countSystem } from "./helpers";

const server = useServer();
const sockets: WsClient[] = [];
afterAll(async () => {
  await Promise.all(sockets.map((s) => s.close()));
});

function regData(overrides: Record<string, unknown> = {}) {
  const username = uniq("r");
  return { name: "Тест", email: `${username}@test.invalid`, password: "secret123", phone: uniqPhone(), username, ...overrides };
}

const LOGIN_ALERT = "🔐 Выполнен вход в аккаунт с нового устройства.";

describe("POST /api/auth/register-email", () => {
  test("ошибки проверки — точные тексты, по порядку проверок", async () => {
    const { baseUrl } = server();
    const api = new Api(baseUrl);
    const taken = await registerUser(baseUrl);
    const channelOwner = await registerUser(baseUrl);
    const channelHandle = uniq("ch");
    await createChannel(channelOwner, [], { username: channelHandle, isPublic: true });

    const cases: Array<[Record<string, unknown>, number, string]> = [
      [{ name: undefined }, 400, "Введите имя"],
      [{ name: "   " }, 400, "Введите имя"],
      [{ email: "not-an-email" }, 400, "Некорректный email"],
      [{ email: undefined }, 400, "Некорректный email"],
      [{ password: "12345" }, 400, "Пароль должен быть не короче 6 символов"],
      [{ password: undefined }, 400, "Пароль должен быть не короче 6 символов"],
      [{ username: "ab" }, 400, "Юзернейм: 3–32 символа, латинские буквы, цифры и _"],
      [{ username: "имя" }, 400, "Юзернейм: 3–32 символа, латинские буквы, цифры и _"],
      [{ username: undefined }, 400, "Юзернейм: 3–32 символа, латинские буквы, цифры и _"],
      [{ username: "Admin" }, 409, "Этот юзернейм зарезервирован — выберите другой"],
      [{ username: taken.username }, 409, "Этот юзернейм уже занят"],
      [{ username: channelHandle }, 409, "Этот юзернейм уже занят каналом"],
      [{ phone: "123" }, 400, "Введите номер телефона в формате +79991234567"],
      [{ phone: undefined }, 400, "Введите номер телефона в формате +79991234567"],
      [{ email: taken.email.toUpperCase() }, 409, "Аккаунт с таким email уже существует"],
      [{ phone: taken.phone }, 409, "Аккаунт с таким номером телефона уже существует"],
      // ПОВЕДЕНИЕ-ВОПРОС: текст ошибки просит ДД.ММ.ГГГГ, а принимается только ГГГГ-ММ-ДД.
      [{ birthday: "31.12.2000" }, 400, "Введите корректную дату рождения (ДД.ММ.ГГГГ)"],
      [{ birthday: "2000-02-30" }, 400, "Введите корректную дату рождения (ДД.ММ.ГГГГ)"],
      [{ birthday: "2999-01-01" }, 400, "Введите корректную дату рождения (ДД.ММ.ГГГГ)"],
      [{ referralCode: "NOPE-NOPE" }, 400, "Код друга не найден — проверьте и попробуйте снова"],
    ];
    for (const [overrides, status, error] of cases) {
      const res = await api.post("/api/auth/register-email", regData(overrides));
      expectError(res, status, error);
    }
    // Ни одна неудачная попытка не создала сессию.
    expect(api.cookies.has("session_uids")).toBe(false);
  });

  test("успех: selfUser, нормализация полей, cookie сессии", async () => {
    const { baseUrl } = server();
    const api = new Api(baseUrl);
    const handle = uniq("Ok");
    const p = uniqPhone();
    const data = regData({
      name: "  Иван ",
      lastName: " Петров ",
      email: `${handle.toUpperCase()}@Test.Invalid`,
      username: `@${handle}`,
      phone: `${p.slice(0, 2)} (${p.slice(2, 5)}) ${p.slice(5, 8)}-${p.slice(8, 10)}-${p.slice(10)}`,
      birthday: "2000-01-31",
    });
    const res = await api.post("/api/auth/register-email", data);
    const body = expectOk(res, userBody);
    expect(body.user).toMatchObject({
      name: "Иван Петров",
      lastName: "Петров",
      username: handle,
      email: `${handle.toLowerCase()}@test.invalid`,
      phone: p,
      birthday: "2000-01-31",
      bio: "",
      avatarColor: "#2E56D9",
      isPremium: false,
      twoFactorEnabled: false,
      twoFactorMethod: "totp",
      blockedUserIds: [],
      adminSections: [],
      referralCode: expect.any(String),
    });
    // Секреты в selfUser не попадают.
    for (const key of ["passwordHash", "passwordSalt", "totpSecret", "totpRecoveryCodes", "cloudPasswordHash", "cloudPasswordHint", "stars", "referredBy"]) {
      expect(body.user).not.toHaveProperty(key);
    }

    // Сессия — три httpOnly cookie: список аккаунтов, активный и device_id.
    expect(JSON.parse(api.cookies.get("session_uids")!)).toEqual([body.user.id]);
    expect(api.cookies.get("active_uid")).toBe(body.user.id);
    expect(api.cookies.get("device_id")).toMatch(/^[0-9a-f]{24}$/);
    const setCookies = res.headers.getSetCookie();
    for (const name of ["session_uids", "active_uid", "device_id"]) {
      const raw = setCookies.find((c) => c.startsWith(`${name}=`));
      expect(raw, name).toBeDefined();
      expect(raw).toMatch(/HttpOnly/i);
      expect(raw).toMatch(/SameSite=Lax/i);
      expect(raw).toMatch(/Path=\//);
    }

    const session = expectOk(await api.get("/api/auth/session"), sessionBody);
    expect(session.user?.id).toBe(body.user.id);
    // Регистрация — первое устройство: оповещения о входе нет.
    expect(await countSystem(api, (t) => t.startsWith(LOGIN_ALERT))).toBe(0);
  });

  test("код друга: обоим Premium, пригласившему — сообщение от нового пользователя", async () => {
    const { baseUrl } = server();
    const referrer = await registerUser(baseUrl);
    const ws = await connectWs(referrer.api);
    sockets.push(ws);
    expect(referrer.self.isPremium).toBe(false);

    const api = new Api(baseUrl);
    const res = await api.post("/api/auth/register-email", regData({ referralCode: ` ${referrer.self.referralCode} ` }));
    const body = expectOk(res, userBody);
    expect(body.user).toMatchObject({ isPremium: true, premiumUntil: expect.any(String) });

    const event = await ws.waitFor("message:new", (e) => e.message?.senderId === body.user.id);
    expect(event.message.text).toBe("🎉 Я зарегистрировался(ась) в Shalter по вашему коду приглашения! Нам обоим начислен Shalter Premium.");
    const me = expectOk(await referrer.api.get("/api/auth/session"), sessionBody);
    expect(me.user).toMatchObject({ isPremium: true, premiumUntil: expect.any(String) });
  });
});

describe("POST /api/auth/login-email", () => {
  test("неверный пароль, неизвестный email, пустое тело — 401 одним текстом", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    const api = new Api(baseUrl);
    expectError(await api.post("/api/auth/login-email", { email: user.email, password: "wrong-pass" }), 401, "Неверный email или пароль");
    expectError(await api.post("/api/auth/login-email", { email: "nobody@test.invalid", password: "secret123" }), 401, "Неверный email или пароль");
    expectError(await api.post("/api/auth/login-email", {}), 401, "Неверный email или пароль");
    expect(api.cookies.has("session_uids")).toBe(false);
  });

  test("успех с нового устройства: selfUser, alreadyLinked=false, оповещение в чат «Shalter»", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    const ws = await connectWs(user.api);
    sockets.push(ws);

    const second = new Api(baseUrl);
    // Email без учёта регистра и пробелов по краям.
    const res = await second.post("/api/auth/login-email", { email: ` ${user.email.toUpperCase()} `, password: user.password });
    const body = expectOk(res, loginBody);
    expect(body).toMatchObject({ alreadyLinked: false, user: { id: user.id, email: user.email } });

    const event = await ws.waitFor("message:new", (e) => e.message?.senderId === SYSTEM_BOT_ID);
    expect(event.message.text).toMatch(
      /^🔐 Выполнен вход в аккаунт с нового устройства\.\n\n.+ · .+ · \d{2}\.\d{2}, \d{2}:\d{2}\n\nЕсли это были не вы — Настройки → Устройства → Завершить сессию\.$/
    );
    expect(event.message).toMatchObject({ type: "text", chatId: event.chatId });
    // Оповещение видно в служебном чате на обоих устройствах.
    expect(await countSystem(second, (t) => t.startsWith(LOGIN_ALERT))).toBe(1);

    // Повторный вход с того же устройства — устройство уже известно, оповещения нет;
    // аккаунт уже в cookie — alreadyLinked=true.
    const again = expectOk(await second.post("/api/auth/login-email", { email: user.email, password: user.password }), loginBody);
    expect(again.alreadyLinked).toBe(true);
    expect(await countSystem(user.api, (t) => t.startsWith(LOGIN_ALERT))).toBe(1);
  });
});

describe("GET /api/auth/session", () => {
  test("аноним: user=null, accounts=[], выдаётся device_id", async () => {
    const api = new Api(server().baseUrl);
    const body = expectOk(await api.get("/api/auth/session"), sessionBody);
    expect(body).toEqual({ user: null, accounts: [] });
    expect(api.cookies.get("device_id")).toMatch(/^[0-9a-f]{24}$/);
  });

  test("поддельный cookie без живой сессии не даёт доступа", async () => {
    const { baseUrl } = server();
    const victim = await registerUser(baseUrl);
    const forged = new Api(baseUrl);
    forged.cookies.set("session_uids", JSON.stringify([victim.id]));
    forged.cookies.set("active_uid", victim.id);
    forged.cookies.set("device_id", "0".repeat(24));
    expect(expectOk(await forged.get("/api/auth/session"), sessionBody)).toEqual({ user: null, accounts: [] });
    // Аккаунт в cookie есть, а сессии нет — так же, как после завершения сеанса.
    expectError(await forged.get("/api/chats"), 401, "session_revoked");
    // Мусор в cookie — просто «не вошёл».
    const garbage = new Api(baseUrl);
    garbage.cookies.set("session_uids", "not-json");
    expectError(await garbage.get("/api/chats"), 401, "unauthorized");
    expectError(await new Api(baseUrl).get("/api/chats"), 401, "unauthorized");
  });
});

describe("несколько аккаунтов на одном устройстве", () => {
  test("регистрация второго, переключение, выход одного из аккаунтов", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const api = a.api;
    const bData = regData({ name: "Второй" });
    const b = expectOk(await api.post("/api/auth/register-email", bData), userBody).user;

    // Второй аккаунт добавлен и стал активным.
    expect(JSON.parse(api.cookies.get("session_uids")!)).toEqual([a.id, b.id]);
    let session = expectOk(await api.get("/api/auth/session"), sessionBody);
    expect(session.user?.id).toBe(b.id);
    expect(session.accounts.map((u) => u.id)).toEqual([a.id, b.id]);

    // Переключение.
    const switched = expectOk(await api.post("/api/auth/switch", { userId: a.id }), switchBody);
    expect(switched.user?.id).toBe(a.id);
    expect(api.cookies.get("active_uid")).toBe(a.id);
    session = expectOk(await api.get("/api/auth/session"), sessionBody);
    expect(session.user?.id).toBe(a.id);

    // Чужой / не подключённый аккаунт.
    const stranger = await registerUser(baseUrl);
    expectError(await api.post("/api/auth/switch", { userId: stranger.id }), 403, "Этот аккаунт не подключён на этом устройстве");
    expectError(await api.post("/api/auth/switch", {}), 403, "Этот аккаунт не подключён на этом устройстве");
    expectError(await new Api(baseUrl).post("/api/auth/switch", { userId: a.id }), 403, "Этот аккаунт не подключён на этом устройстве");

    // Выход неактивного аккаунта по uid — активный остаётся.
    const out = expectOk(await api.post("/api/auth/logout", { uid: b.id }), remainingBody);
    expect(out.remaining).toEqual([a.id]);
    session = expectOk(await api.get("/api/auth/session"), sessionBody);
    expect(session.user?.id).toBe(a.id);
    expect(session.accounts.map((u) => u.id)).toEqual([a.id]);

    // Вход вторым аккаунтом снова — alreadyLinked=false, теперь он активный.
    const relogin = expectOk(await api.post("/api/auth/login-email", { email: bData.email, password: bData.password }), loginBody);
    expect(relogin.alreadyLinked).toBe(false);
    expect(api.cookies.get("active_uid")).toBe(b.id);

    // Выход активного — активным становится оставшийся.
    const out2 = expectOk(await api.post("/api/auth/logout", {}), remainingBody);
    expect(out2.remaining).toEqual([a.id]);
    expect(api.cookies.get("active_uid")).toBe(a.id);
    expect(expectOk(await api.get("/api/auth/session"), sessionBody).user?.id).toBe(a.id);
  });
});

describe("POST /api/auth/logout", () => {
  test("аноним — ok и пустой список", async () => {
    const body = expectOk(await new Api(server().baseUrl).post("/api/auth/logout", {}), remainingBody);
    expect(body).toEqual({ ok: true, remaining: [] });
  });

  test("последний аккаунт: cookie стираются, API отвечает unauthorized", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    const before = user.api.clone();
    const body = expectOk(await user.api.post("/api/auth/logout"), remainingBody);
    expect(body.remaining).toEqual([]);
    expect(user.api.cookies.has("session_uids")).toBe(false);
    expect(user.api.cookies.has("active_uid")).toBe(false);
    // device_id остаётся — это «устройство», а не сессия.
    expect(user.api.cookies.has("device_id")).toBe(true);
    expect(expectOk(await user.api.get("/api/auth/session"), sessionBody).user).toBeNull();
    expectError(await user.api.get("/api/chats"), 401, "unauthorized");

    // Сессия отзывается и на сервере — сохранённые до выхода cookie больше не работают.
    expectError(await before.get("/api/chats"), 401, "session_revoked");
    // Повторный вход на том же устройстве снова работает.
    expectOk(await user.api.post("/api/auth/login-email", { email: user.email, password: user.password }), loginBody);
    expectStatusOk(await user.api.get("/api/chats"));
  });
});

function expectStatusOk(res: { status: number; text: string }) {
  expect(res.status, res.text.slice(0, 300)).toBe(200);
}

describe("POST /api/auth/verify-password", () => {
  test("401 без сессии, неверный пароль, верный пароль", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    expectError(await new Api(baseUrl).post("/api/auth/verify-password", { password: user.password }), 401, "unauthorized");
    expectError(await user.api.post("/api/auth/verify-password", { password: "nope-nope" }), 401, "Неверный пароль");
    expectError(await user.api.post("/api/auth/verify-password", {}), 401, "Неверный пароль");
    expectOk(await user.api.post("/api/auth/verify-password", { password: user.password }), okBody);
  });
});

describe("GET /api/auth/username-available", () => {
  test("свободный, занятый, зарезервированный, некорректный", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    const api = new Api(baseUrl); // без сессии — маршрут публичный

    const free = uniq("free");
    expect(expectOk(await api.get("/api/auth/username-available", { query: { u: ` @${free} ` } }), usernameAvailableBody)).toEqual({
      username: free,
      available: true,
      error: null,
    });
    expect(expectOk(await api.get("/api/auth/username-available", { query: { u: user.username } }), usernameAvailableBody)).toEqual({
      username: user.username,
      available: false,
      error: "Этот юзернейм уже занят",
    });
    expect(expectOk(await api.get("/api/auth/username-available", { query: { u: "settings" } }), usernameAvailableBody)).toEqual({
      username: "settings",
      available: false,
      error: "Этот юзернейм зарезервирован — выберите другой",
    });
    expect(expectOk(await api.get("/api/auth/username-available", { query: { u: "a-b" } }), usernameAvailableBody)).toEqual({
      username: "a-b",
      available: false,
      error: "Юзернейм: 3–32 символа, латинские буквы, цифры и _",
    });
    expect(expectOk(await api.get("/api/auth/username-available"), usernameAvailableBody)).toEqual({
      username: "",
      available: false,
      error: "Юзернейм: 3–32 символа, латинские буквы, цифры и _",
    });
  });
});

// Схема selfUser используется и в accounts — проверяем, что второй аккаунт тоже строгий.
test("accounts в сессии — строгие selfUser", async () => {
  const { baseUrl } = server();
  const a = await registerUser(baseUrl);
  const body = expectOk(await a.api.get("/api/auth/session"), sessionBody);
  for (const acc of body.accounts) expectShape(selfUser, acc, "аккаунт");
  const loggedIn = await login(baseUrl, a);
  expect(expectOk(await loggedIn.get("/api/auth/session"), sessionBody).accounts).toHaveLength(1);
});
