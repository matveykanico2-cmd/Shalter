// Звёзды: GET /api/stars, заявка на покупку набора, начисление админом,
// цена входящих сообщений, буст и платное удаление, переводы.
import { describe, expect, test } from "vitest";
import { requestToAdminBody } from "../../schemas/donations";
import { wsMessageDeleted, wsMessageNew, wsMessageUpdated } from "../../schemas/messages";
import {
  boostBody,
  messagePriceBody,
  notEnoughWithBalance,
  paidDeleteBody,
  starsGrantBody,
  starsGrantedSelfBody,
  starsInfoBody,
  transferBody,
  wsChatPing,
} from "../../schemas/stars";
import { expectError, expectOk, expectShape } from "../../support/expect";
import { createDm, createGroup, registerUser, registerUsers, sendText, type TestUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import {
  NO_RIGHTS,
  SYSTEM_BOT_ID,
  WAIT,
  adminEnv,
  dmWith,
  expectAll401,
  grantStars,
  messagesIn,
  newMessageFrom,
  registerAdmin,
  starsBalance,
  wsPool,
} from "./helpers";

const ADMIN_PHONE = "+70000000911";
const server = useServer({ env: adminEnv(ADMIN_PHONE) });
const ws = wsPool();

let adminUser: TestUser;
async function admin(): Promise<TestUser> {
  adminUser ??= await registerAdmin(server().baseUrl, ADMIN_PHONE);
  return adminUser;
}

describe("без сессии", () => {
  test("все маршруты /api/stars — 401 unauthorized", async () => {
    await expectAll401(server().baseUrl, [
      ["GET", "/api/stars"],
      ["POST", "/api/stars/request"],
      ["POST", "/api/stars/grant"],
      ["POST", "/api/stars/price"],
      ["POST", "/api/stars/boost/m_x"],
      ["POST", "/api/stars/delete/m_x"],
      ["POST", "/api/stars/transfer"],
    ]);
  });
});

describe("GET /api/stars", () => {
  test("баланс 0, наборы и стоимость действий по умолчанию", async () => {
    const user = await registerUser(server().baseUrl);
    const body = expectOk(await user.api.get("/api/stars"), starsInfoBody);
    expect(body).toEqual({
      balance: 0,
      userId: user.id,
      messagePriceStars: 0,
      packs: [
        { id: "stars_50", stars: 50, priceRub: 100 },
        { id: "stars_100", stars: 100, priceRub: 200 },
        { id: "stars_250", stars: 250, priceRub: 500 },
        { id: "stars_500", stars: 500, priceRub: 1000 },
        { id: "stars_1000", stars: 1000, priceRub: 2000 },
        { id: "stars_2500", stars: 2500, priceRub: 5000 },
      ],
      costs: { boost: 10, boostMinutes: 60, delete: 5, maxMessagePrice: 90000 },
    });
  });
});

describe("POST /api/stars/request", () => {
  test("неизвестный набор — 404", async () => {
    const user = await registerUser(server().baseUrl);
    expectError(await user.api.post("/api/stars/request", { packId: "stars_7" }), 404, "Такого набора нет");
    expectError(await user.api.post("/api/stars/request", {}), 404, "Такого набора нет");
  });

  test("обычный пользователь: заявка уходит админу в личку, звёзды не начисляются", async () => {
    const { baseUrl } = server();
    const adm = await admin();
    const [user, outsider] = await registerUsers(baseUrl, 2);
    const adminWs = await ws(adm);
    const outsiderWs = await ws(outsider);
    const text = `⭐ Хочу купить 100 звёзд за 200₽. Перевожу на ${ADMIN_PHONE} и жду подтверждения 🙏`;

    const body = expectOk(await user.api.post("/api/stars/request", { packId: "stars_100" }), requestToAdminBody);
    expect(body.adminPhone).toBe(ADMIN_PHONE);
    const ev = expectShape(wsMessageNew, await adminWs.waitFor("message:new", newMessageFrom(user.id, text), WAIT));
    expect(ev.chatId).toBe(body.chatId);
    expect((await dmWith(adm, user.id))?.id).toBe(body.chatId);
    expect(await starsBalance(user)).toBe(0);
    await outsiderWs.expectNone("message:new", newMessageFrom(user.id));
  });

  test("главный админ получает набор себе сразу", async () => {
    const adm = await admin();
    const before = await starsBalance(adm);
    const body = expectOk(await adm.api.post("/api/stars/request", { packId: "stars_50" }), starsGrantedSelfBody);
    expect(body).toEqual({ balance: before + 50, granted: true });
    expect(await starsBalance(adm)).toBe(before + 50);
  });
});

describe("POST /api/stars/grant", () => {
  test("не админ — 403; ошибки цели и суммы", async () => {
    const { baseUrl } = server();
    const adm = await admin();
    const [user, other] = await registerUsers(baseUrl, 2);
    expectError(await user.api.post("/api/stars/grant", { userId: other.id, stars: 10 }), 403, NO_RIGHTS);
    expectError(await adm.api.post("/api/stars/grant", { userId: "u_nope", stars: 10 }), 404, "Пользователь не найден");
    for (const stars of [0, "abc", undefined, 0.5]) {
      expectError(await adm.api.post("/api/stars/grant", { userId: user.id, stars }), 400, "Укажите количество звёзд");
    }
    expectError(await adm.api.post("/api/stars/grant", { userId: user.id, stars: -1 }), 409, "Нельзя списать больше, чем есть на балансе");
    expect(await starsBalance(user)).toBe(0);
  });

  test("начисление и списание: баланс, publicUser и сообщение от админа в личке", async () => {
    const { baseUrl } = server();
    const adm = await admin();
    const [user, outsider] = await registerUsers(baseUrl, 2);
    const userWs = await ws(user);
    const outsiderWs = await ws(outsider);

    const plus = expectOk(await adm.api.post("/api/stars/grant", { userId: user.id, stars: 120.9 }), starsGrantBody);
    expect(plus.balance).toBe(120); // дробное — отбрасывается
    expect(plus.user).toMatchObject({ id: user.id, name: user.name });
    expect(plus.user).not.toHaveProperty("phone");
    await userWs.waitFor("message:new", newMessageFrom(adm.id, "⭐ Вам начислено 120 звёзд. Баланс: 120."), WAIT);

    const minus = expectOk(await adm.api.post("/api/stars/grant", { userId: user.id, stars: -20 }), starsGrantBody);
    expect(minus.balance).toBe(100);
    await userWs.waitFor("message:new", newMessageFrom(adm.id, "Списано 20 звёзд. Баланс: 100."), WAIT);
    expect(await starsBalance(user)).toBe(100);

    const dm = await dmWith(user, adm.id);
    expect((await messagesIn(user, dm.id)).map((m) => m.text)).toEqual(["⭐ Вам начислено 120 звёзд. Баланс: 120.", "Списано 20 звёзд. Баланс: 100."]);
    // Списание ровно до нуля разрешено.
    expect(await grantStars(adm, user, -100)).toBe(0);
    await outsiderWs.expectNone("message:new", newMessageFrom(adm.id));
  });
});

describe("POST /api/stars/price", () => {
  test("цена входящих: границы, GET /api/stars и chat:updated собеседникам по личкам", async () => {
    const { baseUrl } = server();
    const [user, friend, groupmate, outsider] = await registerUsers(baseUrl, 4);
    const dm = await createDm(friend, user);
    await createGroup(user, [groupmate]);
    const friendWs = await ws(friend);
    const groupmateWs = await ws(groupmate);
    const outsiderWs = await ws(outsider);

    for (const stars of [-1, 90001, "abc", undefined]) {
      expectError(await user.api.post("/api/stars/price", { stars }), 400, "Цена — от 0 до 90000 звёзд");
    }
    expect(expectOk(await user.api.post("/api/stars/price", { stars: 25.7 }), messagePriceBody)).toEqual({ messagePriceStars: 25 });
    expect(expectShape(wsChatPing, await friendWs.waitFor("chat:updated", (e) => e.chat?.id === dm.id, WAIT))).toEqual({
      type: "chat:updated",
      chat: { id: dm.id },
    });
    expect((await user.api.get("/api/stars")).body.messagePriceStars).toBe(25);
    expect(expectOk(await user.api.post("/api/stars/price", { stars: 90000 }), messagePriceBody).messagePriceStars).toBe(90000);
    expect(expectOk(await user.api.post("/api/stars/price", { stars: 0 }), messagePriceBody).messagePriceStars).toBe(0);
    // Группы и посторонние не уведомляются.
    await groupmateWs.expectNone("chat:updated");
    await outsiderWs.expectNone("chat:updated");
  });
});

describe("POST /api/stars/boost/:messageId", () => {
  test("ошибки: нет сообщения, чужой чат, не хватает звёзд", async () => {
    const { baseUrl } = server();
    const [a, b, outsider] = await registerUsers(baseUrl, 3);
    const dm = await createDm(a, b);
    const m = await sendText(a, dm.id, "подними меня");
    expectError(await a.api.post("/api/stars/boost/m_nope"), 404, "Сообщение не найдено");
    expectError(await outsider.api.post(`/api/stars/boost/${m.id}`), 404, "not found");
    const res = await a.api.post(`/api/stars/boost/${m.id}`);
    expect(expectOk(res, notEnoughWithBalance, 402)).toEqual({ error: "Не хватает звёзд — нужно 10", balance: 0 });
  });

  test("буст на час: списывает 10 ⭐, message:updated участникам чата", async () => {
    const { baseUrl } = server();
    const adm = await admin();
    const [a, b, outsider] = await registerUsers(baseUrl, 3);
    const group = await createGroup(a, [b]);
    const m = await sendText(b, group.id, "важное");
    await grantStars(adm, a, 25);
    const bWs = await ws(b);
    const outsiderWs = await ws(outsider);

    const t0 = Date.now();
    const body = expectOk(await a.api.post(`/api/stars/boost/${m.id}`), boostBody);
    expect(body.balance).toBe(15);
    expect(body.message).toMatchObject({ id: m.id, boostedById: a.id });
    const until = Date.parse(body.message.boostedUntil!);
    expect(until).toBeGreaterThanOrEqual(t0 + 60 * 60_000 - 5_000);
    expect(until).toBeLessThanOrEqual(Date.now() + 60 * 60_000 + 5_000);

    const ev = expectShape(wsMessageUpdated, await bWs.waitFor("message:updated", (e) => e.message?.id === m.id, WAIT));
    expect(ev.message.boostedUntil).toBe(body.message.boostedUntil);
    await outsiderWs.expectNone("message:updated");

    // Повторный буст тоже платный и переписывает срок.
    expect(expectOk(await a.api.post(`/api/stars/boost/${m.id}`), boostBody).balance).toBe(5);
    expect(expectOk(await a.api.post(`/api/stars/boost/${m.id}`), notEnoughWithBalance, 402).balance).toBe(5);
    const stored = (await messagesIn(b, group.id)).find((x) => x.id === m.id);
    expect(stored).toMatchObject({ boostedById: a.id });
  });
});

describe("POST /api/stars/delete/:messageId", () => {
  test("ошибки: нет сообщения, чужой чат, группа, своё сообщение, подарок, нехватка звёзд", async () => {
    const { baseUrl } = server();
    const adm = await admin();
    const [a, b, outsider] = await registerUsers(baseUrl, 3);
    const dm = await createDm(a, b);
    const group = await createGroup(a, [b]);
    const own = await sendText(a, dm.id, "моё");
    const theirs = await sendText(b, dm.id, "чужое");
    const inGroup = await sendText(b, group.id, "в группе");

    expectError(await a.api.post("/api/stars/delete/m_nope"), 404, "Сообщение не найдено");
    expectError(await outsider.api.post(`/api/stars/delete/${theirs.id}`), 404, "not found");
    expectError(await a.api.post(`/api/stars/delete/${inGroup.id}`), 400, "За звёзды можно удалять только в личной переписке");
    expectError(await a.api.post(`/api/stars/delete/${own.id}`), 400, "Своё сообщение удаляется бесплатно");
    expect(expectOk(await a.api.post(`/api/stars/delete/${theirs.id}`), notEnoughWithBalance, 402)).toEqual({
      error: "Не хватает звёзд — нужно 5",
      balance: 0,
    });

    // Сообщение с подарком: b дарит a розу.
    await grantStars(adm, b, 10);
    expect((await b.api.post("/api/gifts/buy", { giftId: "rose", recipientId: a.id })).status).toBe(200);
    const gift = (await messagesIn(a, dm.id)).find((m) => m.type === "gift");
    expect(gift).toBeTruthy();
    expectError(await a.api.post(`/api/stars/delete/${gift.id}`), 400, "Сообщение с подарком удалить нельзя");
  });

  test("удаление чужого сообщения в личке за 5 ⭐: message:deleted обоим, из истории пропало", async () => {
    const { baseUrl } = server();
    const adm = await admin();
    const [a, b, outsider] = await registerUsers(baseUrl, 3);
    const dm = await createDm(a, b);
    const theirs = await sendText(b, dm.id, "удали меня, если сможешь");
    await grantStars(adm, a, 7);
    const aWs = await ws(a);
    const bWs = await ws(b);
    const outsiderWs = await ws(outsider);

    expect(expectOk(await a.api.post(`/api/stars/delete/${theirs.id}`), paidDeleteBody)).toEqual({ ok: true, balance: 2 });
    for (const sock of [aWs, bWs]) {
      expect(expectShape(wsMessageDeleted, await sock.waitFor("message:deleted", (e) => e.id === theirs.id, WAIT))).toEqual({
        type: "message:deleted",
        chatId: dm.id,
        id: theirs.id,
      });
    }
    await outsiderWs.expectNone("message:deleted");
    expect((await messagesIn(b, dm.id)).some((m) => m.id === theirs.id)).toBe(false);
    expectError(await a.api.post(`/api/stars/delete/${theirs.id}`), 404, "Сообщение не найдено");
  });
});

describe("POST /api/stars/transfer", () => {
  test("ошибки суммы, получателя, блокировки и баланса", async () => {
    const { baseUrl } = server();
    const adm = await admin();
    const [a, b, blocker] = await registerUsers(baseUrl, 3);
    for (const amount of [0, -5, "abc", undefined, 0.9]) {
      expectError(await a.api.post("/api/stars/transfer", { userId: b.id, amount }), 400, "Укажите сумму больше нуля");
    }
    expectError(await a.api.post("/api/stars/transfer", { userId: b.id, amount: 1_000_001 }), 400, "Слишком большая сумма за один перевод");
    expectError(await a.api.post("/api/stars/transfer", { userId: a.id, amount: 1 }), 400, "Себе переводить незачем");
    expectError(await a.api.post("/api/stars/transfer", { amount: 1 }), 400, "Себе переводить незачем");
    expectError(await a.api.post("/api/stars/transfer", { userId: "u_nope", amount: 1 }), 404, "Получатель не найден");
    expectError(await a.api.post("/api/stars/transfer", { userId: SYSTEM_BOT_ID, amount: 1 }), 400, "Боту звёзды не переведёшь");
    expect((await blocker.api.post(`/api/users/${a.id}/block`, { blocked: true })).status).toBe(200);
    expectError(await a.api.post("/api/stars/transfer", { userId: blocker.id, amount: 1 }), 403, "Пользователь заблокировал вас");

    const poor = await a.api.post("/api/stars/transfer", { userId: b.id, amount: 1 });
    expect(expectOk(poor, notEnoughWithBalance, 402)).toEqual({ error: "Не хватает звёзд: на балансе 0 ⭐", balance: 0 });
    await grantStars(adm, a, 3);
    expect(expectOk(await a.api.post("/api/stars/transfer", { userId: b.id, amount: 4 }), notEnoughWithBalance, 402)).toEqual({
      error: "Не хватает звёзд: на балансе 3 ⭐",
      balance: 3,
    });
    expect(await starsBalance(b)).toBe(0);
  });

  test("перевод: балансы обоих, сообщение с подписью в личке, получатель видит его по WS", async () => {
    const { baseUrl } = server();
    const adm = await admin();
    const [a, b, outsider] = await registerUsers(baseUrl, 3);
    await grantStars(adm, a, 100);
    const bWs = await ws(b);
    const outsiderWs = await ws(outsider);
    const longNote = `  спасибо ${"x".repeat(300)}`;

    const body = expectOk(await a.api.post("/api/stars/transfer", { userId: b.id, amount: 40.8, note: longNote }), transferBody);
    expect(body).toMatchObject({ ok: true, amount: 40, balance: 60, from: a.name });
    expect(body.to).toMatchObject({ id: b.id });
    expect(body.to).not.toHaveProperty("phone");
    expect(await starsBalance(a)).toBe(60);
    expect(await starsBalance(b)).toBe(40);

    const expectedText = `⭐ Перевод: 40 ⭐\n${longNote.trim().slice(0, 200)}`;
    const ev = expectShape(wsMessageNew, await bWs.waitFor("message:new", newMessageFrom(a.id), WAIT));
    expect(ev.message.text).toBe(expectedText);
    expect((await dmWith(b, a.id))?.id).toBe(ev.chatId);
    await outsiderWs.expectNone("message:new");

    // Без подписи — одна строка.
    expectOk(await b.api.post("/api/stars/transfer", { userId: a.id, amount: 40 }), transferBody);
    const texts = (await messagesIn(a, ev.chatId)).map((m) => m.text);
    expect(texts.at(-1)).toBe("⭐ Перевод: 40 ⭐");
    expect(await starsBalance(b)).toBe(0);
    expect(await starsBalance(a)).toBe(100);
    expect(expectOk(await b.api.post("/api/stars/transfer", { userId: a.id, amount: 1 }), notEnoughWithBalance, 402).balance).toBe(0);
  });
});
