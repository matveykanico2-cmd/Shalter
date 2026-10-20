// Полка полученных подарков: обмен на звёзды, удаление, закрепление.
import { describe, expect, test } from "vitest";
import { buyBody, convertBody, shelfBody } from "../../schemas/gifts";
import { expectError, expectOk } from "../../support/expect";
import { registerUsers, type TestUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { adminEnv, grantStars, registerAdmin, selfOf, starsBalance } from "../stars/helpers";

const ADMIN_PHONE = "+70000000916";
const server = useServer({ env: adminEnv(ADMIN_PHONE) });

let adminUser: TestUser;
async function admin(): Promise<TestUser> {
  adminUser ??= await registerAdmin(server().baseUrl, ADMIN_PHONE);
  return adminUser;
}

/** a дарит b подарок за звёзды; возвращает запись на полке b. */
async function gift(a: TestUser, b: TestUser, giftId: string, stars: number): Promise<any> {
  await grantStars(await admin(), a, stars);
  expectOk(await a.api.post("/api/gifts/buy", { giftId, recipientId: b.id }), buyBody);
  return (await selfOf(b)).giftsReceived.at(-1);
}

const SCENE = { layers: [{ type: "emoji", emoji: "🎈" }] };

describe("POST /api/gifts/received/:entryId/convert", () => {
  test("обмен на звёзды по полной цене; запись уходит с полки", async () => {
    const [a, b] = await registerUsers(server().baseUrl, 2);
    const entry = await gift(a, b, "cake", 250);
    const body = expectOk(await b.api.post(`/api/gifts/received/${entry.id}/convert`), convertBody);
    expect(body).toMatchObject({ balance: 250, gained: 250 });
    expect(body.user.id).toBe(b.id);
    expect(body.user.giftsReceived).toEqual([]);
    expect(await starsBalance(b)).toBe(250);
    expect((await selfOf(b)).giftsReceived).toEqual([]);
    expectError(await b.api.post(`/api/gifts/received/${entry.id}/convert`), 404, "Подарок не найден на вашей полке");
  });

  test("подарок с Premium не обменивается: Premium уже выдан, запись остаётся на полке", async () => {
    const [a, b] = await registerUsers(server().baseUrl, 2);
    const entry = await gift(a, b, "premium_week", 1000);
    expectError(await b.api.post(`/api/gifts/received/${entry.id}/convert`), 400, "Этот подарок нельзя обменять на звёзды");
    expect(await starsBalance(b)).toBe(0);
    expect((await selfOf(b)).giftsReceived.map((g: any) => g.id)).toEqual([entry.id]);
    expect((await b.api.get("/api/premium/me")).body.isPremium).toBe(true);
  });

  test("тиражный: номер после обмена не возвращается в тираж", async () => {
    const [a, b] = await registerUsers(server().baseUrl, 2);
    const entry = await gift(a, b, "tg_plush_pepe", 50000);
    const left = (await b.api.get("/api/gifts")).body.gifts.find((g: any) => g.id === "tg_plush_pepe").remaining;
    expect(expectOk(await b.api.post(`/api/gifts/received/${entry.id}/convert`), convertBody).gained).toBe(50000);
    expect((await b.api.get("/api/gifts")).body.gifts.find((g: any) => g.id === "tg_plush_pepe").remaining).toBe(left);
  });

  test("свой нарисованный подарок не обменивается; чужая запись — 404", async () => {
    const [a, b, c] = await registerUsers(server().baseUrl, 3);
    const created = (await a.api.post("/api/gifts/custom", { name: "Шарик", scene: SCENE })).body.gift;
    expect((await a.api.post("/api/gifts/custom/send", { giftId: created.id, recipientId: b.id })).status).toBe(200);
    const custom = (await selfOf(b)).giftsReceived.at(-1);
    expect(custom).toMatchObject({ custom: true, giftId: created.id });
    expectError(await b.api.post(`/api/gifts/received/${custom.id}/convert`), 400, "Этот подарок нельзя обменять на звёзды");
    expectError(await c.api.post(`/api/gifts/received/${custom.id}/convert`), 404, "Подарок не найден на вашей полке");
    expectError(await b.api.post("/api/gifts/received/rg_nope/convert"), 404, "Подарок не найден на вашей полке");
    expect(await starsBalance(b)).toBe(0);
  });
});

describe("DELETE /api/gifts/received/:entryId", () => {
  test("убирает запись с полки без звёзд; повтор и чужая — 404", async () => {
    const [a, b] = await registerUsers(server().baseUrl, 2);
    const first = await gift(a, b, "cake", 250);
    const second = await gift(a, b, "rose", 10);
    expectError(await a.api.delete(`/api/gifts/received/${first.id}`), 404, "Подарок не найден на вашей полке");
    const body = expectOk(await b.api.delete(`/api/gifts/received/${first.id}`), shelfBody);
    expect(body.user.giftsReceived.map((g) => g.id)).toEqual([second.id]);
    expect(await starsBalance(b)).toBe(0);
    expectError(await b.api.delete(`/api/gifts/received/${first.id}`), 404, "Подарок не найден на вашей полке");
  });
});

describe("POST /api/gifts/received/:entryId/pin", () => {
  test("закрепить (по умолчанию) и открепить (pinned: false)", async () => {
    const [a, b] = await registerUsers(server().baseUrl, 2);
    const entry = await gift(a, b, "rose", 10);
    const pinned = expectOk(await b.api.post(`/api/gifts/received/${entry.id}/pin`), shelfBody);
    expect(pinned.user.giftsReceived[0]).toMatchObject({ id: entry.id, pinned: true });
    expect((await selfOf(b)).giftsReceived[0].pinned).toBe(true);
    expectOk(await b.api.post(`/api/gifts/received/${entry.id}/pin`, { pinned: true }), shelfBody);
    const unpinned = expectOk(await b.api.post(`/api/gifts/received/${entry.id}/pin`, { pinned: false }), shelfBody);
    expect(unpinned.user.giftsReceived[0]).not.toHaveProperty("pinned");
    expectError(await a.api.post(`/api/gifts/received/${entry.id}/pin`), 404, "Подарок не найден на вашей полке");
    expectError(await b.api.post("/api/gifts/received/rg_nope/pin"), 404, "Подарок не найден на вашей полке");
  });
});
