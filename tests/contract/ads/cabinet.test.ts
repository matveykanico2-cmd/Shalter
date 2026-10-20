// Кабинет рекламы в профиле: GET /api/ads/me, заявка POST /request, объявление
// PUT /content и выдача админом POST /grant (server/routes/ads.js).
// Платёжки не подключены — заявка уходит админу в личку (ветка с заказом — donation.test.ts).
import { describe, expect, test } from "vitest";
import { Api } from "../../support/client";
import { expectError, expectOk, expectShape } from "../../support/expect";
import { registerUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { wsMessageNew } from "../../schemas/messages";
import { adsMe, adsRequestChat, userBody } from "../../schemas/ads";
import { socketPool } from "../ws/helpers";
import { ADMIN_ENV, ADMIN_MISSING, ADMIN_PHONE, NO_RIGHTS, adminGetter } from "./helpers";

const server = useServer({ env: ADMIN_ENV });
const open = socketPool();
const getAdmin = adminGetter(() => server().baseUrl);
const DAY = 24 * 60 * 60 * 1000;

describe("без сессии", () => {
  const routes: Array<[string, string]> = [
    ["GET", "/api/ads/me"],
    ["POST", "/api/ads/request"],
    ["PUT", "/api/ads/content"],
    ["POST", "/api/ads/grant"],
    ["GET", "/api/ads/campaigns"],
    ["POST", "/api/ads/campaigns"],
    ["PATCH", "/api/ads/campaigns/ad_1_x"],
    ["DELETE", "/api/ads/campaigns/ad_1_x"],
    ["POST", "/api/ads/campaigns/ad_1_x/budget"],
    ["POST", "/api/ads/campaigns/ad_1_x/status"],
    ["GET", "/api/ads/campaigns/ad_1_x/stats"],
    ["GET", "/api/ads/serve"],
    ["POST", "/api/ads/click/ad_1_x"],
    ["GET", "/api/ads/review"],
    ["POST", "/api/ads/review/ad_1_x"],
  ];
  test.each(routes)("%s %s → 401 unauthorized", async (method, path) => {
    const api = new Api(server().baseUrl);
    expectError(await api.request(method, path, method === "GET" ? {} : { json: {} }), 401, "unauthorized");
  });
});

// Идёт первым: админ ещё не зарегистрирован.
describe("POST /api/ads/request без админа", () => {
  test("503 — администрация ещё не зарегистрирована", async () => {
    const u = await registerUser(server().baseUrl);
    expectError(await u.api.post("/api/ads/request"), 503, ADMIN_MISSING);
  });
});

describe("GET /api/ads/me", () => {
  test("новый пользователь: кабинет не активен, цена и срок по умолчанию", async () => {
    const u = await registerUser(server().baseUrl);
    expect(expectOk(await u.api.get("/api/ads/me"), adsMe)).toEqual({
      isAdsActive: false,
      adsForever: false,
      adAttachments: [],
      priceRub: 20,
      days: 30,
    });
  });
});

describe("POST /api/ads/request", () => {
  test("пользователь: заявка админу в личку от его имени; кабинет не включается", async () => {
    const admin = await getAdmin();
    const u = await registerUser(server().baseUrl);
    const adminWs = await open(admin.api);
    const res = expectOk(await u.api.post("/api/ads/request"), adsRequestChat);
    expect(res).toEqual({ chatId: expect.any(String), adminPhone: ADMIN_PHONE, priceRub: 20 });

    const e = await adminWs.waitFor("message:new", (x) => x.chatId === res.chatId, 10_000);
    expectShape(wsMessageNew, e);
    expect(e.message).toMatchObject({
      senderId: u.id,
      text: `📢 Хочу оформить кабинет рекламы на 30 дней за 20₽. Перевожу на ${ADMIN_PHONE} и жду подтверждения 🙏`,
    });
    expect((await u.api.get("/api/ads/me")).body.isAdsActive).toBe(false);
    // Повторная заявка — в ту же личку.
    expect(expectOk(await u.api.post("/api/ads/request"), adsRequestChat).chatId).toBe(res.chatId);
  });

  test("админ сам себе: кабинет выдаётся сразу, сообщение в «Избранное», delivered: true", async () => {
    const admin = await getAdmin();
    const ws = await open(admin.api);
    const res = expectOk(await admin.api.post("/api/ads/request"), adsRequestChat);
    expect(res).toEqual({ chatId: expect.any(String), adminPhone: ADMIN_PHONE, priceRub: 20, delivered: true });
    const e = await ws.waitFor("message:new", (x) => x.chatId === res.chatId, 10_000);
    expect(e.message.text).toBe("📢 Вам выдан кабинет рекламы на 30 дней! Настройте объявление в Настройки → Реклама.");
    const me = expectOk(await admin.api.get("/api/ads/me"), adsMe);
    expect(me).toMatchObject({ isAdsActive: true, adsForever: false });
    expect(Date.parse(me.adsUntil!) - Date.now()).toBeGreaterThan(29 * DAY);
  });
});

describe("POST /api/ads/grant", () => {
  test("не админ — 403; нет пользователя — 404", async () => {
    const admin = await getAdmin();
    const u = await registerUser(server().baseUrl);
    expectError(await u.api.post("/api/ads/grant", { userId: u.id }), 403, NO_RIGHTS);
    expectError(await admin.api.post("/api/ads/grant", { userId: "u_nonexistent00" }), 404, "Пользователь не найден");
    expectError(await admin.api.post("/api/ads/grant", {}), 404, "Пользователь не найден");
  });

  test("выдача на срок продлевает, навсегда — adsForever, отключение — снимает; пользователю пишет админ", async () => {
    const admin = await getAdmin();
    const u = await registerUser(server().baseUrl);
    const ws = await open(u.api);

    const granted = expectOk(await admin.api.post("/api/ads/grant", { userId: u.id }), userBody).user;
    expect(granted).toMatchObject({ id: u.id, isAdsActive: true });
    expect(Date.parse(granted.adsUntil!) - Date.now()).toBeGreaterThan(29 * DAY);
    let e = await ws.waitFor("message:new", (x) => x.message?.senderId === admin.id, 10_000);
    expect(e.message.text).toBe("📢 Вам выдан кабинет рекламы на 30 дней! Настройте объявление в Настройки → Реклама.");

    // Срок прибавляется к текущему, дробные дни округляются вниз.
    ws.clear();
    const extended = expectOk(await admin.api.post("/api/ads/grant", { userId: u.id, days: 5.9 }), userBody).user;
    expect(Date.parse(extended.adsUntil!) - Date.parse(granted.adsUntil!)).toBe(5 * DAY);
    e = await ws.waitFor("message:new", (x) => x.message?.senderId === admin.id, 10_000);
    expect(e.message.text).toBe("📢 Вам выдан кабинет рекламы на 5 дней! Настройте объявление в Настройки → Реклама.");

    ws.clear();
    const forever = expectOk(await admin.api.post("/api/ads/grant", { userId: u.id, forever: true }), userBody).user;
    expect(forever).toMatchObject({ isAdsActive: true, adsForever: true });
    expect(forever).not.toHaveProperty("adsUntil");
    e = await ws.waitFor("message:new", (x) => x.message?.senderId === admin.id, 10_000);
    expect(e.message.text).toBe("📢 Вам выдан кабинет рекламы навсегда! Настройте объявление в Настройки → Реклама.");
    // «Навсегда» срочной выдачей не перебивается.
    expect(expectOk(await admin.api.post("/api/ads/grant", { userId: u.id, days: 3 }), userBody).user.adsForever).toBe(true);
    expect(expectOk(await u.api.get("/api/ads/me"), adsMe)).toMatchObject({ isAdsActive: true, adsForever: true });

    ws.clear();
    const revoked = expectOk(await admin.api.post("/api/ads/grant", { userId: u.id, active: false }), userBody).user;
    expect(revoked).toMatchObject({ isAdsActive: false });
    expect(revoked).not.toHaveProperty("adsForever");
    e = await ws.waitFor("message:new", (x) => x.message?.senderId === admin.id, 10_000);
    expect(e.message.text).toBe("Ваш кабинет рекламы был отключён администрацией.");
    expect(expectOk(await u.api.get("/api/ads/me"), adsMe)).toMatchObject({ isAdsActive: false, adsForever: false });
  });
});

describe("PUT /api/ads/content", () => {
  test("без активного кабинета — 403", async () => {
    const u = await registerUser(server().baseUrl);
    expectError(await u.api.request("PUT", "/api/ads/content", { json: { text: "Реклама" } }), 403, "Кабинет рекламы не активен");
  });

  test("объявление: текст до 200 символов, ссылка, вложения через фильтр; видно в профиле", async () => {
    const admin = await getAdmin();
    const u = await registerUser(server().baseUrl);
    const viewer = await registerUser(server().baseUrl);
    await admin.api.post("/api/ads/grant", { userId: u.id });
    const put = (json: unknown) => u.api.request("PUT", "/api/ads/content", { json });

    expectError(await put({}), 400, "Введите текст объявления");
    expectError(await put({ text: "   " }), 400, "Введите текст объявления");
    expectError(await put({ text: "Реклама", url: "ftp://x.test.invalid" }), 400, "Ссылка должна начинаться с http:// или https://");
    expectError(await put({ text: "Реклама", url: "javascript:alert(1)" }), 400, "Ссылка должна начинаться с http:// или https://");
    // ПОВЕДЕНИЕ-ВОПРОС: ссылка проверяется до trim — пробел в начале даёт 400, хотя потом её обрезают.
    expectError(await put({ text: "Реклама", url: " https://shop.test.invalid" }), 400, "Ссылка должна начинаться с http:// или https://");

    const attachments = [
      { kind: "image", url: "https://img.test.invalid/1.jpg", name: "фото", size: 10, extra: 1 },
      { kind: "voice", url: "https://img.test.invalid/2.ogg" },
      { kind: "file", url: "javascript:alert(1)" },
      { kind: "video", url: "https://img.test.invalid/3.mp4", size: "big" },
      ...Array.from({ length: 6 }, (_, i) => ({ kind: "file", url: `https://img.test.invalid/f${i}` })),
    ];
    const { user } = expectOk(await put({ text: `  ${"р".repeat(250)}  `, url: "https://shop.test.invalid  ", attachments }), userBody);
    expect(user).toMatchObject({ id: u.id, adText: "р".repeat(200), adUrl: "https://shop.test.invalid" });
    // Сначала первые 6, потом фильтр: voice и опасный адрес выпали; size не число — пропал.
    expect(user.adAttachments).toEqual([
      { kind: "image", url: "https://img.test.invalid/1.jpg", name: "фото", size: 10 },
      { kind: "video", url: "https://img.test.invalid/3.mp4" },
      { kind: "file", url: "https://img.test.invalid/f0" },
      { kind: "file", url: "https://img.test.invalid/f1" },
    ]);
    expect(expectOk(await u.api.get("/api/ads/me"), adsMe)).toMatchObject({ adText: "р".repeat(200), adUrl: "https://shop.test.invalid", adAttachments: user.adAttachments });
    const profile = (await viewer.api.get(`/api/users/${u.id}`)).body.user;
    expect(profile).toMatchObject({ adText: "р".repeat(200), adUrl: "https://shop.test.invalid", isAdsActive: true });

    // Без ссылки и вложений — adUrl пропадает, вложения пустые.
    const cleared = expectOk(await put({ text: "Коротко" }), userBody).user;
    expect(cleared).toMatchObject({ adText: "Коротко", adAttachments: [] });
    expect(cleared).not.toHaveProperty("adUrl");
  });

  test("текст или ссылка не строкой — 400", async () => {
    const admin = await getAdmin();
    const u = await registerUser(server().baseUrl);
    await admin.api.post("/api/ads/grant", { userId: u.id });
    const put = (json: unknown) => u.api.request("PUT", "/api/ads/content", { json });
    expectError(await put({ text: 123 }), 400, "Введите текст объявления");
    expectError(await put({ text: "Реклама", url: ["https://shop.test.invalid"] }), 400, "Ссылка должна начинаться с http:// или https://");
  });
});
