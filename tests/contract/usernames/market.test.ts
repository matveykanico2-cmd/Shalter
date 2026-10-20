// Вторичный рынок юзернеймов (/api/usernames/market): выставить свой юзернейм,
// витрина, снять с продажи, купить за звёзды. Продавец получает звёзды и
// остаётся без юзернейма; обоим — сообщение от системного бота.
import { describe, expect, test } from "vitest";
import { auctionBody, listingBody, marketBody, marketBuyBody } from "../../schemas/usernames";
import { expectError, expectOk } from "../../support/expect";
import { registerUser, registerUsers, type TestUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { SYSTEM_BOT_ID, WAIT, adminEnv, freeName, grantStars, newMessageFrom, registerAdmin, renameTo, sessionUser, starsBalance, wsPool } from "./helpers";

const ADMIN_PHONE = "+70000000922";
const server = useServer({ env: adminEnv(ADMIN_PHONE) });
const ws = wsPool();

let adminUser: TestUser;
async function admin(): Promise<TestUser> {
  adminUser ??= await registerAdmin(server().baseUrl, ADMIN_PHONE);
  return adminUser;
}

async function sell(user: TestUser, priceStars: unknown) {
  return expectOk(await user.api.post("/api/usernames/market", { priceStars }), listingBody).listing;
}

async function market(user: TestUser) {
  return expectOk(await user.api.get("/api/usernames/market"), marketBody);
}

/** Пользователь без юзернейма: продал свой на рынке. */
async function userWithoutUsername(): Promise<TestUser> {
  const [seller, buyer] = await registerUsers(server().baseUrl, 2);
  await grantStars(await admin(), buyer, 10);
  const listing = await sell(seller, 10);
  expectOk(await buyer.api.post(`/api/usernames/market/${listing.id}/buy`), marketBuyBody);
  return seller;
}

describe("POST /api/usernames/market — выставить свой юзернейм", () => {
  test("цена — от 10 ⭐ (округляется до целого)", async () => {
    const user = await registerUser(server().baseUrl);
    for (const priceStars of [undefined, "abc", 9, 9.4, -100]) {
      expectError(await user.api.post("/api/usernames/market", { priceStars }), 400, "Цена — от 10 ⭐");
    }
    const listing = await sell(user, 9.5);
    expect(listing).toEqual({
      id: listing.id,
      username: user.username,
      sellerId: user.id,
      priceStars: 10,
      status: "open",
      buyerId: null,
      soldAt: null,
      createdAt: expect.any(String),
    });
  });

  test("повторно тот же юзернейм — 409", async () => {
    const user = await registerUser(server().baseUrl);
    await sell(user, 100);
    expectError(await user.api.post("/api/usernames/market", { priceStars: 50 }), 409, "Этот юзернейм уже выставлен");
  });

  test("без юзернейма — 400", async () => {
    const user = await userWithoutUsername();
    expect((await sessionUser(user)).username).toBe("");
    expectError(await user.api.post("/api/usernames/market", { priceStars: 50 }), 400, "Сначала займите юзернейм — продавать нечего");
  });

  test("юзернейм, который сейчас на аукционе, — 409", async () => {
    // Через профиль юзернейм открытого аукциона не занять — только выдачей администрацией.
    const user = await registerUser(server().baseUrl);
    const name = freeName();
    const adm = await admin();
    expectOk(await adm.api.post("/api/usernames", { username: name }), auctionBody);
    expect((await adm.api.post("/api/usernames/grant", { userId: user.id, username: name })).status).toBe(200);
    expectError(await user.api.post("/api/usernames/market", { priceStars: 50 }), 409, "Этот юзернейм сейчас на аукционе");
  });
});

describe("GET /api/usernames/market", () => {
  test("витрина по возрастанию цены, с продавцом и пометкой «моё»; баланс смотрящего", async () => {
    const { baseUrl } = server();
    const [cheap, pricey, viewer] = await registerUsers(baseUrl, 3);
    await grantStars(await admin(), viewer, 7);
    const expensive = await sell(pricey, 900_000);
    const low = await sell(cheap, 11);

    const forViewer = await market(viewer);
    expect(forViewer.balance).toBe(7);
    const mine = forViewer.listings.filter((l) => [expensive.id, low.id].includes(l.id));
    expect(mine.map((l) => l.id)).toEqual([low.id, expensive.id]);
    const prices = forViewer.listings.map((l) => l.priceStars);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    expect(mine[0]).toMatchObject({ ...low, mine: false, seller: { id: cheap.id, name: cheap.name, username: cheap.username } });

    const forSeller = await market(cheap);
    expect(forSeller.listings.find((l) => l.id === low.id)?.mine).toBe(true);
    expect(forSeller.listings.find((l) => l.id === expensive.id)?.mine).toBe(false);
  });

  test("продавец сменил юзернейм — объявление снимается само", async () => {
    const [seller, viewer] = await registerUsers(server().baseUrl, 2);
    const listing = await sell(seller, 30);
    expect((await market(viewer)).listings.some((l) => l.id === listing.id)).toBe(true);
    await renameTo(seller, freeName());
    expect((await market(viewer)).listings.some((l) => l.id === listing.id)).toBe(false);
    expectError(await seller.api.delete(`/api/usernames/market/${listing.id}`), 404, "Объявление не найдено");
  });
});

describe("DELETE /api/usernames/market/:id", () => {
  test("неизвестное — 404; чужое — 403", async () => {
    const [seller, other] = await registerUsers(server().baseUrl, 2);
    const listing = await sell(seller, 20);
    expectError(await seller.api.delete("/api/usernames/market/ul_1_nope"), 404, "Объявление не найдено");
    expectError(await other.api.delete(`/api/usernames/market/${listing.id}`), 403, "Снять объявление может только продавец");
    expect((await market(other)).listings.some((l) => l.id === listing.id)).toBe(true);
  });

  test("продавец снимает: статус withdrawn, пропадает с витрины, можно выставить заново", async () => {
    // ПОВЕДЕНИЕ-ВОПРОС: closeListing ставит soldAt и при снятии с продажи (withdrawn),
    // хотя ничего не продано.
    const [seller, viewer] = await registerUsers(server().baseUrl, 2);
    const listing = await sell(seller, 20);
    const body = expectOk(await seller.api.delete(`/api/usernames/market/${listing.id}`), listingBody);
    expect(body.listing).toEqual({ ...listing, status: "withdrawn", buyerId: null, soldAt: expect.any(String) });
    expect((await market(viewer)).listings.some((l) => l.id === listing.id)).toBe(false);
    expectError(await seller.api.delete(`/api/usernames/market/${listing.id}`), 404, "Объявление не найдено");
    expectError(await viewer.api.post(`/api/usernames/market/${listing.id}/buy`), 404, "Объявление не найдено");
    expect((await sell(seller, 25)).id).not.toBe(listing.id);
  });
});

describe("POST /api/usernames/market/:id/buy", () => {
  test("ошибки: нет объявления, своё, не хватает звёзд", async () => {
    const [seller, buyer] = await registerUsers(server().baseUrl, 2);
    await grantStars(await admin(), buyer, 49);
    const listing = await sell(seller, 50);
    expectError(await buyer.api.post("/api/usernames/market/ul_1_nope/buy"), 404, "Объявление не найдено");
    expectError(await seller.api.post(`/api/usernames/market/${listing.id}/buy`), 400, "Это ваше объявление");
    expectError(await buyer.api.post(`/api/usernames/market/${listing.id}/buy`), 402, "Не хватает звёзд: нужно 50 ⭐");
    expect(await starsBalance(buyer)).toBe(49);
    expect((await market(buyer)).listings.find((l) => l.id === listing.id)?.status).toBe("open");
  });

  test("продавец уже сменил юзернейм — 410, объявление снято", async () => {
    const [seller, buyer] = await registerUsers(server().baseUrl, 2);
    await grantStars(await admin(), buyer, 100);
    const listing = await sell(seller, 50);
    await renameTo(seller, freeName());
    expectError(await buyer.api.post(`/api/usernames/market/${listing.id}/buy`), 410, "Продавец больше не владеет этим юзернеймом");
    expectError(await buyer.api.post(`/api/usernames/market/${listing.id}/buy`), 404, "Объявление не найдено");
    expect(await starsBalance(buyer)).toBe(100);
  });

  test("покупка: звёзды переходят продавцу, юзернейм — покупателю, обоим сообщения", async () => {
    const { baseUrl } = server();
    const [seller, buyer, outsider] = await registerUsers(baseUrl, 3);
    await grantStars(await admin(), buyer, 120);
    const name = seller.username;
    const listing = await sell(seller, 75);
    const sellerWs = await ws(seller);
    const buyerWs = await ws(buyer);
    const outsiderWs = await ws(outsider);

    const body = expectOk(await buyer.api.post(`/api/usernames/market/${listing.id}/buy`), marketBuyBody);
    expect(body).toMatchObject({ ok: true, username: name, balance: 45, user: { id: buyer.id, username: name } });

    await sellerWs.waitFor(
      "message:new",
      newMessageFrom(SYSTEM_BOT_ID, `💰 Ваш юзернейм @${name} продан за 75 ⭐.\n\nЗвёзды уже на балансе. Новый юзернейм можно занять в настройках профиля.`),
      WAIT
    );
    await buyerWs.waitFor("message:new", newMessageFrom(SYSTEM_BOT_ID, `🎉 Юзернейм @${name} теперь ваш — списано 75 ⭐.`), WAIT);
    await outsiderWs.expectNone("message:new", newMessageFrom(SYSTEM_BOT_ID));

    expect(await starsBalance(seller)).toBe(75);
    expect(await starsBalance(buyer)).toBe(45);
    expect((await sessionUser(seller)).username).toBe("");
    const buyerSelf = await sessionUser(buyer);
    expect(buyerSelf.username).toBe(name);
    expect(buyerSelf).not.toHaveProperty("isCollectibleUsername");
    expect((await outsider.api.get(`/api/users/by-username/${name}`)).body.user.id).toBe(buyer.id);
    // Старый юзернейм покупателя освободился.
    await renameTo(outsider, buyer.username);

    expect((await market(outsider)).listings.some((l) => l.id === listing.id)).toBe(false);
    expectError(await outsider.api.post(`/api/usernames/market/${listing.id}/buy`), 404, "Объявление не найдено");
    expectError(await seller.api.delete(`/api/usernames/market/${listing.id}`), 404, "Объявление не найдено");
  });

  test("объявление покупателя на его старый юзернейм после покупки снимается само", async () => {
    const [seller, buyer, viewer] = await registerUsers(server().baseUrl, 3);
    await grantStars(await admin(), buyer, 10);
    const ownListing = await sell(buyer, 500);
    const listing = await sell(seller, 10);
    expectOk(await buyer.api.post(`/api/usernames/market/${listing.id}/buy`), marketBuyBody);
    expect((await market(viewer)).listings.some((l) => l.id === ownListing.id)).toBe(false);
  });
});
