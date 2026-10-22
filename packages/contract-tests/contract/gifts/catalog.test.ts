// Каталог подарков глазами админа: снять встроенный с продажи и вернуть, тираж,
// выпуск своего подарка. Плюс границы поиска подарка по id: подарки пользователей
// (ug_…) в каталог не входят, а id не строкой — просто «не найден».
import { describe, expect, test } from "vitest";
import { buyNotEnough, catalogBody, catalogHiddenBody, catalogRemovedBody, catalogRestoredBody, giftBody, shopBody } from "../../schemas/gifts";
import { expectError, expectOk } from "../../support/expect";
import { registerUsers, type TestUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { adminEnv, registerAdmin } from "../stars/helpers";

const ADMIN_PHONE = "+70000000917";
const server = useServer({ env: adminEnv(ADMIN_PHONE) });

let adminUser: TestUser;
async function admin(): Promise<TestUser> {
  adminUser ??= await registerAdmin(server().baseUrl, ADMIN_PHONE);
  return adminUser;
}

const NOT_ON_SALE = "Этот подарок больше не продаётся";
// Числа в тексте — через toLocaleString("ru-RU"): разряды разделены неразрывным пробелом.
const SUPPLY_RANGE = `Тираж эксклюзива — от ${(1000).toLocaleString("ru-RU")} до ${(1000000).toLocaleString("ru-RU")}`;

async function shopIds(user: TestUser): Promise<Set<string>> {
  return new Set(expectOk(await user.api.get("/api/gifts"), shopBody).gifts.map((g) => g.id));
}

async function catalogEntry(adm: TestUser, id: string) {
  return expectOk(await adm.api.get("/api/gifts/catalog"), catalogBody).gifts.find((g) => g.id === id);
}

describe("DELETE /api/gifts/catalog/:id и /restore — встроенный подарок", () => {
  test("снятый пропадает из витрины и не продаётся, в каталоге — hidden; после возврата снова в продаже", async () => {
    const adm = await admin();
    const [a, b] = await registerUsers(server().baseUrl, 2);
    expect((await shopIds(a)).has("coffee")).toBe(true);

    expectOk(await adm.api.delete("/api/gifts/catalog/coffee"), catalogHiddenBody);
    expect((await shopIds(a)).has("coffee")).toBe(false);
    expectError(await a.api.post("/api/gifts/buy", { giftId: "coffee", recipientId: b.id }), 400, NOT_ON_SALE);
    expectError(await a.api.post("/api/gifts/request", { giftId: "coffee", recipientId: b.id }), 400, NOT_ON_SALE);
    expect(await catalogEntry(adm, "coffee")).toEqual({
      id: "coffee", emoji: "☕", name: "Кофе", priceRub: 5, premiumDays: 0, priceStars: 50, edited: true, hidden: true,
    });

    const restored = expectOk(await adm.api.post("/api/gifts/catalog/coffee/restore"), catalogRestoredBody);
    expect(restored.gift).toEqual({ id: "coffee", emoji: "☕", name: "Кофе", priceRub: 5, premiumDays: 0, priceStars: 50, edited: true });
    expect((await shopIds(a)).has("coffee")).toBe(true);
    // Прошёл проверку «в продаже» — дальше упирается в баланс.
    expectOk(await a.api.post("/api/gifts/buy", { giftId: "coffee", recipientId: b.id }), buyNotEnough, 402);
  });

  test("подарок не из витрины есть в каталоге админа, но не продаётся", async () => {
    const adm = await admin();
    const [a, b] = await registerUsers(server().baseUrl, 2);
    expect(await catalogEntry(adm, "ring")).toEqual({ id: "ring", emoji: "💍", name: "Кольцо", priceRub: 50, premiumDays: 0, priceStars: 500 });
    expectError(await a.api.post("/api/gifts/buy", { giftId: "ring", recipientId: b.id }), 400, NOT_ON_SALE);
  });
});

describe("POST /api/gifts/catalog/:id/supply", () => {
  test("новый тираж виден в витрине; у безлимитного тиража нет", async () => {
    const adm = await admin();
    const [a] = await registerUsers(server().baseUrl, 1);
    const updated = expectOk(await adm.api.post("/api/gifts/catalog/excl_comet/supply", { supply: 300000 }), giftBody).gift;
    expect(updated).toMatchObject({ id: "excl_comet", supply: 300000, edited: true, issued: 0, remaining: 300000 });
    // Комета не в витрине — там тираж проверяем на Пепе.
    expectOk(await adm.api.post("/api/gifts/catalog/tg_plush_pepe/supply", { supply: 4000 }), giftBody);
    expect(expectOk(await a.api.get("/api/gifts"), shopBody).gifts.find((g) => g.id === "tg_plush_pepe")).toMatchObject({
      supply: 4000,
      remaining: 4000,
    });
    expectError(await adm.api.post("/api/gifts/catalog/cake/supply", { supply: 5000 }), 400, "У этого подарка нет тиража — он безлимитный");
    expectError(await adm.api.post("/api/gifts/catalog/nope/supply", { supply: 5000 }), 404, "Подарок не найден");
  });
});

describe("POST /api/gifts/catalog — подарок, выпущенный админом", () => {
  test("появляется в витрине и продаётся; без выданных копий удаляется совсем", async () => {
    const adm = await admin();
    const [a, b] = await registerUsers(server().baseUrl, 2);
    const gift = expectOk(await adm.api.post("/api/gifts/catalog", { emoji: "🧪", name: "Колба", priceStars: 77 }), giftBody).gift;
    expect(gift).toMatchObject({ emoji: "🧪", name: "Колба", priceStars: 77, custom: true });
    expect(gift.id).toMatch(/^custom_/);
    expect((await shopIds(a)).has(gift.id)).toBe(true);
    expect(expectOk(await a.api.post("/api/gifts/buy", { giftId: gift.id, recipientId: b.id }), buyNotEnough, 402).needStars).toBe(77);

    expectOk(await adm.api.delete(`/api/gifts/catalog/${gift.id}`), catalogRemovedBody);
    expect((await shopIds(a)).has(gift.id)).toBe(false);
    expectError(await a.api.post("/api/gifts/buy", { giftId: gift.id, recipientId: b.id }), 404, "Подарок не найден");
  });
});

describe("поиск подарка по id", () => {
  test("свой нарисованный подарок (ug_…) через витрину и каталог не находится", async () => {
    const adm = await admin();
    const [a, b] = await registerUsers(server().baseUrl, 2);
    const own = expectOk(
      await a.api.post("/api/gifts/custom", { name: "Шарик", scene: { layers: [{ type: "emoji", emoji: "🎈" }] } }),
      giftBody,
    ).gift;
    expectError(await a.api.post("/api/gifts/buy", { giftId: own.id, recipientId: b.id }), 404, "Подарок не найден");
    expectError(await adm.api.delete(`/api/gifts/catalog/${own.id}`), 404, "Подарок не найден");
    expect(await catalogEntry(adm, own.id)).toBeUndefined();
  });

  test("giftId не строкой — 404, а не 500", async () => {
    const [a, b] = await registerUsers(server().baseUrl, 2);
    for (const giftId of [{ id: "cake" }, ["cake"], 42, null]) {
      expectError(await a.api.post("/api/gifts/buy", { giftId, recipientId: b.id }), 404, "Подарок не найден");
    }
  });
});

describe("каталог админа: права и проверки", () => {
  test("без раздела «giftshop» — 403 на всех маршрутах каталога", async () => {
    const [a] = await registerUsers(server().baseUrl, 1);
    const calls = [
      () => a.api.get("/api/gifts/catalog"),
      () => a.api.post("/api/gifts/catalog", { emoji: "🧪", name: "Колба", priceStars: 5 }),
      () => a.api.post("/api/gifts/catalog/rose/supply", { supply: 5000 }),
      () => a.api.post("/api/gifts/catalog/rose/scene", { scene: null }),
      () => a.api.delete("/api/gifts/catalog/rose"),
      () => a.api.post("/api/gifts/catalog/rose/restore"),
    ];
    for (const call of calls) expectError(await call(), 403, "Недостаточно прав");
  });

  test("GET /catalog: границы тиража и выпущенные копии у тиражных", async () => {
    const adm = await admin();
    const body = expectOk(await adm.api.get("/api/gifts/catalog"), catalogBody);
    expect([body.supplyMin, body.supplyMax]).toEqual([1000, 1000000]);
    expect(body.gifts.find((g) => g.id === "tg_plush_pepe")).toMatchObject({ issued: expect.any(Number), remaining: expect.any(Number) });
    expect(body.gifts.find((g) => g.id === "rose")).not.toHaveProperty("issued");
  });

  test("тираж: не целое и вне границ — 400", async () => {
    const adm = await admin();
    expectError(await adm.api.post("/api/gifts/catalog/excl_comet/supply", { supply: "много" }), 400, "Тираж должен быть целым числом");
    expectError(await adm.api.post("/api/gifts/catalog/excl_comet/supply", { supply: 1500.5 }), 400, "Тираж должен быть целым числом");
    expectError(await adm.api.post("/api/gifts/catalog/excl_comet/supply", { supply: 999 }), 400, SUPPLY_RANGE);
    expectError(await adm.api.post("/api/gifts/catalog/excl_comet/supply", {}), 400, "Тираж должен быть целым числом");
  });

  test("POST /catalog: ошибки по порядку проверок", async () => {
    const adm = await admin();
    const post = (body: object) => adm.api.post("/api/gifts/catalog", body);
    const valid = { emoji: "🧪", name: "Колба", priceStars: 5 };
    expectError(await post({ ...valid, scene: { layers: [] } }), 400, "Нарисуйте подарок — добавьте хотя бы одну фигуру");
    expectError(await post({ ...valid, scene: null }), 400, "Нарисуйте подарок — добавьте хотя бы одну фигуру");
    expectError(await post({ ...valid, emoji: "  " }), 400, "Укажите эмодзи подарка");
    expectError(await post({ ...valid, name: null }), 400, "Укажите название подарка");
    for (const priceStars of [0, 2.5, "x", undefined]) {
      expectError(await post({ ...valid, priceStars }), 400, "Цена — целое число от 1 звезды");
    }
    expectError(await post({ ...valid, exclusive: true }), 400, "Тираж должен быть целым числом");
    expectError(await post({ ...valid, exclusive: true, supply: 2000000 }), 400, SUPPLY_RANGE);
    for (const gifUrl of ["https://example.com/a.gif", "/uploads/../secret", "/uploads/abc_0123456789abcdef.gif", 5]) {
      expectError(await post({ ...valid, gifUrl }), 400, "Некорректная ссылка на гифку — загрузите файл заново");
    }
  });

  test("POST /catalog: эксклюзив с тиражом, Premium навсегда, сцена; лишнее в эмодзи и названии обрезается", async () => {
    const adm = await admin();
    const scene = { layers: [{ type: "emoji", emoji: "🦀" }] };
    const gift = expectOk(
      await adm.api.post("/api/gifts/catalog", {
        emoji: " 🦀🦀🦀🦀🦀 ",
        name: `  ${"Краб".repeat(20)}  `,
        priceStars: 30,
        premiumDays: null,
        exclusive: 1,
        supply: "2000",
        scene,
      }),
      giftBody,
    ).gift;
    expect(gift).toMatchObject({
      emoji: "🦀🦀🦀🦀",
      name: "Краб".repeat(15),
      priceStars: 30,
      priceRub: 3,
      premiumDays: null,
      supply: 2000,
      exclusive: true,
      custom: true,
      scene: { layers: [expect.objectContaining({ type: "emoji", emoji: "🦀" })] },
    });
    expect(gift.id).toMatch(/^custom_крабкрабкрабкрабкрабкраб_[a-z0-9]+$/);

    const plain = expectOk(await adm.api.post("/api/gifts/catalog", { emoji: "🍩", name: "Donut!", priceStars: 4, premiumDays: "abc" }), giftBody).gift;
    expect(plain).toMatchObject({ premiumDays: 0, priceRub: 1 });
    expect(plain).not.toHaveProperty("supply");
    expect(plain.id).toMatch(/^custom_donut_[a-z0-9]+$/);
  });

  test("POST /catalog/:id/scene: сцена встроенного подарка, очистка null; пустая — 400, нет подарка — 404", async () => {
    const adm = await admin();
    const [a] = await registerUsers(server().baseUrl, 1);
    const scene = { layers: [{ type: "emoji", emoji: "🌹" }] };
    const withScene = expectOk(await adm.api.post("/api/gifts/catalog/rose/scene", { scene }), giftBody).gift;
    expect(withScene).toMatchObject({ id: "rose", edited: true, scene: { layers: [expect.objectContaining({ emoji: "🌹" })] } });
    expect(expectOk(await a.api.get("/api/gifts"), shopBody).gifts.find((g) => g.id === "rose")).toHaveProperty("scene");

    const cleared = expectOk(await adm.api.post("/api/gifts/catalog/rose/scene", { scene: null }), giftBody).gift;
    expect(cleared).not.toHaveProperty("scene");
    expect(cleared.edited).toBe(true);

    expectError(await adm.api.post("/api/gifts/catalog/rose/scene", { scene: { layers: [] } }), 400, "Нарисуйте подарок — добавьте хотя бы одну фигуру");
    expectError(await adm.api.post("/api/gifts/catalog/nope/scene", { scene }), 404, "Подарок не найден");
    expectError(await adm.api.post("/api/gifts/catalog/nope/restore"), 404, "Скрытый подарок не найден");
  });
});
