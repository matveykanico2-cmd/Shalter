// /api/ai — Shalter AI: чат с ботом, настройки ответов и тариф, «стоп».
// Сообщения боту в тестах не отправляются: ответ генерирует внешняя нейросеть
// (GigaChat/Pollinations), а тесты не ходят в интернет. Premium выдаёт главный
// админ (сервер с PREMIUM_ADMIN_PHONE).
import { afterAll, describe, expect, test } from "vitest";
import { aiChatBody, aiStateBody, aiStopBody } from "../../schemas/integrations";
import { historyPage, wsMessageNew } from "../../schemas/messages";
import { Api } from "../../support/client";
import { expectError, expectOk, expectShape } from "../../support/expect";
import { registerUser, type TestUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { connectWs, type WsClient } from "../../support/ws";

const ADMIN_PHONE = "+70000000778";
const server = useServer({ env: { PREMIUM_ADMIN_PHONE: ADMIN_PHONE, ALLOW_ADMIN_PHONE_SIGNUP: "1" } });
const sockets: WsClient[] = [];
afterAll(async () => {
  await Promise.all(sockets.map((s) => s.close()));
});

const AI_ID = "bot_shalter_ai";
const DEFAULTS = { mode: "fast", length: "normal", tone: "friendly", creativity: 0.6, language: "auto", custom: "" };
const CHOICES = {
  mode: ["fast", "smart"],
  length: ["short", "normal", "long"],
  tone: ["friendly", "business", "fun", "simple"],
  language: ["auto", "ru", "en"],
};
const FREE = {
  id: "free",
  name: "Бесплатный",
  textsPerDay: 60,
  imagesPerDay: 8,
  modes: ["fast"],
  history: 8,
  perks: ["Быстрый режим", "60 ответов в день", "8 картинок в день", "Фото, голосовые, документы"],
};
const PREMIUM = {
  id: "premium",
  name: "Premium",
  textsPerDay: 600,
  imagesPerDay: 60,
  modes: ["fast", "smart"],
  history: 24,
  perks: ["Быстрый и умный режим", "600 ответов в день", "60 картинок в день", "Длинная память разговора", "Длинные ответы без обрыва"],
};

let admin: TestUser;
async function grantPremium(user: TestUser) {
  admin ??= await registerUser(server().baseUrl, { phone: ADMIN_PHONE, name: "Админ" });
  const res = await admin.api.post("/api/premium/grant", { userId: user.id, days: 30 });
  expect(res.status, res.text).toBe(200);
}

describe("/api/ai — доступ", () => {
  test("без сессии — 401 на всех маршрутах", async () => {
    const anon = new Api(server().baseUrl);
    for (const res of await Promise.all([
      anon.post("/api/ai/chat"),
      anon.get("/api/ai/settings"),
      anon.patch("/api/ai/settings", { tone: "fun" }),
      anon.post("/api/ai/stop", { chatId: "c_x" }),
    ])) {
      expectError(res, 401, "unauthorized");
    }
  });
});

describe("POST /api/ai/chat", () => {
  test("создаёт личку с ботом и здоровается один раз; повторно — тот же чат без нового приветствия", async () => {
    const u = await registerUser(server().baseUrl);
    const ws = await connectWs(u.api);
    sockets.push(ws);

    const { chatId } = expectOk(await u.api.post("/api/ai/chat"), aiChatBody);
    const event = await ws.waitFor("message:new", (e) => e.chatId === chatId, 10_000);
    expectShape(wsMessageNew, event, "WS message:new");
    expect(event.message).toMatchObject({ chatId, senderId: AI_ID, type: "text", readByIds: [AI_ID] });
    expect(event.message.text).toMatch(/^Привет! Я \*\*Shalter AI\*\* 🤖\n\n/);
    expect(event.message.text).toContain("/settings — режим, длина ответов, тон и тариф.");

    // Чат — обычная личка с ботом в списке чатов.
    const chats = (await u.api.get("/api/chats")).body.chats as any[];
    const row = chats.find((c) => c.id === chatId);
    expect(row).toMatchObject({ type: "dm", memberIds: expect.arrayContaining([u.id, AI_ID]) });
    expect(row.memberIds).toHaveLength(2);
    expect(row.otherUser).toMatchObject({ id: AI_ID, isBot: true });

    ws.clear();
    expect(expectOk(await u.api.post("/api/ai/chat"), aiChatBody)).toEqual({ chatId });
    await ws.expectNone("message:new", (e) => e.chatId === chatId);
    const history = expectOk(await u.api.get(`/api/chats/${chatId}/messages`), historyPage);
    expect(history.messages).toHaveLength(1);
  });

  test("у каждого пользователя свой чат с ботом", async () => {
    const a = await registerUser(server().baseUrl);
    const b = await registerUser(server().baseUrl);
    const ca = expectOk(await a.api.post("/api/ai/chat"), aiChatBody).chatId;
    const cb = expectOk(await b.api.post("/api/ai/chat"), aiChatBody).chatId;
    expect(ca).not.toBe(cb);
    expectError(await b.api.get(`/api/chats/${ca}/messages`), 404, "not found");
  });

  test("личка с ботом, созданная обычным способом, переиспользуется", async () => {
    const u = await registerUser(server().baseUrl);
    const dm = (await u.api.post("/api/chats", { userId: AI_ID })).body.chat;
    expect(dm).toMatchObject({ type: "dm" });
    const { chatId } = expectOk(await u.api.post("/api/ai/chat"), aiChatBody);
    expect(chatId).toBe(dm.id);
    // Пустой чат — приветствие появляется.
    const history = expectOk(await u.api.get(`/api/chats/${chatId}/messages`), historyPage);
    expect(history.messages.map((m) => m.senderId)).toEqual([AI_ID]);
  });
});

describe("GET/PATCH /api/ai/settings", () => {
  test("по умолчанию: бесплатный тариф, стандартные настройки, расход 0", async () => {
    const u = await registerUser(server().baseUrl);
    expect(expectOk(await u.api.get("/api/ai/settings"), aiStateBody)).toEqual({
      settings: DEFAULTS,
      plan: FREE,
      plans: [FREE, PREMIUM],
      usage: { texts: 0, images: 0 },
      choices: CHOICES,
    });
  });

  test("PATCH меняет настройки и возвращает полное состояние; сохраняется", async () => {
    const u = await registerUser(server().baseUrl);
    const patch = { length: "short", tone: "business", creativity: 0.25, language: "en", custom: "  без смайликов " };
    const res = expectOk(await u.api.patch("/api/ai/settings", patch), aiStateBody);
    // custom не обрезается по пробелам — только по длине.
    expect(res.settings).toEqual({ mode: "fast", length: "short", tone: "business", creativity: 0.25, language: "en", custom: "  без смайликов " });
    expect(res.plan.id).toBe("free");
    expect(expectOk(await u.api.get("/api/ai/settings"), aiStateBody).settings).toEqual(res.settings);

    // Частичный PATCH поверх сохранённого.
    const next = expectOk(await u.api.patch("/api/ai/settings", { tone: "fun" }), aiStateBody).settings;
    expect(next).toEqual({ ...res.settings, tone: "fun" });
  });

  test("недопустимые значения заменяются значениями по умолчанию; creativity в [0, 1]; custom до 500", async () => {
    const u = await registerUser(server().baseUrl);
    const res = expectOk(
      await u.api.patch("/api/ai/settings", { mode: "turbo", length: "huge", tone: "angry", language: "fr", creativity: 7, custom: "я".repeat(600) }),
      aiStateBody,
    );
    expect(res.settings).toEqual({ ...DEFAULTS, creativity: 1, custom: "я".repeat(500) });
    expect(expectOk(await u.api.patch("/api/ai/settings", { creativity: -3 }), aiStateBody).settings.creativity).toBe(0);
    expect(expectOk(await u.api.patch("/api/ai/settings", { creativity: "много" }), aiStateBody).settings.creativity).toBe(0.6);
    // null → Number(null) = 0.
    expect(expectOk(await u.api.patch("/api/ai/settings", { creativity: null }), aiStateBody).settings.creativity).toBe(0);
    expect(expectOk(await u.api.patch("/api/ai/settings", { custom: 42 }), aiStateBody).settings.custom).toBe("42");
  });

  test("лишние ключи в PATCH отбрасываются", async () => {
    const u = await registerUser(server().baseUrl);
    const res = expectOk(await u.api.patch("/api/ai/settings", { tone: "simple", foo: { bar: 1 } }), aiStateBody);
    expect(res.settings).toEqual({ ...DEFAULTS, tone: "simple" });
    expect(expectOk(await u.api.get("/api/ai/settings"), aiStateBody).settings).toEqual({ ...DEFAULTS, tone: "simple" });
  });

  test("умный режим без Premium — 403; с Premium — можно, тариф premium", async () => {
    const u = await registerUser(server().baseUrl);
    expectError(await u.api.patch("/api/ai/settings", { mode: "smart" }), 403, "Умный режим доступен в Premium");
    expect(expectOk(await u.api.get("/api/ai/settings"), aiStateBody).settings.mode).toBe("fast");

    await grantPremium(u);
    const res = expectOk(await u.api.patch("/api/ai/settings", { mode: "smart" }), aiStateBody);
    expect(res.settings.mode).toBe("smart");
    expect(res.plan).toEqual(PREMIUM);
  });
});

describe("POST /api/ai/stop", () => {
  test("нечего останавливать — stopped: false", async () => {
    const u = await registerUser(server().baseUrl);
    const { chatId } = expectOk(await u.api.post("/api/ai/chat"), aiChatBody);
    expect(expectOk(await u.api.post("/api/ai/stop", { chatId }), aiStopBody)).toEqual({ stopped: false });
    expect(expectOk(await u.api.post("/api/ai/stop", {}), aiStopBody)).toEqual({ stopped: false });
    expect(expectOk(await u.api.post("/api/ai/stop", { chatId: "c_чужой" }), aiStopBody)).toEqual({ stopped: false });
  });
});
