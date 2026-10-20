// Аукционы коллекционных юзернеймов (/api/usernames): список, создание админом,
// ставки, подведение итогов (close), отмена (DELETE) и выдача юзернейма админом.
// Звёзды списываются только при подведении итогов; уведомления — от системного бота.
import { describe, expect, test } from "vitest";
import { okBody } from "../../schemas/common";
import { wsMessageNew } from "../../schemas/messages";
import { notEnoughWithBalance } from "../../schemas/stars";
import { auctionBody, auctionsBody, bidBody, usernameGrantBody } from "../../schemas/usernames";
import { expectError, expectOk, expectShape } from "../../support/expect";
import { registerUser, registerUsers, type TestUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import {
  NO_RIGHTS,
  SYSTEM_BOT_ID,
  USERNAME_ROUTES,
  WAIT,
  adminEnv,
  expectAll401,
  freeName,
  grantStars,
  newMessageFrom,
  registerAdmin,
  renameTo,
  sessionUser,
  starsBalance,
  wsPool,
} from "./helpers";

const ADMIN_PHONE = "+70000000921";
const server = useServer({ env: adminEnv(ADMIN_PHONE) });
const ws = wsPool();

let adminUser: TestUser;
async function admin(): Promise<TestUser> {
  adminUser ??= await registerAdmin(server().baseUrl, ADMIN_PHONE);
  return adminUser;
}

async function createAuction(username: string, extra: Record<string, unknown> = {}) {
  return expectOk(await (await admin()).api.post("/api/usernames", { username, ...extra }), auctionBody).auction;
}

async function bid(user: TestUser, id: string, stars: number) {
  return expectOk(await user.api.post(`/api/usernames/${id}/bid`, { stars }), bidBody);
}

async function close(id: string) {
  return expectOk(await (await admin()).api.post(`/api/usernames/${id}/close`), auctionBody).auction;
}

async function listFor(user: TestUser) {
  return expectOk(await user.api.get("/api/usernames"), auctionsBody);
}

const HOUR = 3600_000;
const hoursOf = (a: { createdAt: string; endsAt: string }) => (Date.parse(a.endsAt) - Date.parse(a.createdAt)) / HOUR;

describe("без сессии", () => {
  test("все маршруты /api/usernames — 401 unauthorized", async () => {
    await expectAll401(server().baseUrl, USERNAME_ROUTES);
  });
});

describe("права админа", () => {
  test("создать, закрыть, удалить аукцион и выдать юзернейм может только админ — иначе 403", async () => {
    const [user, other] = await registerUsers(server().baseUrl, 2);
    const auction = await createAuction(freeName());
    expectError(await user.api.post("/api/usernames", { username: freeName() }), 403, NO_RIGHTS);
    expectError(await user.api.post(`/api/usernames/${auction.id}/close`), 403, NO_RIGHTS);
    expectError(await user.api.delete(`/api/usernames/${auction.id}`), 403, NO_RIGHTS);
    expectError(await user.api.post("/api/usernames/grant", { userId: other.id, username: freeName() }), 403, NO_RIGHTS);
    // Права проверяются раньше, чем существование аукциона.
    expectError(await user.api.post("/api/usernames/ua_nope/close"), 403, NO_RIGHTS);
    expect((await listFor(user)).auctions.find((a) => a.id === auction.id)?.status).toBe("open");
  });
});

describe("GET /api/usernames", () => {
  test("обычный пользователь: аукционы, баланс, шаг ставки, isAdmin=false; админ — isAdmin=true", async () => {
    const user = await registerUser(server().baseUrl);
    const body = await listFor(user);
    expect(body).toMatchObject({ balance: 0, minStep: 10, isAdmin: false });
    expect((await listFor(await admin())).isAdmin).toBe(true);
  });

  test("новые аукционы — первыми; лидер (publicUser) и моя последняя ставка", async () => {
    const { baseUrl } = server();
    const adm = await admin();
    const [a, b, outsider] = await registerUsers(baseUrl, 3);
    await grantStars(adm, a, 500);
    await grantStars(adm, b, 500);
    const older = await createAuction(freeName("old"));
    const newer = await createAuction(freeName("new"), { startPriceStars: 20 });
    await bid(a, newer.id, 20);
    await bid(b, newer.id, 30);
    await bid(a, newer.id, 45);

    const forA = await listFor(a);
    const ids = forA.auctions.map((x) => x.id);
    expect(ids.indexOf(newer.id)).toBeLessThan(ids.indexOf(older.id));
    const viewA = forA.auctions.find((x) => x.id === newer.id)!;
    expect(viewA).toMatchObject({ topBid: 45, topBidderId: a.id, currentPriceStars: 45, myBid: 45, expired: false, status: "open" });
    expect(viewA.topBidder).toMatchObject({ id: a.id, name: a.name, username: a.username });
    expect(viewA.bids.map((x) => [x.userId, x.stars])).toEqual([
      [a.id, 20],
      [b.id, 30],
      [a.id, 45],
    ]);
    expect((await listFor(b)).auctions.find((x) => x.id === newer.id)?.myBid).toBe(30);
    expect((await listFor(outsider)).auctions.find((x) => x.id === newer.id)?.myBid).toBeNull();
    expect(forA.auctions.find((x) => x.id === older.id)).toMatchObject({ topBid: null, topBidderId: null, topBidder: null, myBid: null, currentPriceStars: 0 });
  });
});

describe("POST /api/usernames — создание аукциона", () => {
  test("юзернейм проверяется как в профиле: формат, резерв, занятость, повтор на аукционе", async () => {
    const taken = await registerUser(server().baseUrl);
    const adm = await admin();
    for (const username of [undefined, "", "ab", "a".repeat(33), "with space", "кириллица"]) {
      expectError(await adm.api.post("/api/usernames", { username }), 400, "Юзернейм: 3–32 символа, латинские буквы, цифры и _");
    }
    expectError(await adm.api.post("/api/usernames", { username: "Admin" }), 409, "Этот юзернейм зарезервирован — выберите другой");
    expectError(await adm.api.post("/api/usernames", { username: taken.username.toUpperCase() }), 409, "Этот юзернейм уже занят");
    const name = freeName("dup");
    await createAuction(name);
    expectError(await adm.api.post("/api/usernames", { username: name.toUpperCase() }), 409, "Этот юзернейм уже на аукционе");
  });

  test("«@» и пробелы срезаются; стартовая цена — целое ≥ 0, по умолчанию 0; 24 часа по умолчанию", async () => {
    const name = freeName("Shiny");
    const auction = await createAuction(` @${name} `);
    expect(auction).toMatchObject({
      username: name,
      startPriceStars: 0,
      bids: [],
      topBid: null,
      topBidderId: null,
      currentPriceStars: 0,
      status: "open",
      expired: false,
    });
    expect(auction).not.toHaveProperty("winnerId");
    expect(auction).not.toHaveProperty("settledAt");
    expect(hoursOf(auction)).toBeCloseTo(24, 2);

    expect((await createAuction(freeName(), { startPriceStars: -50 })).startPriceStars).toBe(0);
    expect((await createAuction(freeName(), { startPriceStars: 12.9 })).currentPriceStars).toBe(12);
    expect((await createAuction(freeName(), { startPriceStars: "abc" })).startPriceStars).toBe(0);
  });

  test("длительность: часы — целые от 1 до 720 (30 дней); 0 и мусор — 24", async () => {
    const cases: Array<[unknown, number]> = [
      [1, 1],
      [5.7, 5],
      [-5, 1],
      [0, 24],
      ["x", 24],
      [1000, 720],
    ];
    for (const [hours, expected] of cases) {
      expect(hoursOf(await createAuction(freeName(), { hours })), `hours=${hours}`).toBeCloseTo(expected, 2);
    }
  });
});

describe("POST /api/usernames/:id/bid", () => {
  test("ошибки: нет аукциона, ставка ниже минимума, не хватает звёзд, уже лидер", async () => {
    const { baseUrl } = server();
    const adm = await admin();
    const [rich, poor] = await registerUsers(baseUrl, 2);
    await grantStars(adm, rich, 300);
    const auction = await createAuction(freeName(), { startPriceStars: 100 });

    expectError(await rich.api.post("/api/usernames/ua_nope/bid", { stars: 100 }), 404, "Аукцион не найден");
    for (const stars of [undefined, "abc", 99, 99.9]) {
      expectError(await rich.api.post(`/api/usernames/${auction.id}/bid`, { stars }), 400, "Минимальная ставка — 100 ⭐");
    }
    const noStars = await poor.api.post(`/api/usernames/${auction.id}/bid`, { stars: 100 });
    expect(noStars.status).toBe(402);
    expect(expectShape(notEnoughWithBalance, noStars.body)).toEqual({ error: "Не хватает звёзд — на балансе 0 ⭐", balance: 0 });

    const ok = await bid(rich, auction.id, 100.8);
    expect(ok.balance).toBe(300); // звёзды не резервируются
    expect(ok.auction).toMatchObject({ topBid: 100, topBidderId: rich.id, currentPriceStars: 100 });
    expectError(await rich.api.post(`/api/usernames/${auction.id}/bid`, { stars: 200 }), 409, "Вы и так лидируете");
    // Следующая ставка — минимум на шаг (10 ⭐) выше лидера.
    await grantStars(adm, poor, 500);
    expectError(await poor.api.post(`/api/usernames/${auction.id}/bid`, { stars: 109 }), 400, "Минимальная ставка — 110 ⭐");
    expect((await bid(poor, auction.id, 110)).auction.topBidderId).toBe(poor.id);
  });

  test("ставки на нулевой старт возможны и с нулевым балансом", async () => {
    // ПОВЕДЕНИЕ-ВОПРОС: при startPriceStars=0 первая ставка 0 ⭐ проходит без звёзд,
    // а spendStars(0) при подведении итогов вернёт false — такой «победитель» не получит юзернейм.
    const user = await registerUser(server().baseUrl);
    const auction = await createAuction(freeName());
    const res = await bid(user, auction.id, 0);
    expect(res).toMatchObject({ balance: 0, auction: { topBid: 0, topBidderId: user.id } });
    expect(await close(auction.id)).toMatchObject({ status: "cancelled" });
  });

  test("перебитый лидер получает сообщение от системного бота, другие — нет", async () => {
    const { baseUrl } = server();
    const adm = await admin();
    const [first, second, outsider] = await registerUsers(baseUrl, 3);
    await grantStars(adm, first, 100);
    await grantStars(adm, second, 100);
    const name = freeName();
    const auction = await createAuction(name, { startPriceStars: 10 });
    const firstWs = await ws(first);
    const secondWs = await ws(second);
    const outsiderWs = await ws(outsider);

    await bid(first, auction.id, 10);
    await secondWs.expectNone("message:new", newMessageFrom(SYSTEM_BOT_ID), 200);
    await bid(second, auction.id, 25);
    const ev = expectShape(wsMessageNew, await firstWs.waitFor("message:new", newMessageFrom(SYSTEM_BOT_ID, new RegExp(`^Вашу ставку на @${name} перебили — теперь 25 ⭐\\. Ставки принимаются до .+\\.$`)), WAIT));
    expect(ev.message.chatId).toBe(ev.chatId);
    await secondWs.expectNone("message:new", newMessageFrom(SYSTEM_BOT_ID));
    await outsiderWs.expectNone("message:new", newMessageFrom(SYSTEM_BOT_ID));
  });

  test("на закрытый аукцион ставить нельзя — 409", async () => {
    const user = await registerUser(server().baseUrl);
    const auction = await createAuction(freeName());
    await close(auction.id);
    expectError(await user.api.post(`/api/usernames/${auction.id}/bid`, { stars: 1000 }), 409, "Аукцион уже завершён");
  });
});

describe("POST /api/usernames/:id/close — подведение итогов", () => {
  test("неизвестный аукцион — 404", async () => {
    expectError(await (await admin()).api.post("/api/usernames/ua_nope/close"), 404, "Аукцион не найден");
  });

  test("без ставок — unsold", async () => {
    const auction = await createAuction(freeName());
    const closed = await close(auction.id);
    expect(closed).toMatchObject({ status: "unsold", expired: false, settledAt: expect.any(String) });
    expect(closed).not.toHaveProperty("winnerId");
    expect(closed).not.toHaveProperty("soldForStars");
  });

  test("победитель: списание звёзд, юзернейм с пометкой коллекционного, сообщение; повторный close ничего не меняет", async () => {
    const { baseUrl } = server();
    const adm = await admin();
    const [winner, loser, outsider] = await registerUsers(baseUrl, 3);
    await grantStars(adm, winner, 200);
    await grantStars(adm, loser, 200);
    const name = freeName("Gold");
    const auction = await createAuction(name, { startPriceStars: 50 });
    await bid(loser, auction.id, 50);
    await bid(winner, auction.id, 70);
    const winnerWs = await ws(winner);
    const loserWs = await ws(loser);
    const outsiderWs = await ws(outsider);

    const closed = await close(auction.id);
    expect(closed).toMatchObject({ status: "sold", winnerId: winner.id, soldForStars: 70, settledAt: expect.any(String), expired: false });
    await winnerWs.waitFor("message:new", newMessageFrom(SYSTEM_BOT_ID, `🏆 Вы выиграли аукцион: теперь ваш юзернейм @${name}. Списано 70 ⭐.`), WAIT);
    await loserWs.expectNone("message:new", newMessageFrom(SYSTEM_BOT_ID, /аукцион|Аукцион/));
    await outsiderWs.expectNone("message:new", newMessageFrom(SYSTEM_BOT_ID));

    expect(await starsBalance(winner)).toBe(130);
    expect(await starsBalance(loser)).toBe(200);
    expect(await sessionUser(winner)).toMatchObject({ username: name, usernameAuctionId: auction.id, isCollectibleUsername: true });
    expect((await winner.api.get(`/api/users/by-username/${name}`)).body.user.id).toBe(winner.id);
    // Старый юзернейм победителя освободился.
    await renameTo(outsider, winner.username);

    expect(await close(auction.id)).toEqual(closed);
    expect(await starsBalance(winner)).toBe(130);
    expect((await listFor(outsider)).auctions.find((a) => a.id === auction.id)).toMatchObject({ status: "sold", winnerId: winner.id });
    // Проданный юзернейм занят — новый аукцион на него не создать.
    expectError(await adm.api.post("/api/usernames", { username: name }), 409, "Этот юзернейм уже занят");
    // Смена юзернейма снимает пометку коллекционного.
    await renameTo(winner, freeName());
    const self = await sessionUser(winner);
    expect(self).not.toHaveProperty("usernameAuctionId");
    expect(self).not.toHaveProperty("isCollectibleUsername");
  });

  test("лидеру не хватило звёзд — юзернейм уходит следующему по его лучшей ставке", async () => {
    const { baseUrl } = server();
    const adm = await admin();
    const [leader, runnerUp] = await registerUsers(baseUrl, 2);
    await grantStars(adm, leader, 100);
    await grantStars(adm, runnerUp, 100);
    const name = freeName();
    const auction = await createAuction(name, { startPriceStars: 10 });
    await bid(runnerUp, auction.id, 10);
    await bid(leader, auction.id, 20);
    await bid(runnerUp, auction.id, 40);
    await bid(leader, auction.id, 90);
    await grantStars(adm, leader, -50);
    const leaderWs = await ws(leader);
    const runnerWs = await ws(runnerUp);

    const closed = await close(auction.id);
    expect(closed).toMatchObject({ status: "sold", winnerId: runnerUp.id, soldForStars: 40 });
    await leaderWs.waitFor(
      "message:new",
      newMessageFrom(SYSTEM_BOT_ID, `Вы выиграли @${name} за 90 ⭐, но на балансе не хватило звёзд — юзернейм ушёл следующему участнику.`),
      WAIT
    );
    await runnerWs.waitFor("message:new", newMessageFrom(SYSTEM_BOT_ID, `🏆 Вы выиграли аукцион: теперь ваш юзернейм @${name}. Списано 40 ⭐.`), WAIT);
    expect(await starsBalance(leader)).toBe(50);
    expect(await starsBalance(runnerUp)).toBe(60);
    expect((await sessionUser(runnerUp)).username).toBe(name);
  });

  test("никто не смог оплатить — cancelled, звёзды не тронуты", async () => {
    // ПОВЕДЕНИЕ-ВОПРОС: при ставках, которые никто не оплатил, статус «cancelled»
    // (как при отмене), а не «unsold».
    const { baseUrl } = server();
    const adm = await admin();
    const [a, b] = await registerUsers(baseUrl, 2);
    await grantStars(adm, a, 30);
    await grantStars(adm, b, 40);
    const auction = await createAuction(freeName(), { startPriceStars: 30 });
    await bid(a, auction.id, 30);
    await bid(b, auction.id, 40);
    await grantStars(adm, a, -30);
    await grantStars(adm, b, -1);
    const closed = await close(auction.id);
    expect(closed).toMatchObject({ status: "cancelled" });
    expect(closed).not.toHaveProperty("winnerId");
    expect(await starsBalance(a)).toBe(0);
    expect(await starsBalance(b)).toBe(39);
  });

  test("юзернейм открытого аукциона через профиль не занять — 409", async () => {
    const { baseUrl } = server();
    const squatter = await registerUser(baseUrl);
    const name = freeName();
    const auction = await createAuction(name, { startPriceStars: 10 });
    for (const username of [name, name.toUpperCase(), `@${name}`]) {
      expectError(await squatter.api.patch(`/api/users/${squatter.id}`, { username }), 409, "Этот юзернейм сейчас на аукционе");
    }
    expect((await sessionUser(squatter)).username).not.toBe(name);
    expect((await listFor(squatter)).auctions.find((a) => a.id === auction.id)?.status).toBe("open");
  });

  test("юзернейм выдали администрацией во время аукциона — cancelled, лидеру сообщение", async () => {
    const { baseUrl } = server();
    const adm = await admin();
    const [bidder, target] = await registerUsers(baseUrl, 2);
    await grantStars(adm, bidder, 100);
    const name = freeName();
    const auction = await createAuction(name, { startPriceStars: 10 });
    await bid(bidder, auction.id, 10);
    expectOk(await adm.api.post("/api/usernames/grant", { userId: target.id, username: name }), usernameGrantBody);
    const bidderWs = await ws(bidder);

    expect(await close(auction.id)).toMatchObject({ status: "cancelled" });
    await bidderWs.waitFor("message:new", newMessageFrom(SYSTEM_BOT_ID, `Аукцион @${name} отменён: юзернейм больше недоступен. Звёзды не списаны.`), WAIT);
    expect(await starsBalance(bidder)).toBe(100);
    expect((await sessionUser(target)).username).toBe(name);
  });
});

describe("DELETE /api/usernames/:id", () => {
  test("неизвестный — 404", async () => {
    expectError(await (await admin()).api.delete("/api/usernames/ua_nope"), 404, "Аукцион не найден");
  });

  test("удаляет аукцион; каждому участнику — одно сообщение, посторонним — ничего", async () => {
    const { baseUrl } = server();
    const adm = await admin();
    const [a, b, outsider] = await registerUsers(baseUrl, 3);
    await grantStars(adm, a, 100);
    await grantStars(adm, b, 100);
    const name = freeName();
    const auction = await createAuction(name, { startPriceStars: 10 });
    await bid(a, auction.id, 10);
    await bid(b, auction.id, 20);
    await bid(a, auction.id, 30);
    const aWs = await ws(a);
    const bWs = await ws(b);
    const outsiderWs = await ws(outsider);

    expectOk(await adm.api.delete(`/api/usernames/${auction.id}`), okBody);
    const text = `Аукцион @${name} отменён администрацией. Звёзды не списывались.`;
    await aWs.waitFor("message:new", newMessageFrom(SYSTEM_BOT_ID, text), WAIT);
    await bWs.waitFor("message:new", newMessageFrom(SYSTEM_BOT_ID, text), WAIT);
    await outsiderWs.expectNone("message:new", newMessageFrom(SYSTEM_BOT_ID));
    expect(aWs.events.filter(newMessageFrom(SYSTEM_BOT_ID, text))).toHaveLength(1);

    expect((await listFor(a)).auctions.some((x) => x.id === auction.id)).toBe(false);
    expectError(await a.api.post(`/api/usernames/${auction.id}/bid`, { stars: 100 }), 404, "Аукцион не найден");
    expectError(await adm.api.delete(`/api/usernames/${auction.id}`), 404, "Аукцион не найден");
    expect(await starsBalance(a)).toBe(100);
    // Юзернейм снова можно выставить.
    await createAuction(name);
  });

  test("удаление проданного аукциона оставляет юзернейм победителю", async () => {
    const adm = await admin();
    const winner = await registerUser(server().baseUrl);
    await grantStars(adm, winner, 10);
    const name = freeName();
    const auction = await createAuction(name, { startPriceStars: 10 });
    await bid(winner, auction.id, 10);
    await close(auction.id);
    expectOk(await adm.api.delete(`/api/usernames/${auction.id}`), okBody);
    expect((await sessionUser(winner)).username).toBe(name);
    expect(await starsBalance(winner)).toBe(0);
  });
});

describe("POST /api/usernames/grant", () => {
  test("цель не найдена — 404 (и по номеру, и по id); юзернейм проверяется", async () => {
    const adm = await admin();
    const target = await registerUser(server().baseUrl);
    const notFound = "Пользователь с таким номером не найден";
    expectError(await adm.api.post("/api/usernames/grant", { phone: "+79990000000", username: freeName() }), 404, notFound);
    expectError(await adm.api.post("/api/usernames/grant", { userId: "u_nope", username: freeName() }), 404, notFound);
    expectError(await adm.api.post("/api/usernames/grant", { username: freeName() }), 404, notFound);
    expectError(await adm.api.post("/api/usernames/grant", { userId: target.id, username: "x" }), 400, "Юзернейм: 3–32 символа, латинские буквы, цифры и _");
    expectError(await adm.api.post("/api/usernames/grant", { userId: target.id, username: "system" }), 409, "Этот юзернейм зарезервирован — выберите другой");
    expectError(await adm.api.post("/api/usernames/grant", { userId: target.id, username: adm.username }), 409, "Этот юзернейм уже занят");
  });

  test("по номеру (с пробелами и скобками): юзернейм выдан, старый свободен, сообщение от бота", async () => {
    const { baseUrl } = server();
    const adm = await admin();
    const [target, outsider] = await registerUsers(baseUrl, 2);
    const targetWs = await ws(target);
    const outsiderWs = await ws(outsider);
    const name = freeName("Gift");
    const spaced = `${target.phone.slice(0, 2)} (${target.phone.slice(2, 5)}) ${target.phone.slice(5, 8)}-${target.phone.slice(8)}`;

    const body = expectOk(await adm.api.post("/api/usernames/grant", { phone: spaced, username: `@${name}` }), usernameGrantBody);
    expect(body.user).toMatchObject({ id: target.id, username: name });
    expect(body.user).not.toHaveProperty("isCollectibleUsername");
    await targetWs.waitFor("message:new", newMessageFrom(SYSTEM_BOT_ID, `Администрация Shalter выдала вам юзернейм @${name}.`), WAIT);
    await outsiderWs.expectNone("message:new", newMessageFrom(SYSTEM_BOT_ID));
    expect((await sessionUser(target)).username).toBe(name);
    await renameTo(outsider, target.username);
  });

  test("по id; свой текущий юзернейм выдать можно; звёзды не списываются", async () => {
    const adm = await admin();
    const target = await registerUser(server().baseUrl);
    const body = expectOk(await adm.api.post("/api/usernames/grant", { userId: target.id, username: target.username }), usernameGrantBody);
    expect(body.user.username).toBe(target.username);
    expect(await starsBalance(target)).toBe(0);
  });

  test("юзернейм с открытого аукциона выдать можно — аукцион при этом продолжается", async () => {
    // ПОВЕДЕНИЕ-ВОПРОС: grant не смотрит на открытые аукционы; аукцион остаётся открытым
    // (без ставок закроется как unsold, со ставками — cancelled).
    const adm = await admin();
    const target = await registerUser(server().baseUrl);
    const name = freeName();
    const auction = await createAuction(name);
    expectOk(await adm.api.post("/api/usernames/grant", { userId: target.id, username: name }), usernameGrantBody);
    expect((await listFor(target)).auctions.find((a) => a.id === auction.id)?.status).toBe("open");
    expect(await close(auction.id)).toMatchObject({ status: "unsold" });
  });
});
