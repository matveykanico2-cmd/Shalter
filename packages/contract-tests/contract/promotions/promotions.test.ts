// Промокоды: /api/promotions. Админ (раздел «Цены») создаёт коды на Premium, звёзды,
// кабинет рекламы или бизнес; каждый аккаунт активирует код один раз.
import { describe, expect, test } from "vitest";
import { wsSelfUpdated } from "../../schemas/gifts";
import { okBody } from "../../schemas/common";
import { promoCodeBody, promoListBody, promoRedeemBody } from "../../schemas/promotions";
import { expectError, expectOk, expectShape } from "../../support/expect";
import { registerUser, registerUsers, type TestUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { NO_RIGHTS, WAIT, adminEnv, dmWith, expectAll401, messagesIn, registerAdmin, selfOf, starsBalance, wsPool } from "../stars/helpers";

const ADMIN_PHONE = "+70000000931";
const server = useServer({ env: adminEnv(ADMIN_PHONE) });
const ws = wsPool();

let adminUser: TestUser;
async function admin(): Promise<TestUser> {
  adminUser ??= await registerAdmin(server().baseUrl, ADMIN_PHONE);
  return adminUser;
}

const create = (actor: TestUser, body: unknown) => actor.api.post("/api/promotions/admin/create", body);
const redeem = (actor: TestUser, code: string) => actor.api.post("/api/promotions/redeem", { code });

test("без сессии — 401", async () => {
  await expectAll401(server().baseUrl, [
    ["GET", "/api/promotions/admin"],
    ["POST", "/api/promotions/admin/create"],
    ["DELETE", "/api/promotions/admin/pc_x"],
    ["PATCH", "/api/promotions/admin/pc_x"],
    ["POST", "/api/promotions/redeem"],
  ]);
});

describe("админка", () => {
  test("не админ — 403 на всё", async () => {
    const user = await registerUser(server().baseUrl);
    expectError(await user.api.get("/api/promotions/admin"), 403, NO_RIGHTS);
    expectError(await create(user, { prize: "stars", config: { amount: 5 } }), 403, NO_RIGHTS);
    expectError(await user.api.delete("/api/promotions/admin/pc_x"), 403, NO_RIGHTS);
    expectError(await user.api.patch("/api/promotions/admin/pc_x", {}), 403, NO_RIGHTS);
  });

  test("создание: свой и сгенерированный код, конфиг из prize, список, лимит, удаление", async () => {
    const adm = await admin();
    const own = expectOk(await create(adm, { code: "spring-25", prize: "premium", config: { days: 30, type: "stars", amount: 999 }, usesTotal: 2 }), promoCodeBody).code;
    expect(own).toMatchObject({ code: "SPRING-25", prize: "premium", config: { type: "premium", days: 30 }, usesTotal: 2, used: 0, createdBy: adm.id });

    const gen = expectOk(await create(adm, { prize: "stars", config: { amount: 100 } }), promoCodeBody).code;
    expect(gen.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(gen).toMatchObject({ prize: "stars", config: { type: "stars", amount: 100 }, usesTotal: null });

    const list = expectOk(await adm.api.get("/api/promotions/admin"), promoListBody).codes;
    expect(list.map((c) => c.code)).toEqual(expect.arrayContaining(["SPRING-25", gen.code]));
    expect(list.find((c) => c.id === own.id)?.createdByName).toBe(adm.name);

    expect(expectOk(await adm.api.patch(`/api/promotions/admin/${own.id}`, { usesTotal: null }), promoCodeBody).code.usesTotal).toBeNull();
    expect(expectOk(await adm.api.patch(`/api/promotions/admin/${own.id}`, { usesTotal: 5 }), promoCodeBody).code.usesTotal).toBe(5);
    expectError(await adm.api.patch(`/api/promotions/admin/${own.id}`, { usesTotal: 0 }), 400, "Лимит активаций — целое число больше нуля");

    expectOk(await adm.api.delete(`/api/promotions/admin/${own.id}`), okBody);
    expectError(await adm.api.delete(`/api/promotions/admin/${own.id}`), 404, "Код не найден");
    expectError(await adm.api.patch(`/api/promotions/admin/${own.id}`, {}), 404, "Код не найден");
  });

  test("ошибки создания", async () => {
    const adm = await admin();
    expectOk(await create(adm, { code: "TAKEN1", prize: "ads", config: { days: 7 } }), promoCodeBody);
    expectError(await create(adm, { code: "taken1", prize: "ads", config: { days: 7 } }), 409, "Код TAKEN1 уже существует");
    expectError(await create(adm, { code: "a b", prize: "ads", config: { days: 7 } }), 400, "Код — от 4 до 32 символов: латинские буквы, цифры, _ и -");
    expectError(await create(adm, { prize: "gold", config: { days: 7 } }), 400, "Неизвестный тип подарка");
    expectError(await create(adm, { prize: "stars", config: { amount: 1.5 } }), 400, "Укажите количество звёзд");
    expectError(await create(adm, { prize: "premium" }), 400, "Укажите количество дней Premium");
    expectError(await create(adm, { prize: "business", config: { days: -1 } }), 400, "Укажите количество дней бизнеса");
    expectError(await create(adm, { prize: "ads", config: { days: 1 }, usesTotal: "x" }), 400, "Лимит активаций — целое число больше нуля");
  });
});

describe("POST /api/promotions/redeem", () => {
  test("звёзды: начислены один раз, запись в «Избранном», self:updated", async () => {
    const adm = await admin();
    const user = await registerUser(server().baseUrl);
    const { code } = expectOk(await create(adm, { prize: "stars", config: { amount: 40 } }), promoCodeBody).code;
    const userWs = await ws(user);

    const res = expectOk(await redeem(user, code.toLowerCase()), promoRedeemBody);
    expect(res).toEqual({ delivered: true, message: "🌟 Вам начислено 40 ⭐ по промокоду!", balance: 40 });
    expect(await starsBalance(user)).toBe(40);
    expectShape(wsSelfUpdated, await userWs.waitFor("self:updated", (e) => e.user?.id === user.id, WAIT));
    const saved = await dmWith(user, user.id);
    expect((await messagesIn(user, saved.id)).map((m) => m.text)).toEqual(["🌟 Вам начислено 40 ⭐ по промокоду!"]);

    expectError(await redeem(user, code), 400, "Вы уже активировали этот код");
    expect(await starsBalance(user)).toBe(40);
  });

  test("Premium и лимит активаций", async () => {
    const adm = await admin();
    const [a, b] = await registerUsers(server().baseUrl, 2);
    const promo = expectOk(await create(adm, { prize: "premium", config: { days: 10 }, usesTotal: 1 }), promoCodeBody).code;
    expect(expectOk(await redeem(a, promo.code), promoRedeemBody).message).toBe("🎉 Вам выдан Shalter Premium на 10 дн. по промокоду!");
    expect((await selfOf(a)).isPremium).toBe(true);
    expectError(await redeem(b, promo.code), 400, "Код уже использован");
    const list = expectOk(await adm.api.get("/api/promotions/admin"), promoListBody).codes;
    expect(list.find((c) => c.id === promo.id)?.used).toBe(1);
  });

  test("пустой и неизвестный код", async () => {
    const user = await registerUser(server().baseUrl);
    expectError(await user.api.post("/api/promotions/redeem", {}), 400, "Введите код");
    expectError(await redeem(user, "  "), 400, "Введите код");
    expectError(await redeem(user, "NOSUCHCODE"), 400, "Код не найден");
  });
});
