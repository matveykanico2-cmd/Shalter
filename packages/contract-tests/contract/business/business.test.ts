// Shalter для бизнеса: состояние (GET /api/business/me), заявка на тариф
// (POST /request — без платёжки уходит админу в личку) и выдача админом
// (POST /grant, с self:updated получателю). server/routes/business.js.
import { describe, expect, test } from "vitest";
import { Api } from "../../support/client";
import { expectError, expectOk, expectShape } from "../../support/expect";
import { registerUser, type TestUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { wsMessageNew } from "../../schemas/messages";
import { businessMe, businessRequestChat, businessUserBody, wsSelfUpdated } from "../../schemas/business";
import { socketPool } from "../ws/helpers";

const ADMIN_PHONE = "+70000000553";
const server = useServer({ env: { PREMIUM_ADMIN_PHONE: ADMIN_PHONE, ALLOW_ADMIN_PHONE_SIGNUP: "1" } });
const open = socketPool();
const DAY = 24 * 60 * 60 * 1000;
const NO_RIGHTS = "Недостаточно прав";

let adminPromise: Promise<TestUser> | undefined;
const getAdmin = () => (adminPromise ??= registerUser(server().baseUrl, { phone: ADMIN_PHONE, name: "Админ" }));
const newUser = () => registerUser(server().baseUrl);

const DEFAULT_PLANS = {
  "1m": { days: 30, priceRub: 299, label: "1 месяц" },
  "3m": { days: 90, priceRub: 799, label: "3 месяца" },
  "6m": { days: 180, priceRub: 1499, label: "6 месяцев" },
  "12m": { days: 365, priceRub: 2499, label: "12 месяцев" },
};

describe("без сессии", () => {
  test.each([
    ["GET", "/api/business/me"],
    ["POST", "/api/business/request"],
    ["POST", "/api/business/grant"],
  ])("%s %s → 401 unauthorized", async (method, path) => {
    const api = new Api(server().baseUrl);
    expectError(await api.request(method, path, method === "GET" ? {} : { json: {} }), 401, "unauthorized");
  });
});

// Идёт первым: админ ещё не зарегистрирован.
describe("POST /api/business/request без админа", () => {
  test("503 — администрация ещё не зарегистрирована", async () => {
    const u = await newUser();
    expectError(await u.api.post("/api/business/request", { plan: "1m" }), 503, "Администрация Shalter ещё не зарегистрирована в приложении");
  });
});

describe("GET /api/business/me", () => {
  test("новый пользователь: бизнеса нет, тарифы по умолчанию, настройки бизнеса по умолчанию", async () => {
    const u = await newUser();
    const me = expectOk(await u.api.get("/api/business/me"), businessMe);
    expect(me).toMatchObject({
      isBusiness: false,
      businessForever: false,
      businessAddress: null,
      businessLat: null,
      businessLng: null,
      isAdmin: false,
      plans: DEFAULT_PLANS,
    });
    expect(me).not.toHaveProperty("businessUntil");
    expect(Object.keys(me.plans)).toEqual(["1m", "3m", "6m", "12m"]);
    expect(me.business).toMatchObject({
      enabled: false,
      timeZone: null,
      showHours: true,
      quickReplies: [],
      greeting: { enabled: false, text: "", attachments: [] },
      away: { enabled: false, text: "", attachments: [] },
    });
    expect(me.business.hours.mon).toEqual({ closed: false, open: "09:00", close: "18:00" });
    expect(me.business.hours.sun).toEqual({ closed: true, open: "09:00", close: "18:00" });
  });

  test("админ: isAdmin: true", async () => {
    const admin = await getAdmin();
    expect(expectOk(await admin.api.get("/api/business/me"), businessMe).isAdmin).toBe(true);
  });
});

describe("POST /api/business/request", () => {
  test("пользователь: заявка админу по выбранному тарифу; неизвестный тариф — первый; бизнес не включается", async () => {
    const admin = await getAdmin();
    const u = await newUser();
    const adminWs = await open(admin.api);

    const res = expectOk(await u.api.post("/api/business/request", { plan: "3m" }), businessRequestChat);
    expect(res).toEqual({ chatId: expect.any(String), adminPhone: ADMIN_PHONE });
    let e = await adminWs.waitFor("message:new", (x) => x.chatId === res.chatId, 10_000);
    expectShape(wsMessageNew, e);
    expect(e.message).toMatchObject({
      senderId: u.id,
      text: `Хочу оформить Shalter для бизнеса на 3 месяца за 799₽. Перевожу на ${ADMIN_PHONE} и жду подтверждения 🙏`,
    });

    adminWs.clear();
    expect(expectOk(await u.api.post("/api/business/request", { plan: "bogus" }), businessRequestChat).chatId).toBe(res.chatId);
    e = await adminWs.waitFor("message:new", (x) => x.chatId === res.chatId, 10_000);
    expect(e.message.text).toBe(`Хочу оформить Shalter для бизнеса на 1 месяц за 299₽. Перевожу на ${ADMIN_PHONE} и жду подтверждения 🙏`);
    expect(expectOk(await u.api.get("/api/business/me"), businessMe).isBusiness).toBe(false);

    // С действующим бизнесом — «продлить».
    await admin.api.post("/api/business/grant", { userId: u.id });
    adminWs.clear();
    await u.api.post("/api/business/request", { plan: "6m" });
    e = await adminWs.waitFor("message:new", (x) => x.chatId === res.chatId && x.message?.senderId === u.id, 10_000);
    expect(e.message.text).toBe(`Хочу продлить Shalter для бизнеса на 6 месяцев за 1499₽. Перевожу на ${ADMIN_PHONE} и жду подтверждения 🙏`);
  });

  test("админ сам себе: выдача сразу (delivered), повторно — продление; сообщения в «Избранное»", async () => {
    const admin = await getAdmin();
    const ws = await open(admin.api);
    const first = expectOk(await admin.api.post("/api/business/request", { plan: "1m" }), businessRequestChat);
    expect(first).toEqual({ chatId: expect.any(String), adminPhone: ADMIN_PHONE, delivered: true });
    let e = await ws.waitFor("message:new", (x) => x.chatId === first.chatId, 10_000);
    expect(e.message.text).toBe("🏢 Вам выдан Shalter для бизнеса на 1 месяц! Спасибо, что поддерживаете проект.");
    const until1 = Date.parse(expectOk(await admin.api.get("/api/business/me"), businessMe).businessUntil!);
    expect(until1 - Date.now()).toBeGreaterThan(29 * DAY);

    ws.clear();
    expect(expectOk(await admin.api.post("/api/business/request", { plan: "3m" }), businessRequestChat).chatId).toBe(first.chatId);
    e = await ws.waitFor("message:new", (x) => x.chatId === first.chatId, 10_000);
    expect(e.message.text).toBe("🏢 Shalter для бизнеса продлён на 3 месяца! Спасибо, что поддерживаете проект.");
    const me = expectOk(await admin.api.get("/api/business/me"), businessMe);
    expect(me.isBusiness).toBe(true);
    expect(Date.parse(me.businessUntil!) - until1).toBe(90 * DAY);
  });

  test("бизнес навсегда — 400 на заявку", async () => {
    const admin = await getAdmin();
    const u = await newUser();
    await admin.api.post("/api/business/grant", { userId: u.id, forever: true });
    expectError(await u.api.post("/api/business/request", { plan: "1m" }), 400, "У вас уже есть Shalter для бизнеса навсегда");
  });
});

describe("POST /api/business/grant", () => {
  test("не админ — 403; нет пользователя — 404", async () => {
    const admin = await getAdmin();
    const u = await newUser();
    expectError(await u.api.post("/api/business/grant", { userId: u.id }), 403, NO_RIGHTS);
    expectError(await admin.api.post("/api/business/grant", { userId: "u_nonexistent00" }), 404, "Пользователь не найден");
    expectError(await admin.api.post("/api/business/grant", {}), 404, "Пользователь не найден");
  });

  test("выдача/продление/навсегда/отключение: self:updated получателю (не админу), сообщение от админа", async () => {
    const admin = await getAdmin();
    const u = await newUser();
    const [ws, adminWs] = await Promise.all([open(u.api), open(admin.api)]);

    const granted = expectOk(await admin.api.post("/api/business/grant", { userId: u.id }), businessUserBody).user;
    expect(granted).toMatchObject({ id: u.id, isBusiness: true });
    expect(Date.parse(granted.businessUntil!) - Date.now()).toBeGreaterThan(29 * DAY);
    const self = await ws.waitFor("self:updated", (x) => x.user?.isBusiness === true, 10_000);
    expect(expectShape(wsSelfUpdated, self)).toEqual({ type: "self:updated", user: granted });
    let e = await ws.waitFor("message:new", (x) => x.message?.senderId === admin.id, 10_000);
    expect(e.message.text).toBe("🏢 Вам выдан Shalter для бизнеса на 30 дней!");
    await adminWs.expectNone("self:updated", (x) => x.user?.id === u.id);

    ws.clear();
    const extended = expectOk(await admin.api.post("/api/business/grant", { userId: u.id, days: "7" }), businessUserBody).user;
    expect(Date.parse(extended.businessUntil!) - Date.parse(granted.businessUntil!)).toBe(7 * DAY);
    e = await ws.waitFor("message:new", (x) => x.message?.senderId === admin.id, 10_000);
    expect(e.message.text).toBe("🏢 Вам выдан Shalter для бизнеса на 7 дней!");

    ws.clear();
    const forever = expectOk(await admin.api.post("/api/business/grant", { userId: u.id, forever: true }), businessUserBody).user;
    expect(forever).toMatchObject({ isBusiness: true, businessForever: true });
    expect(forever).not.toHaveProperty("businessUntil");
    e = await ws.waitFor("message:new", (x) => x.message?.senderId === admin.id, 10_000);
    expect(e.message.text).toBe("🏢 Вам выдан Shalter для бизнеса навсегда!");
    expect(expectOk(await u.api.get("/api/business/me"), businessMe)).toMatchObject({ isBusiness: true, businessForever: true });

    ws.clear();
    const revoked = expectOk(await admin.api.post("/api/business/grant", { userId: u.id, business: false }), businessUserBody).user;
    expect(revoked).toMatchObject({ isBusiness: false });
    expect(revoked).not.toHaveProperty("businessForever");
    await ws.waitFor("self:updated", (x) => x.user?.isBusiness === false, 10_000);
    e = await ws.waitFor("message:new", (x) => x.message?.senderId === admin.id, 10_000);
    expect(e.message.text).toBe("Ваш Shalter для бизнеса был отключён администрацией.");
    expect(expectOk(await u.api.get("/api/business/me"), businessMe)).toMatchObject({ isBusiness: false, businessForever: false });
    // Профиль глазами другого пользователя тоже обновился.
    expect((await (await newUser()).api.get(`/api/users/${u.id}`)).body.user.isBusiness).toBe(false);
  });
});
