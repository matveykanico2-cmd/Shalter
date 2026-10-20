// Витрина подарков: GET /api/gifts, покупка за звёзды (обычный, Premium,
// анонимный, тиражный), заявка админу (/request) и выдача модератором (/deliver).
import { describe, expect, test } from "vitest";
import { requestToAdminBody } from "../../schemas/donations";
import { buyBody, buyNotEnough, catalogGift, deliverBody, messageGift, receivedGift, requestDeliveredBody, shopBody, wsSelfUpdated } from "../../schemas/gifts";
import { wsMessageNew } from "../../schemas/messages";
import { expectError, expectOk, expectShape } from "../../support/expect";
import { registerUser, registerUsers, type TestUser } from "../../support/seed";
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
  selfOf,
  starsBalance,
  wsPool,
} from "../stars/helpers";

const ADMIN_PHONE = "+70000000915";
const server = useServer({ env: adminEnv(ADMIN_PHONE) });
const ws = wsPool();

let adminUser: TestUser;
async function admin(): Promise<TestUser> {
  adminUser ??= await registerAdmin(server().baseUrl, ADMIN_PHONE);
  return adminUser;
}

const CAKE = { id: "cake", emoji: "🎂", name: "Торт", priceRub: 25, premiumDays: 0, priceStars: 250 };
const isGiftMsg = (e: any) => e.message?.type === "gift";

test("без сессии — 401 на всех маршрутах /api/gifts", async () => {
  await expectAll401(server().baseUrl, [
    ["GET", "/api/gifts"],
    ["POST", "/api/gifts/request"],
    ["POST", "/api/gifts/deliver"],
    ["POST", "/api/gifts/buy"],
    ["POST", "/api/gifts/received/rg_x/convert"],
    ["DELETE", "/api/gifts/received/rg_x"],
    ["POST", "/api/gifts/received/rg_x/pin"],
    ["GET", "/api/gifts/catalog"],
    ["POST", "/api/gifts/catalog/cake/supply"],
    ["POST", "/api/gifts/catalog/cake/scene"],
    ["POST", "/api/gifts/catalog"],
    ["DELETE", "/api/gifts/catalog/cake"],
    ["POST", "/api/gifts/catalog/cake/restore"],
    ["GET", "/api/gifts/custom"],
    ["POST", "/api/gifts/custom"],
    ["PATCH", "/api/gifts/custom/ug_x"],
    ["DELETE", "/api/gifts/custom/ug_x"],
    ["POST", "/api/gifts/custom/send"],
  ]);
});

describe("GET /api/gifts", () => {
  test("витрина: цены в звёздах (₽ × 10), тиражный с remaining, снятые с продажи не показываются", async () => {
    const user = await registerUser(server().baseUrl);
    const body = expectOk(await user.api.get("/api/gifts"), shopBody);
    expect(body.balance).toBe(0);
    const byId = new Map(body.gifts.map((g) => [g.id, g]));
    expect(byId.get("cake")).toEqual(CAKE);
    expect(byId.get("premium_week")).toEqual({ id: "premium_week", emoji: "⭐", name: "Premium на неделю", priceRub: 100, premiumDays: 7, priceStars: 1000 });
    expect(byId.get("premium_forever")).toMatchObject({ premiumDays: null, priceStars: 100000 });
    expect(byId.get("tg_plush_pepe")).toEqual({
      id: "tg_plush_pepe",
      emoji: "🐸",
      name: "Плюшевый Пепе",
      priceRub: 5000,
      premiumDays: 0,
      supply: 3000,
      exclusive: true,
      priceStars: 50000,
      remaining: 3000,
    });
    // «Кольцо» есть в каталоге, но не в витрине.
    expect(byId.has("ring")).toBe(false);
    for (const g of body.gifts) expect(g.priceStars).toBe(Math.max(1, Math.round(g.priceRub * 10)));
  });
});

describe("POST /api/gifts/buy", () => {
  test("ошибки: себе, нет подарка, снят с продажи, нет получателя, блокировка, не хватает звёзд", async () => {
    const { baseUrl } = server();
    const adm = await admin();
    const [a, b, blocker] = await registerUsers(baseUrl, 3);
    expectError(await a.api.post("/api/gifts/buy", { giftId: "cake", recipientId: a.id }), 400, "Нельзя подарить подарок самому себе");
    expectError(await a.api.post("/api/gifts/buy", { giftId: "nope", recipientId: b.id }), 404, "Подарок не найден");
    expectError(await a.api.post("/api/gifts/buy", { giftId: "ring", recipientId: b.id }), 400, "Этот подарок больше не продаётся");
    expectError(await a.api.post("/api/gifts/buy", { giftId: "cake" }), 404, "Получатель не найден");
    expectError(await a.api.post("/api/gifts/buy", { giftId: "cake", recipientId: "u_nope" }), 404, "Получатель не найден");
    await blocker.api.post(`/api/users/${a.id}/block`, { blocked: true });
    expectError(await a.api.post("/api/gifts/buy", { giftId: "cake", recipientId: blocker.id }), 403, "Пользователь ограничил вам доступ");

    expect(expectOk(await a.api.post("/api/gifts/buy", { giftId: "cake", recipientId: b.id }), buyNotEnough, 402)).toEqual({
      error: "Не хватает звёзд — нужно 250 ⭐",
      needStars: 250,
      balance: 0,
    });
    await grantStars(adm, a, 100);
    // Тысячи — через неразрывный пробел (toLocaleString ru-RU).
    expect(expectOk(await a.api.post("/api/gifts/buy", { giftId: "tg_plush_pepe", recipientId: b.id }), buyNotEnough, 402)).toEqual({
      error: "Не хватает звёзд — нужно 50 000 ⭐",
      needStars: 50000,
      balance: 100,
    });
    expect(await starsBalance(a)).toBe(100);
    expect((await selfOf(b)).giftsReceived).toEqual([]);
  });

  test("покупка: звёзды списаны, сообщение-подарок обоим, self:updated и полка получателя", async () => {
    const { baseUrl } = server();
    const adm = await admin();
    const [a, b, outsider] = await registerUsers(baseUrl, 3);
    await grantStars(adm, a, 300);
    const aWs = await ws(a);
    const bWs = await ws(b);
    const outsiderWs = await ws(outsider);

    const rawNote = "  с днём\n\nрождения  ".padEnd(200, "!");
    const body = expectOk(
      await a.api.post("/api/gifts/buy", {
        giftId: "cake",
        recipientId: b.id,
        note: rawNote,
        background: { from: "#FFAA00", to: "#123", pattern: "red", symbol: "Star!" },
      }),
      buyBody,
    );
    expect(body).toMatchObject({ serial: null, delivered: true, balance: 50 });
    expect((await dmWith(a, b.id))?.id).toBe(body.chatId);
    // Подпись — одна строка до 128 символов.
    const note = rawNote.replace(/\s+/g, " ").trim().slice(0, 128);
    expect(note.startsWith("с днём рождения !")).toBe(true);

    const text = "🎁 Вам подарили: 🎂 «Торт»!";
    for (const sock of [aWs, bWs]) {
      const ev = expectShape(wsMessageNew, await sock.waitFor("message:new", isGiftMsg, WAIT));
      expect(ev.chatId).toBe(body.chatId);
      expect(ev.message).toMatchObject({ type: "gift", senderId: a.id, text });
      expect(expectShape(messageGift, ev.message.gift)).toEqual({
        giftId: "cake",
        emoji: "🎂",
        name: "Торт",
        priceRub: 25,
        premiumDays: 0,
        durationLabel: null,
        priceStars: 250,
        background: { from: "#ffaa00", to: "#123" },
        note,
        fromId: a.id,
        fromName: a.name,
        fromAvatarColor: a.self.avatarColor,
        fromAvatarImage: null,
        recipientId: b.id,
      });
    }
    const self = expectShape(wsSelfUpdated, await bWs.waitFor("self:updated", (e) => e.user?.giftsReceived?.length === 1, WAIT));
    expect(self.user.id).toBe(b.id);
    await aWs.expectNone("self:updated");
    await outsiderWs.expectNone("message:new");
    await outsiderWs.expectNone("self:updated");

    const shelf = (await selfOf(b)).giftsReceived;
    expect(shelf).toHaveLength(1);
    expect(expectShape(receivedGift, shelf[0])).toMatchObject({
      giftId: "cake",
      priceRub: 25,
      priceStars: 250,
      emoji: "🎂",
      name: "Торт",
      background: { from: "#ffaa00", to: "#123" },
      note,
      fromId: a.id,
      fromName: a.name,
    });
    expect(await starsBalance(a)).toBe(50);
    expect(await starsBalance(b)).toBe(0);
    // Пустая подпись и неполный фон — полей нет вовсе.
    await grantStars(adm, a, 200);
    expectOk(await a.api.post("/api/gifts/buy", { giftId: "cake", recipientId: b.id, note: "   ", background: { from: "#fff" } }), buyBody);
    const second = (await selfOf(b)).giftsReceived[1];
    expect(second).not.toHaveProperty("note");
    expect(second).not.toHaveProperty("background");
  });

  test("подарок с Premium: получатель получает Premium, срок в подписи сообщения", async () => {
    const { baseUrl } = server();
    const adm = await admin();
    const [a, b] = await registerUsers(baseUrl, 2);
    await grantStars(adm, a, 1000);
    const bWs = await ws(b);
    const body = expectOk(await a.api.post("/api/gifts/buy", { giftId: "premium_week", recipientId: b.id }), buyBody);
    expect(body.balance).toBe(0);
    const ev = await bWs.waitFor("message:new", isGiftMsg, WAIT);
    expect(ev.message.text).toBe("🎁 Вам подарили: ⭐ «Premium на неделю»! Premium на 7 дней активирован.");
    expect(ev.message.gift).toMatchObject({ premiumDays: 7, durationLabel: "Premium на 7 дней" });
    const me = (await b.api.get("/api/premium/me")).body;
    expect(me.isPremium).toBe(true);
    expect(Date.parse(me.premiumUntil)).toBeGreaterThan(Date.now() + 6 * 86_400_000);
  });

  test("анонимно: только с Premium; объявляет бот, отправителю — своя запись в личке, видимая только ему", async () => {
    const { baseUrl } = server();
    const adm = await admin();
    const [a, b, outsider] = await registerUsers(baseUrl, 3);
    await grantStars(adm, a, 500);

    // Без Premium флаг anonymous игнорируется.
    const plain = expectOk(await a.api.post("/api/gifts/buy", { giftId: "cake", recipientId: b.id, anonymous: true }), buyBody);
    const plainMsg = (await messagesIn(b, plain.chatId)).find((m) => m.type === "gift");
    expect(plainMsg.gift).not.toHaveProperty("anon");
    expect(plainMsg.gift.fromName).toBe(a.name);

    await adm.api.post("/api/premium/grant", { userId: a.id, days: 30 });
    const aWs = await ws(a);
    const bWs = await ws(b);
    const anon = expectOk(await a.api.post("/api/gifts/buy", { giftId: "cake", recipientId: b.id, anonymous: true }), buyBody);
    // chatId — личка отправителя с получателем, а не чат бота.
    expect(anon.chatId).toBe(plain.chatId);

    const botEv = expectShape(wsMessageNew, await bWs.waitFor("message:new", (e) => isGiftMsg(e) && e.message.senderId === SYSTEM_BOT_ID, WAIT));
    expect(botEv.message.text).toBe("🎁 Вам анонимно подарили: 🎂 «Торт»!");
    const g = expectShape(messageGift, botEv.message.gift);
    expect(g).toMatchObject({ anon: true, fromName: "Аноним" });
    expect(g).not.toHaveProperty("fromAvatarColor");
    // Отправитель анонимного подарка получателю не раскрывается.
    expect(g.fromId).toBeNull();

    const senderEv = await aWs.waitFor("message:new", (e) => isGiftMsg(e) && e.message.senderId === a.id && e.chatId === anon.chatId, WAIT);
    expect(senderEv.message.text).toBe("🎁 Вы отправили анонимный подарок: 🎂 «Торт»!");
    expect(senderEv.message).toMatchObject({ visibleToId: a.id, deletedForIds: [b.id] });
    await aWs.expectNone("message:new", (e) => e.chatId === botEv.chatId);
    // Запись отправителя в общей личке получателю не приходит и в истории у него не видна.
    await bWs.expectNone("message:new", (e) => e.message?.id === senderEv.message.id);
    expect((await messagesIn(b, anon.chatId)).map((m: any) => m.id)).not.toContain(senderEv.message.id);
    expect((await messagesIn(a, anon.chatId)).map((m: any) => m.id)).toContain(senderEv.message.id);

    const entry = expectShape(receivedGift, (await selfOf(b)).giftsReceived.at(-1));
    expect(entry).toMatchObject({ anon: true, fromName: "Аноним", fromId: null });
    // На полке в профиле получателя отправитель тоже скрыт.
    const seen = (await outsider.api.get(`/api/users/${b.id}`)).body.user.giftsReceived.at(-1);
    expect(seen).toMatchObject({ anon: true, fromName: "Аноним", fromId: null });
  });

  test("тиражный подарок: серийный номер в ответе, сообщении и на полке; remaining уменьшается", async () => {
    const { baseUrl } = server();
    const adm = await admin();
    const [a, b] = await registerUsers(baseUrl, 2);
    await grantStars(adm, a, 50000);
    const bWs = await ws(b);
    const body = expectOk(await a.api.post("/api/gifts/buy", { giftId: "tg_plush_pepe", recipientId: b.id }), buyBody);
    expect(body).toMatchObject({ serial: 1, balance: 0 });
    const ev = await bWs.waitFor("message:new", isGiftMsg, WAIT);
    expect(ev.message.text).toBe("🎁 Вам подарили: 🐸 «Плюшевый Пепе» (№1 из 3000)!");
    expect(ev.message.gift).toMatchObject({ serial: 1, supply: 3000, exclusive: true });
    expect((await selfOf(b)).giftsReceived[0]).toMatchObject({ giftId: "tg_plush_pepe", serial: 1, supply: 3000 });
    const pepe = (await a.api.get("/api/gifts")).body.gifts.find((g: any) => g.id === "tg_plush_pepe");
    expect(expectShape(catalogGift, pepe).remaining).toBe(2999);
  });
});

describe("POST /api/gifts/request", () => {
  test("ошибки входных данных", async () => {
    const { baseUrl } = server();
    await admin();
    const [a, b] = await registerUsers(baseUrl, 2);
    expectError(await a.api.post("/api/gifts/request", { giftId: "cake", recipientId: a.id }), 400, "Нельзя подарить подарок самому себе");
    expectError(await a.api.post("/api/gifts/request", { giftId: "nope", recipientId: b.id }), 404, "Подарок не найден");
    expectError(await a.api.post("/api/gifts/request", { giftId: "ring", recipientId: b.id }), 400, "Этот подарок больше не продаётся");
    expectError(await a.api.post("/api/gifts/request", { giftId: "cake" }), 404, "Получатель не найден");
  });

  test("обычный пользователь: заявка админу, подарок не выдан", async () => {
    const { baseUrl } = server();
    const adm = await admin();
    const [a, b] = await registerUsers(baseUrl, 2);
    const adminWs = await ws(adm);
    const body = expectOk(await a.api.post("/api/gifts/request", { giftId: "cake", recipientId: b.id }), requestToAdminBody);
    expect(body.adminPhone).toBe(ADMIN_PHONE);
    const text = `🎁 Хочу подарить 🎂 «Торт» за 25₽ пользователю ${b.name}. Перевожу на ${ADMIN_PHONE} и жду подтверждения 🙏`;
    expect((await adminWs.waitFor("message:new", newMessageFrom(a.id, text), WAIT)).chatId).toBe(body.chatId);
    expect((await selfOf(b)).giftsReceived).toEqual([]);
  });

  test("главный админ: подарок доставляется сразу, бесплатно", async () => {
    const { baseUrl } = server();
    const adm = await admin();
    const [b] = await registerUsers(baseUrl, 1);
    const bWs = await ws(b);
    const before = await starsBalance(adm);
    const body = expectOk(await adm.api.post("/api/gifts/request", { giftId: "cake", recipientId: b.id }), requestDeliveredBody);
    expect(body).toMatchObject({ adminPhone: ADMIN_PHONE, delivered: true, serial: null });
    expect((await dmWith(b, adm.id))?.id).toBe(body.chatId);
    expect((await bWs.waitFor("message:new", isGiftMsg, WAIT)).message.senderId).toBe(adm.id);
    expect((await selfOf(b)).giftsReceived).toHaveLength(1);
    expect(await starsBalance(adm)).toBe(before);
  });
});

describe("POST /api/gifts/deliver", () => {
  test("нужен раздел «moderation»: обычному и «giftshop» — 403", async () => {
    const { baseUrl } = server();
    const adm = await admin();
    const [user, shopAdmin, b] = await registerUsers(baseUrl, 3);
    await adm.api.post(`/api/admin/users/${shopAdmin.id}/admin-sections`, { sections: ["giftshop"] });
    expectError(await user.api.post("/api/gifts/deliver", { giftId: "cake", recipientId: b.id }), 403, NO_RIGHTS);
    expectError(await shopAdmin.api.post("/api/gifts/deliver", { giftId: "cake", recipientId: b.id }), 403, NO_RIGHTS);
    expectError(await adm.api.post("/api/gifts/deliver", { giftId: "nope", recipientId: b.id }), 404, "Подарок не найден");
    expectError(await adm.api.post("/api/gifts/deliver", { giftId: "cake", recipientId: "u_nope" }), 404, "Получатель не найден");
  });

  test("модератор выдаёт любой подарок из каталога (и снятый с продажи), себе тоже", async () => {
    const { baseUrl } = server();
    const adm = await admin();
    const [moder, b, outsider] = await registerUsers(baseUrl, 3);
    await adm.api.post(`/api/admin/users/${moder.id}/admin-sections`, { sections: ["moderation"] });
    const bWs = await ws(b);
    const outsiderWs = await ws(outsider);

    const body = expectOk(await moder.api.post("/api/gifts/deliver", { giftId: "ring", recipientId: b.id }), deliverBody);
    expect(body.serial).toBeNull();
    expect(body.user.id).toBe(b.id);
    expect(body.user.giftsReceived).toHaveLength(1);
    expect(body.user.giftsReceived[0]).toMatchObject({
      giftId: "ring",
      fromId: moder.id,
      fromName: moder.name,
      fromAvatarColor: moder.self.avatarColor,
      fromAvatarImage: null,
    });
    const ev = await bWs.waitFor("message:new", isGiftMsg, WAIT);
    expect(ev.message).toMatchObject({ senderId: moder.id, text: "🎁 Вам подарили: 💍 «Кольцо»!" });
    await bWs.waitFor("self:updated", () => true, WAIT);
    await outsiderWs.expectNone("message:new");

    // ПОВЕДЕНИЕ-ВОПРОС: самому себе через /deliver можно (в /buy и /request — запрещено).
    const self = expectOk(await moder.api.post("/api/gifts/deliver", { giftId: "cake", recipientId: moder.id }), deliverBody);
    expect(self.user.giftsReceived).toHaveLength(1);
    // Тиражный — с номером.
    const left = (await adm.api.get("/api/gifts")).body.gifts.find((g: any) => g.id === "tg_plush_pepe").remaining;
    const pepe = expectOk(await adm.api.post("/api/gifts/deliver", { giftId: "tg_plush_pepe", recipientId: b.id }), deliverBody);
    expect(pepe.serial).toBe(3000 - left + 1);
  });
});
