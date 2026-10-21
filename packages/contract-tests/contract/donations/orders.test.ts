// Подключённый донат-сервис (DonatePay: токен + страница в окружении): заявка на
// покупку превращается в заказ с кодом для комментария к донату — без сообщений
// админу. Фоновый опрос DonatePay в SHALTER_TEST_MODE выключен, а адрес страницы
// никуда не ведёт, поэтому наружу ничего не уходит.
import { describe, expect, test } from "vitest";
import { donationOrderBody, donationStatusBody } from "../../schemas/donations";
import { starsGrantedSelfBody } from "../../schemas/stars";
import { expectError, expectOk } from "../../support/expect";
import { registerUsers, type TestUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { adminEnv, dmWith, registerAdmin, starsBalance, wsPool } from "../stars/helpers";

const ADMIN_PHONE = "+70000000913";
const PAGE = "http://127.0.0.1:9/donatepay-page";
const server = useServer({ env: { ...adminEnv(ADMIN_PHONE), DONATEPAY_API_TOKEN: "test-token", DONATEPAY_PAGE_URL: PAGE } });
const ws = wsPool();

let adminUser: TestUser;
async function admin(): Promise<TestUser> {
  adminUser ??= await registerAdmin(server().baseUrl, ADMIN_PHONE);
  return adminUser;
}

describe("заказ через DonatePay", () => {
  test("звёзды, Premium, подарок: код заказа, ссылка и сумма в рублях; админу ничего не пишется", async () => {
    const adm = await admin();
    const [user, friend] = await registerUsers(server().baseUrl, 2);
    const adminWs = await ws(adm);

    const stars = expectOk(await user.api.post("/api/stars/request", { packId: "stars_250" }), donationOrderBody);
    expect(stars).toMatchObject({ donationUrl: PAGE, provider: "donatepay", amountRub: 500 });
    const premium = expectOk(await user.api.post("/api/premium/request", { plan: "3m" }), donationOrderBody);
    expect(premium).toMatchObject({ donationUrl: PAGE, provider: "donatepay", amountRub: 249 });
    const gift = expectOk(await user.api.post("/api/gifts/request", { giftId: "cake", recipientId: friend.id }), donationOrderBody);
    expect(gift).toMatchObject({ donationUrl: PAGE, provider: "donatepay", amountRub: 25 });
    expect(new Set([stars.code, premium.code, gift.code]).size).toBe(3);

    // Пока донат не пришёл — ничего не выдано.
    expect(await starsBalance(user)).toBe(0);
    expect((await user.api.get("/api/premium/me")).body.isPremium).toBe(false);
    expect((await friend.api.get("/api/auth/session")).body.user.giftsReceived).toEqual([]);
    expect(await dmWith(user, adm.id)).toBeUndefined();
    await adminWs.expectNone("message:new");
  });

  test("главный админ по-прежнему получает сразу, без заказа", async () => {
    const adm = await admin();
    expectOk(await adm.api.post("/api/stars/request", { packId: "stars_50" }), starsGrantedSelfBody);
  });
});

describe("/api/donation-alerts без client id/secret", () => {
  test("status: DonatePay настроен, DonationAlerts нет; /connect — 503 текстом", async () => {
    const adm = await admin();
    const [user] = await registerUsers(server().baseUrl, 1);
    expect(expectOk(await adm.api.get("/api/donation-alerts/status"), donationStatusBody)).toEqual({
      configured: false,
      connected: false,
      username: null,
      donatePayConfigured: true,
    });
    const connect = await adm.api.get("/api/donation-alerts/connect");
    expect(connect.status).toBe(503);
    expect(connect.text).toBe("DonationAlerts не настроен на сервере (нет client id/secret)");
    expectError(await user.api.get("/api/donation-alerts/status"), 403, "Недостаточно прав");
  });
});
