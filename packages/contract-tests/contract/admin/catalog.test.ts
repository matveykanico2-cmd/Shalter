// Справочники админки: метки безопасности (/labels), каталог статусов профиля
// (/status-catalog) и цены (/pricing). Изменения видны через публичные маршруты:
// /api/labels, /api/status-catalog, /api/premium/me.
import { describe, expect, test } from "vitest";
import { catalogItemBody, labelBody, labelsBody, labelUserBody, moderationBody, pricingBody, pricingWithDefaultsBody } from "../../schemas/admin";
import { okBody } from "../../schemas/common";
import type { ApiResponse } from "../../support/client";
import { expectError, expectOk } from "../../support/expect";
import { registerUser, type TestUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { ADMIN_ENV, admins, sectionAdmin } from "./helpers";

const server = useServer({ env: ADMIN_ENV });
const { primary } = admins(() => server().baseUrl);

let modUser: TestUser | undefined;
async function mod(): Promise<TestUser> {
  modUser ??= await sectionAdmin(server().baseUrl, await primary(), ["moderation"]);
  return modUser;
}
let pricingUser: TestUser | undefined;
async function pricer(): Promise<TestUser> {
  pricingUser ??= await sectionAdmin(server().baseUrl, await primary(), ["pricing"]);
  return pricingUser;
}

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("метки безопасности", () => {
  test("GET /labels: пять меток по умолчанию, как и в публичном /api/labels", async () => {
    const m = await mod();
    const { labels } = expectOk(await m.api.get("/api/admin/labels"), labelsBody);
    expect(labels.map((l) => [l.id, l.short, l.label])).toEqual([
      ["scam", "СКАМ", "Мошенничество"],
      ["fake", "ФЕЙК", "Поддельный аккаунт"],
      ["terrorism", "ТЕРРОРИЗМ", "Терроризм"],
      ["extremism", "ЭКСТРЕМИЗМ", "Экстремизм"],
      ["drugs", "НАРКОТИКИ", "Продажа наркотиков"],
    ]);
    const user = await registerUser(server().baseUrl);
    expect(expectOk(await user.api.get("/api/labels"), labelsBody)).toEqual({ labels });
  });

  test("POST /labels: id нормализуется, short — заглавными, цвет по умолчанию; метка сразу применима", async () => {
    const m = await mod();
    const created = expectOk(await m.api.post("/api/admin/labels", { id: " Spam-Bot! ", short: " бот ", label: "  Спам-бот  ", hint: " подсказка " }), labelBody).label;
    expect(created).toMatchObject({ id: "spambot", short: "БОТ", label: "Спам-бот", hint: "подсказка", color: "#c6403b" });

    // Без id — из short; поля обрезаются по длине.
    const fromShort = expectOk(
      await m.api.post("/api/admin/labels", { short: "Sell_" + "x".repeat(30), label: "Л".repeat(80), hint: "h".repeat(400), color: "  #123456  " }),
      labelBody
    ).label;
    expect(fromShort).toMatchObject({ id: ("sell_" + "x".repeat(30)).slice(0, 24), short: ("SELL_" + "X".repeat(30)).slice(0, 16), color: "#123456" });
    expect(fromShort.label).toHaveLength(60);
    expect(fromShort.hint).toHaveLength(300);

    // Кириллический short без id — id из времени.
    const auto = expectOk(await m.api.post("/api/admin/labels", { short: "ой", label: "Авто" }), labelBody).label;
    expect(auto.id).toMatch(/^label_[a-z0-9]+$/);

    const user = await registerUser(server().baseUrl);
    expect(expectOk(await user.api.get("/api/labels"), labelsBody).labels.map((l) => l.id)).toEqual(expect.arrayContaining(["spambot", fromShort.id, auto.id]));
    expect(expectOk(await m.api.post(`/api/admin/users/${user.id}/label`, { label: "spambot" }), labelUserBody).user.safetyLabel).toBe("spambot");
  });

  test("POST /labels: ошибки", async () => {
    const m = await mod();
    const NEED = "Нужны идентификатор, короткая надпись и название";
    expectError(await m.api.post("/api/admin/labels", {}), 400, NEED);
    expectError(await m.api.post("/api/admin/labels", { id: "x1", short: "X" }), 400, NEED);
    expectError(await m.api.post("/api/admin/labels", { id: "x1", label: "Икс" }), 400, NEED);
    expectError(await m.api.post("/api/admin/labels", { id: "SCAM", short: "X", label: "Дубль" }), 400, "Метка с таким идентификатором уже есть");
  });

  test("PATCH /labels/:id: частичное изменение; несуществующая — 404, пустые поля — 400", async () => {
    const m = await mod();
    const label = expectOk(await m.api.post("/api/admin/labels", { id: "patchme", short: "P", label: "Правка", hint: "h", color: "#000" }), labelBody).label;
    const patched = expectOk(await m.api.patch("/api/admin/labels/patchme", { short: "new", color: "#fff" }), labelBody).label;
    expect(patched).toEqual({ ...label, short: "NEW", color: "#fff" });
    expect(expectOk(await m.api.patch("/api/admin/labels/patchme", {}), labelBody).label).toEqual(patched);

    expectError(await m.api.patch("/api/admin/labels/nolabel", { short: "X" }), 404, "Метка не найдена");
    expectError(await m.api.patch("/api/admin/labels/patchme", { short: "  " }), 400, "Нужны короткая надпись и название");
    expectError(await m.api.patch("/api/admin/labels/patchme", { label: "" }), 400, "Нужны короткая надпись и название");
  });

  test("DELETE /labels/:id: метка снимается со всех пользователей; несуществующая — тоже ok", async () => {
    const { baseUrl } = server();
    const m = await mod();
    expectOk(await m.api.post("/api/admin/labels", { id: "gone", short: "G", label: "Удаляемая" }), labelBody);
    const user = await registerUser(baseUrl);
    const viewer = await registerUser(baseUrl);
    expectOk(await m.api.post(`/api/admin/users/${user.id}/label`, { label: "gone" }), labelUserBody);
    expect((await viewer.api.get(`/api/users/${user.id}`)).body.user.safetyLabel).toBe("gone");

    expect(expectOk(await m.api.delete("/api/admin/labels/gone"), okBody)).toEqual({ ok: true });
    expect((await viewer.api.get(`/api/users/${user.id}`)).body.user).not.toHaveProperty("safetyLabel");
    expect(expectOk(await m.api.get("/api/admin/labels"), labelsBody).labels.some((l) => l.id === "gone")).toBe(false);
    expect(expectOk(await m.api.get("/api/admin/moderation"), moderationBody).labeled.some((u) => u.id === user.id)).toBe(false);
    expectOk(await m.api.delete("/api/admin/labels/gone"), okBody);
  });
});

describe("каталог статусов профиля", () => {
  test("POST и DELETE /status-catalog: элемент виден в /api/status-catalog и в обзоре модерации", async () => {
    const m = await mod();
    const user = await registerUser(server().baseUrl);
    expect((await user.api.get("/api/status-catalog")).body).toEqual({ items: [] });

    const item = expectOk(await m.api.post("/api/admin/status-catalog", { image: PNG, name: "  " + "С".repeat(50) + "  " }), catalogItemBody).item;
    expect(item).toMatchObject({ image: PNG, name: "С".repeat(40) });
    const noName = expectOk(await m.api.post("/api/admin/status-catalog", { image: PNG }), catalogItemBody).item;
    expect(noName.name).toBe("");

    expect((await user.api.get("/api/status-catalog")).body).toEqual({ items: [item, noName] });
    expect(expectOk(await m.api.get("/api/admin/moderation"), moderationBody).statusCatalog).toEqual([item, noName]);

    expect(expectOk(await m.api.delete(`/api/admin/status-catalog/${item.id}`), okBody)).toEqual({ ok: true });
    expect((await user.api.get("/api/status-catalog")).body).toEqual({ items: [noName] });
    expectOk(await m.api.delete("/api/admin/status-catalog/st_none_none"), okBody);
  });

  test("POST /status-catalog: некорректная и слишком большая картинка", async () => {
    const m = await mod();
    for (const image of [undefined, "", "https://example.invalid/a.png", "data:image/svg+xml;base64,PHN2Zz4=", "data:image/png;base64,не base64"]) {
      expectError(await m.api.post("/api/admin/status-catalog", { image, name: "x" }), 400, "Некорректное изображение");
    }
    const big = "data:image/png;base64," + "A".repeat(80 * 1024);
    expectError(await m.api.post("/api/admin/status-catalog", { image: big }), 400, "Картинка слишком большая");
  });
});

describe("цены", () => {
  const put = (user: TestUser, json: unknown): Promise<ApiResponse> => user.api.request("PUT", "/api/admin/pricing", { json });

  test("GET /pricing: пока ничего не меняли — значения по умолчанию", async () => {
    const p = await pricer();
    const body = expectOk(await p.api.get("/api/admin/pricing"), pricingWithDefaultsBody);
    expect(body.pricing).toEqual(body.defaults);
    expect(body.defaults).toMatchObject({
      premiumPlans: [
        { id: "1m", days: 30, priceRub: 99, label: "1 месяц" },
        { id: "3m", days: 90, priceRub: 249, label: "3 месяца" },
        { id: "6m", days: 180, priceRub: 449, label: "6 месяцев" },
        { id: "12m", days: 365, priceRub: 799, label: "12 месяцев" },
      ],
      ads: { priceRub: 20, days: 30 },
      rubPerStar: 2,
      starCosts: { boost: 10, delete: 5 },
    });
    expect(body.defaults.starPacks.map((s) => s.stars)).toEqual([50, 100, 250, 500, 1000, 2500]);
    expect(body.defaults.businessPlans.map((s) => s.priceRub)).toEqual([299, 799, 1499, 2499]);
  });

  test("PUT /pricing: частичное обновление, нормализация id, сортировка наборов; видно в /api/premium/me", async () => {
    const { baseUrl } = server();
    const p = await pricer();
    const res = await put(p, {
      premiumPlans: [
        { id: " Month ", days: 30, priceRub: 150, label: "  Месяц  " },
        { id: "30", days: 60, priceRub: 250, label: "Два" },
        { id: "month", days: 90, priceRub: 350, label: "Три" },
        { days: 7, priceRub: 50, label: "Неделя" },
      ],
      starPacks: [
        { id: "big", stars: 1000, priceRub: 1500 },
        { stars: 10, priceRub: 20 },
      ],
      rubPerStar: 1.234,
      ads: { priceRub: 30, days: 14 },
      starCosts: { boost: 0, delete: 3 },
    });
    const { pricing } = expectOk(res, pricingBody);
    expect(pricing.premiumPlans).toEqual([
      { id: "month", days: 30, priceRub: 150, label: "Месяц" },
      { id: "p30", days: 60, priceRub: 250, label: "Два" },
      { id: "month_2", days: 90, priceRub: 350, label: "Три" },
      { id: "p7d", days: 7, priceRub: 50, label: "Неделя" },
    ]);
    expect(pricing.starPacks).toEqual([
      { id: "stars_10", stars: 10, priceRub: 20 },
      { id: "big", stars: 1000, priceRub: 1500 },
    ]);
    expect(pricing).toMatchObject({ rubPerStar: 1.23, ads: { priceRub: 30, days: 14 }, starCosts: { boost: 0, delete: 3 } });
    // Не переданное остаётся прежним.
    const after = expectOk(await p.api.get("/api/admin/pricing"), pricingWithDefaultsBody);
    expect(after.pricing).toEqual(pricing);
    expect(after.pricing.businessPlans).toEqual(after.defaults.businessPlans);

    const user = await registerUser(baseUrl);
    const me = await user.api.get("/api/premium/me");
    expect(me.status, me.text).toBe(200);
    expect(me.body.plans).toEqual({
      month: { days: 30, priceRub: 150, label: "Месяц", stars: Math.ceil(150 / 1.23) },
      p30: { days: 60, priceRub: 250, label: "Два", stars: Math.ceil(250 / 1.23) },
      month_2: { days: 90, priceRub: 350, label: "Три", stars: Math.ceil(350 / 1.23) },
      p7d: { days: 7, priceRub: 50, label: "Неделя", stars: Math.ceil(50 / 1.23) },
    });

    // Пустой PUT ничего не меняет.
    expect(expectOk(await put(p, {}), pricingBody).pricing).toEqual(pricing);
  });

  test("PUT /pricing: первая же ошибка — 400, и ничего не сохраняется", async () => {
    const p = await pricer();
    const before = expectOk(await p.api.get("/api/admin/pricing"), pricingWithDefaultsBody).pricing;
    const plan = { days: 30, priceRub: 100, label: "x" };
    const cases: Array<[unknown, string]> = [
      [{ premiumPlans: [] }, "Premium: нужен хотя бы один тариф"],
      [{ premiumPlans: "1m" }, "Premium: нужен хотя бы один тариф"],
      [{ businessPlans: Array(13).fill(plan) }, "Бизнес: не больше 12 тарифов"],
      [{ premiumPlans: [{ ...plan, days: 0 }] }, "Premium: срок должен быть от 1 до 3650 дней"],
      [{ premiumPlans: [{ ...plan, days: 1.5 }] }, "Premium: срок должен быть от 1 до 3650 дней"],
      [{ premiumPlans: [{ ...plan, priceRub: 1_000_001 }] }, "Premium: цена должна быть целым числом от 1 до 1000000 ₽"],
      [{ businessPlans: [{ ...plan, label: "  " }] }, "Бизнес: укажите название тарифа"],
      [{ starPacks: [] }, "Звёзды: нужен хотя бы один набор"],
      [{ starPacks: Array(13).fill({ stars: 1, priceRub: 1 }) }, "Звёзды: не больше 12 наборов"],
      [{ starPacks: [{ stars: 0, priceRub: 1 }] }, "Звёзды: количество должно быть от 1 до 1000000"],
      [{ starPacks: [{ stars: 1, priceRub: "1" + "0".repeat(7) }] }, "Звёзды: цена должна быть целым числом от 1 до 1000000 ₽"],
      [{ ads: { priceRub: 0, days: 1 } }, "Реклама: цена от 1 ₽ и срок от 1 до 3650 дней"],
      [{ ads: null }, "Реклама: цена от 1 ₽ и срок от 1 до 3650 дней"],
      [{ rubPerStar: 0 }, "Курс: от 0.01 до 1000 ₽ за звезду"],
      [{ rubPerStar: "abc" }, "Курс: от 0.01 до 1000 ₽ за звезду"],
      [{ starCosts: { boost: -1, delete: 0 } }, "Платные действия: целое число звёзд от 0"],
      [{ starCosts: { boost: 1 } }, "Платные действия: целое число звёзд от 0"],
      // Верное поле перед неверным тоже не сохраняется.
      [{ premiumPlans: [{ ...plan, id: "ok" }], rubPerStar: 5000 }, "Курс: от 0.01 до 1000 ₽ за звезду"],
    ];
    for (const [body, error] of cases) expectError(await put(p, body), 400, error);
    expect(expectOk(await p.api.get("/api/admin/pricing"), pricingWithDefaultsBody).pricing).toEqual(before);
  });

  test("DELETE /pricing: сброс к значениям по умолчанию", async () => {
    const p = await pricer();
    const { pricing } = expectOk(await p.api.delete("/api/admin/pricing"), pricingBody);
    const body = expectOk(await p.api.get("/api/admin/pricing"), pricingWithDefaultsBody);
    expect(pricing).toEqual(body.defaults);
    expect(body.pricing).toEqual(body.defaults);
    const user = await registerUser(server().baseUrl);
    expect(Object.keys((await user.api.get("/api/premium/me")).body.plans)).toEqual(["1m", "3m", "6m", "12m"]);
  });
});
