// Свои нарисованные подарки: список, создание, правка, удаление, отправка (бесплатно).
import { describe, expect, test } from "vitest";
import { okBody } from "../../schemas/common";
import { customSendBody, giftBody, giftListBody, giftScene, messageGift, receivedGift } from "../../schemas/gifts";
import { wsMessageNew } from "../../schemas/messages";
import { expectError, expectOk, expectShape } from "../../support/expect";
import { registerUser, registerUsers, type TestUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { SYSTEM_BOT_ID, WAIT, dmWith, selfOf, starsBalance, wsPool } from "../stars/helpers";

const server = useServer();
const ws = wsPool();

const SCENE = { layers: [{ type: "emoji", emoji: "🎈", x: 150, anim: "nope", junk: 1 }, { type: "unknown" }], loop: 99, bg: "#ABCDEF" };
const CLEAN_SCENE = {
  v: 1,
  loop: 12,
  bg: "#abcdef",
  layers: [{ type: "emoji", x: 100, y: 50, fill: "#ff8a3d", opacity: 1, rot: 0, anim: "none", delay: 0, dur: 1.6, emoji: "🎈", size: 40 }],
};

async function createCustom(user: TestUser, name = "Шарик", scene: unknown = SCENE) {
  return expectOk(await user.api.post("/api/gifts/custom", { name, scene }), giftBody).gift;
}

describe("GET/POST /api/gifts/custom", () => {
  test("создание: сцена очищается, эмодзи — из первого эмодзи-слоя, цена 1 ⭐; список — новые сверху", async () => {
    const user = await registerUser(server().baseUrl);
    expect(expectOk(await user.api.get("/api/gifts/custom"), giftListBody)).toEqual({ gifts: [] });

    const gift = await createCustom(user, `  ${"Подарок ".repeat(10)}  `);
    expect(gift.id).toMatch(/^ug_[a-z0-9а-яё_]+_[a-z0-9]+_[a-z0-9]{1,4}$/);
    expect(gift).toEqual({
      id: gift.id,
      emoji: "🎈",
      name: "Подарок ".repeat(10).trim().slice(0, 60),
      priceRub: 1,
      priceStars: 1,
      premiumDays: 0,
      scene: CLEAN_SCENE,
      ownerId: user.id,
      custom: true,
    });
    expectShape(giftScene, gift.scene);

    const second = await createCustom(user, "Рисунок", { layers: [{ type: "star" }] });
    expect(second.emoji).toBe("🎨");
    expect(expectOk(await user.api.get("/api/gifts/custom"), giftListBody).gifts.map((g) => g.id)).toEqual([second.id, gift.id]);
    // Чужие подарки в список не попадают, в витрину — тоже.
    const other = await registerUser(server().baseUrl);
    expect((await other.api.get("/api/gifts/custom")).body.gifts).toEqual([]);
    expect((await user.api.get("/api/gifts")).body.gifts.some((g: any) => g.id === gift.id)).toBe(false);
  });

  test("ошибки: нет названия, пустая сцена, больше 50 подарков", async () => {
    const user = await registerUser(server().baseUrl);
    expectError(await user.api.post("/api/gifts/custom", { name: "   ", scene: SCENE }), 400, "Назовите подарок");
    expectError(await user.api.post("/api/gifts/custom", { scene: SCENE }), 400, "Назовите подарок");
    for (const scene of [undefined, null, {}, { layers: [] }, { layers: [{ type: "bogus" }] }]) {
      expectError(await user.api.post("/api/gifts/custom", { name: "x", scene }), 400, "Нарисуйте подарок — добавьте хотя бы одну фигуру");
    }
    for (let i = 0; i < 50; i++) await createCustom(user, `g${i}`);
    expectError(await user.api.post("/api/gifts/custom", { name: "лишний", scene: SCENE }), 409, "Не больше 50 своих подарков");
    expect((await user.api.get("/api/gifts/custom")).body.gifts).toHaveLength(50);
  });
});

describe("PATCH/DELETE /api/gifts/custom/:id", () => {
  test("правка названия и сцены (эмодзи пересчитывается); чужой — 404", async () => {
    const [owner, other] = await registerUsers(server().baseUrl, 2);
    const gift = await createCustom(owner);
    const renamed = expectOk(await owner.api.patch(`/api/gifts/custom/${gift.id}`, { name: "  Новое  " }), giftBody).gift;
    expect(renamed).toMatchObject({ id: gift.id, name: "Новое", emoji: "🎈", scene: CLEAN_SCENE });
    const redrawn = expectOk(
      await owner.api.patch(`/api/gifts/custom/${gift.id}`, { scene: { layers: [{ type: "emoji", emoji: "🐱" }] } }),
      giftBody,
    ).gift;
    expect(redrawn).toMatchObject({ name: "Новое", emoji: "🐱" });
    expect(redrawn.scene!.layers).toHaveLength(1);
    // Пустой patch — без изменений.
    expect(expectOk(await owner.api.patch(`/api/gifts/custom/${gift.id}`, {}), giftBody).gift).toEqual(redrawn);

    expectError(await owner.api.patch(`/api/gifts/custom/${gift.id}`, { name: " " }), 400, "Назовите подарок");
    expectError(await owner.api.patch(`/api/gifts/custom/${gift.id}`, { scene: { layers: [] } }), 400, "Нарисуйте подарок — добавьте хотя бы одну фигуру");
    expectError(await other.api.patch(`/api/gifts/custom/${gift.id}`, { name: "моё" }), 404, "Подарок не найден");
    expectError(await owner.api.patch("/api/gifts/custom/ug_nope", { name: "x" }), 404, "Подарок не найден");
  });

  test("удаление: только своё; после — 404 и пропал из списка", async () => {
    const [owner, other] = await registerUsers(server().baseUrl, 2);
    const gift = await createCustom(owner);
    expectError(await other.api.delete(`/api/gifts/custom/${gift.id}`), 404, "Подарок не найден");
    expect(expectOk(await owner.api.delete(`/api/gifts/custom/${gift.id}`), okBody)).toEqual({ ok: true });
    expect((await owner.api.get("/api/gifts/custom")).body.gifts).toEqual([]);
    expectError(await owner.api.delete(`/api/gifts/custom/${gift.id}`), 404, "Подарок не найден");
    expectError(await owner.api.post("/api/gifts/custom/send", { giftId: gift.id, recipientId: other.id }), 404, "Подарок не найден");
  });
});

describe("POST /api/gifts/custom/send", () => {
  test("ошибки: себе, чужой подарок, нет получателя", async () => {
    const [owner, other] = await registerUsers(server().baseUrl, 2);
    const gift = await createCustom(owner);
    expectError(await owner.api.post("/api/gifts/custom/send", { giftId: gift.id, recipientId: owner.id }), 400, "Нельзя подарить подарок самому себе");
    expectError(await other.api.post("/api/gifts/custom/send", { giftId: gift.id, recipientId: owner.id }), 404, "Подарок не найден");
    expectError(await owner.api.post("/api/gifts/custom/send", { giftId: gift.id, recipientId: "u_nope" }), 404, "Получатель не найден");
    expectError(await owner.api.post("/api/gifts/custom/send", { giftId: gift.id }), 404, "Получатель не найден");
  });

  test("отправка бесплатна: сообщение-подарок со сценой, запись custom на полке, self:updated получателю", async () => {
    const [owner, b, outsider] = await registerUsers(server().baseUrl, 3);
    const gift = await createCustom(owner);
    const bWs = await ws(b);
    const outsiderWs = await ws(outsider);
    const body = expectOk(
      await owner.api.post("/api/gifts/custom/send", { giftId: gift.id, recipientId: b.id, note: "сам рисовал", background: { from: "#000", to: "#fff" } }),
      customSendBody,
    );
    expect((await dmWith(owner, b.id))?.id).toBe(body.chatId);
    const ev = expectShape(wsMessageNew, await bWs.waitFor("message:new", (e) => e.message?.type === "gift", WAIT));
    expect(ev.message.text).toBe("🎁 Вам подарили: 🎈 «Шарик»!");
    expect(expectShape(messageGift, ev.message.gift)).toMatchObject({
      giftId: gift.id,
      custom: true,
      priceStars: 1,
      scene: CLEAN_SCENE,
      note: "сам рисовал",
      background: { from: "#000", to: "#fff" },
      fromId: owner.id,
    });
    await bWs.waitFor("self:updated", () => true, WAIT);
    await outsiderWs.expectNone("message:new");
    const entry = expectShape(receivedGift, (await selfOf(b)).giftsReceived[0]);
    expect(entry).toMatchObject({ giftId: gift.id, custom: true, scene: CLEAN_SCENE, priceStars: 1 });
    expect(await starsBalance(owner)).toBe(0);
  });

  test("заблокировавшему отправителя — 403, как в /buy; anonymous без Premium игнорируется", async () => {
    const [owner, blocker, friend] = await registerUsers(server().baseUrl, 3);
    const gift = await createCustom(owner);
    await blocker.api.post(`/api/users/${owner.id}/block`, { blocked: true });
    expectError(
      await owner.api.post("/api/gifts/custom/send", { giftId: gift.id, recipientId: blocker.id, anonymous: true }),
      403,
      "Пользователь ограничил вам доступ",
    );
    expect((await selfOf(blocker)).giftsReceived).toEqual([]);
    expect(await dmWith(blocker, owner.id)).toBeUndefined();

    expectOk(await owner.api.post("/api/gifts/custom/send", { giftId: gift.id, recipientId: friend.id, anonymous: true }), customSendBody);
    const entry = (await selfOf(friend)).giftsReceived[0];
    expect(entry).toMatchObject({ fromId: owner.id, fromName: owner.name });
    expect(entry).not.toHaveProperty("anon");
    expect((await dmWith(friend, SYSTEM_BOT_ID))).toBeUndefined();
  });
});
