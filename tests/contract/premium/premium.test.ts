// Shalter Premium: /me, покупка за звёзды, заявка админу, выдача и снятие админом.
import { describe, expect, test } from "vitest";
import { requestToAdminBody } from "../../schemas/donations";
import { wsSelfUpdated } from "../../schemas/gifts";
import { wsMessageNew } from "../../schemas/messages";
import { buyWithStarsBody, premiumGrantBody, premiumMeBody, premiumSelfGrantBody } from "../../schemas/premium";
import { expectError, expectOk, expectShape } from "../../support/expect";
import { registerUser, registerUsers, type TestUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import {
  NO_RIGHTS,
  WAIT,
  adminEnv,
  dmWith,
  expectAll401,
  grantStars,
  messagesIn,
  newMessageFrom,
  registerAdmin,
  selfOf,
  starsBalance,
  wsPool,
} from "../stars/helpers";

const ADMIN_PHONE = "+70000000912";
const server = useServer({ env: adminEnv(ADMIN_PHONE) });
const ws = wsPool();

let adminUser: TestUser;
async function admin(): Promise<TestUser> {
  adminUser ??= await registerAdmin(server().baseUrl, ADMIN_PHONE);
  return adminUser;
}

const DAY = 86_400_000;
/** premiumUntil ≈ сейчас + days (с запасом на медленную машину). */
function expectUntilInDays(iso: string | undefined, days: number, from = Date.now()) {
  expect(iso).toBeTruthy();
  const t = Date.parse(iso!);
  expect(t).toBeGreaterThan(from + days * DAY - 60_000);
  expect(t).toBeLessThan(Date.now() + days * DAY + 60_000);
}

const PLANS = {
  "1m": { days: 30, priceRub: 99, label: "1 месяц", stars: 50 },
  "3m": { days: 90, priceRub: 249, label: "3 месяца", stars: 125 },
  "6m": { days: 180, priceRub: 449, label: "6 месяцев", stars: 225 },
  "12m": { days: 365, priceRub: 799, label: "12 месяцев", stars: 400 },
};

test("без сессии — 401", async () => {
  await expectAll401(server().baseUrl, [
    ["GET", "/api/premium/me"],
    ["POST", "/api/premium/buy-with-stars"],
    ["POST", "/api/premium/request"],
    ["POST", "/api/premium/grant"],
  ]);
});

describe("GET /api/premium/me", () => {
  test("новый пользователь: без Premium, тарифы с ценой в звёздах (₽ / 2, вверх)", async () => {
    const user = await registerUser(server().baseUrl);
    const body = expectOk(await user.api.get("/api/premium/me"), premiumMeBody);
    expect(body).toEqual({ isPremium: false, premiumForever: false, isAdmin: false, plans: PLANS, starsBalance: 0 });
    expect(Object.keys(body.plans)).toEqual(["1m", "3m", "6m", "12m"]);
  });

  test("главный админ — isAdmin: true", async () => {
    const adm = await admin();
    expect(expectOk(await adm.api.get("/api/premium/me"), premiumMeBody).isAdmin).toBe(true);
  });
});

describe("POST /api/premium/buy-with-stars", () => {
  test("не хватает звёзд — 400, баланс не тронут", async () => {
    const user = await registerUser(server().baseUrl);
    expectError(await user.api.post("/api/premium/buy-with-stars", { plan: "3m" }), 400, "Недостаточно звёзд: нужно 125 ⭐");
    // Неизвестный тариф — первый (1m).
    expectError(await user.api.post("/api/premium/buy-with-stars", { plan: "nope" }), 400, "Недостаточно звёзд: нужно 50 ⭐");
    expectError(await user.api.post("/api/premium/buy-with-stars"), 400, "Недостаточно звёзд: нужно 50 ⭐");
  });

  test("покупка и продление: звёзды списаны, срок сложился, квитанция в «Избранном», self:updated только себе", async () => {
    const { baseUrl } = server();
    const adm = await admin();
    const [user, outsider] = await registerUsers(baseUrl, 2);
    await grantStars(adm, user, 200);
    const userWs = await ws(user);
    const outsiderWs = await ws(outsider);

    const t0 = Date.now();
    const first = expectOk(await user.api.post("/api/premium/buy-with-stars", { plan: "1m" }), buyWithStarsBody);
    expect(first).toMatchObject({ delivered: true, stars: 50, balance: 150 });
    const saved = await dmWith(user, user.id);
    expect(saved?.id).toBe(first.chatId);
    const ev = expectShape(wsSelfUpdated, await userWs.waitFor("self:updated", (e) => e.user?.isPremium === true, WAIT));
    expect(ev.user.id).toBe(user.id);
    await userWs.waitFor("message:new", newMessageFrom(user.id, "🎉 Вам выдан Shalter Premium на 1 месяц за 50 ⭐!"), WAIT);

    const me1 = expectOk(await user.api.get("/api/premium/me"), premiumMeBody);
    expect(me1).toMatchObject({ isPremium: true, premiumForever: false, starsBalance: 150 });
    expectUntilInDays(me1.premiumUntil, 30, t0);

    const second = expectOk(await user.api.post("/api/premium/buy-with-stars", { plan: "3m" }), buyWithStarsBody);
    expect(second).toMatchObject({ stars: 125, balance: 25, chatId: first.chatId });
    const me2 = expectOk(await user.api.get("/api/premium/me"), premiumMeBody);
    expect(Date.parse(me2.premiumUntil!) - Date.parse(me1.premiumUntil!)).toBe(90 * DAY);
    expect((await messagesIn(user, first.chatId)).map((m) => m.text)).toEqual([
      "🎉 Вам выдан Shalter Premium на 1 месяц за 50 ⭐!",
      "🎉 Shalter Premium продлён на 3 месяца за 125 ⭐!",
    ]);
    expect((await selfOf(user)).isPremium).toBe(true);
    await outsiderWs.expectNone("self:updated");
  });
});

describe("POST /api/premium/request", () => {
  test("обычный пользователь: заявка админу в личку, Premium не выдан", async () => {
    const { baseUrl } = server();
    const adm = await admin();
    const [user, outsider] = await registerUsers(baseUrl, 2);
    const adminWs = await ws(adm);
    const outsiderWs = await ws(outsider);

    const body = expectOk(await user.api.post("/api/premium/request", { plan: "6m" }), requestToAdminBody);
    expect(body.adminPhone).toBe(ADMIN_PHONE);
    const text = `Хочу оформить Shalter Premium на 6 месяцев за 449₽. Перевожу на ${ADMIN_PHONE} и жду подтверждения 🙏`;
    expect(expectShape(wsMessageNew, await adminWs.waitFor("message:new", newMessageFrom(user.id, text), WAIT)).chatId).toBe(body.chatId);
    expect((await user.api.get("/api/premium/me")).body.isPremium).toBe(false);
    await outsiderWs.expectNone("message:new");

    // С Premium текст — «продлить».
    await grantStars(adm, user, 50);
    expectOk(await user.api.post("/api/premium/buy-with-stars", { plan: "1m" }), buyWithStarsBody);
    expectOk(await user.api.post("/api/premium/request", {}), requestToAdminBody);
    await adminWs.waitFor(
      "message:new",
      newMessageFrom(user.id, `Хочу продлить Shalter Premium на 1 месяц за 99₽. Перевожу на ${ADMIN_PHONE} и жду подтверждения 🙏`),
      WAIT,
    );
  });

  test("главный админ выдаёт Premium себе сразу", async () => {
    const adm = await admin();
    const t0 = Date.now();
    const body = expectOk(await adm.api.post("/api/premium/request", { plan: "12m" }), premiumSelfGrantBody);
    expect(body).toMatchObject({ adminPhone: ADMIN_PHONE, delivered: true });
    expect((await dmWith(adm, adm.id))?.id).toBe(body.chatId);
    const me = expectOk(await adm.api.get("/api/premium/me"), premiumMeBody);
    expect(me.isPremium).toBe(true);
    expectUntilInDays(me.premiumUntil, 365, t0);
    const texts = (await messagesIn(adm, body.chatId)).map((m) => m.text);
    expect(texts).toContain("🎉 Вам выдан Shalter Premium на 12 месяцев! Спасибо, что поддерживаете проект.");
  });
});

describe("POST /api/premium/grant", () => {
  test("не админ — 403, неизвестный пользователь — 404", async () => {
    const { baseUrl } = server();
    const adm = await admin();
    const [user, other] = await registerUsers(baseUrl, 2);
    expectError(await user.api.post("/api/premium/grant", { userId: other.id }), 403, NO_RIGHTS);
    expectError(await adm.api.post("/api/premium/grant", { userId: "u_nope" }), 404, "Пользователь не найден");
    expectError(await adm.api.post("/api/premium/grant", {}), 404, "Пользователь не найден");
    expect((await other.api.get("/api/premium/me")).body.isPremium).toBe(false);
  });

  test("по умолчанию 30 дней, days, навсегда, снятие; сообщение и self:updated получателю", async () => {
    const { baseUrl } = server();
    const adm = await admin();
    const [user, outsider] = await registerUsers(baseUrl, 2);
    const userWs = await ws(user);
    const outsiderWs = await ws(outsider);

    const t0 = Date.now();
    const g1 = expectOk(await adm.api.post("/api/premium/grant", { userId: user.id, days: "abc" }), premiumGrantBody);
    expect(g1.user).toMatchObject({ id: user.id, isPremium: true });
    expectUntilInDays(g1.user.premiumUntil, 30, t0);
    expect(expectShape(wsSelfUpdated, await userWs.waitFor("self:updated", () => true, WAIT)).user).toEqual(g1.user);
    await userWs.waitFor("message:new", newMessageFrom(adm.id, "🎉 Вам выдан Shalter Premium на 30 дней! Спасибо, что поддерживаете проект."), WAIT);

    const g2 = expectOk(await adm.api.post("/api/premium/grant", { userId: user.id, days: 10.7 }), premiumGrantBody);
    expect(Date.parse(g2.user.premiumUntil!) - Date.parse(g1.user.premiumUntil!)).toBe(10 * DAY);
    await userWs.waitFor("message:new", newMessageFrom(adm.id, "🎉 Вам выдан Shalter Premium на 10 дней! Спасибо, что поддерживаете проект."), WAIT);

    const forever = expectOk(await adm.api.post("/api/premium/grant", { userId: user.id, forever: true }), premiumGrantBody);
    expect(forever.user).toMatchObject({ isPremium: true, premiumForever: true });
    expect(forever.user).not.toHaveProperty("premiumUntil");
    await userWs.waitFor("message:new", newMessageFrom(adm.id, "🎉 Вам выдан Shalter Premium навсегда! Спасибо, что поддерживаете проект."), WAIT);
    expect(expectOk(await user.api.get("/api/premium/me"), premiumMeBody)).toMatchObject({ isPremium: true, premiumForever: true });

    // «Навсегда» нельзя ни купить, ни заказать поверх.
    await grantStars(adm, user, 50);
    expectError(await user.api.post("/api/premium/buy-with-stars", { plan: "1m" }), 400, "У вас уже есть Shalter Premium навсегда");
    expectError(await user.api.post("/api/premium/request", { plan: "1m" }), 400, "У вас уже есть Shalter Premium навсегда");
    expect(await starsBalance(user)).toBe(50);
    // Выдача дней поверх «навсегда» оставляет «навсегда».
    const still = expectOk(await adm.api.post("/api/premium/grant", { userId: user.id, days: 5 }), premiumGrantBody);
    expect(still.user.premiumForever).toBe(true);

    userWs.clear();
    const off = expectOk(await adm.api.post("/api/premium/grant", { userId: user.id, premium: false }), premiumGrantBody);
    expect(off.user).toMatchObject({ isPremium: false });
    expect(off.user).not.toHaveProperty("premiumForever");
    expect(off.user).not.toHaveProperty("premiumUntil");
    await userWs.waitFor("self:updated", (e) => e.user?.isPremium === false, WAIT);
    await userWs.waitFor("message:new", newMessageFrom(adm.id, "Ваш Shalter Premium был отключён администрацией."), WAIT);
    expect(expectOk(await user.api.get("/api/premium/me"), premiumMeBody)).toMatchObject({ isPremium: false, premiumForever: false });
    await outsiderWs.expectNone("self:updated");
  });
});
