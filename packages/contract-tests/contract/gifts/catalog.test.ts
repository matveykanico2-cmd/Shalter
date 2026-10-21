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
