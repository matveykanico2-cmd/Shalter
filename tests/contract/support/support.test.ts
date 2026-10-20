// Поддержка и партнёрская программа: POST /api/support/chat (чат с Hugo),
// POST /api/support/report (чат с администрацией), GET /api/partners/me и
// POST /api/partners/chat. «Администрация» — аккаунт на PREMIUM_ADMIN_PHONE.
import { describe, expect, test } from "vitest";
import { message } from "../../schemas/message";
import { chatIdBody, partnerInfoBody } from "../../schemas/reports";
import { expectError, expectOk, expectShape } from "../../support/expect";
import { createDm, registerUser, sendText } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { ADMIN_ENV, admins, anonymous, wsPool } from "../admin/helpers";

const server = useServer({ env: ADMIN_ENV });
const ws = wsPool();
const { primary } = admins(() => server().baseUrl);

const HUGO_ID = "bot_support";
const HUGO_GREETING =
  "Здравствуйте! Я Hugo — поддержка Shalter.\n\n" +
  "Спросите про звёзды, Premium, подарки, двухфакторную аутентификацию, ботов или где скачать приложение — отвечу сразу.\n\n" +
  "Если проблема сложнее, опишите её: что вы делали, что ожидали и что получилось. Такое сообщение прочитает человек.\n\n" +
  "И ещё я проверяю тексты — напишите «проверь» и следом фразу.";
const ADMIN_GREETING =
  "Здравствуйте! Это чат с администрацией Shalter.\n\n" +
  "Опишите ошибку: что вы делали, что ожидали и что получилось — по возможности приложите скриншот. Мы разберёмся.";
const PARTNER_HELLO = "Здравствуйте! Хочу узнать про партнёрскую программу.";
const TARIFF =
  "Условия партнёрской программы обсуждаются индивидуально — напишите администрации через кнопку ниже, расскажите про свою аудиторию, и вам предложат тариф.";

async function history(user: { api: any }, chatId: string): Promise<any[]> {
  const res = await user.api.get(`/api/chats/${chatId}/messages`);
  expect(res.status, res.text).toBe(200);
  return res.body.messages;
}

describe("без сессии", () => {
  test("401", async () => {
    const api = anonymous(server().baseUrl);
    for (const res of [await api.post("/api/support/chat"), await api.post("/api/support/report"), await api.get("/api/partners/me"), await api.post("/api/partners/chat")]) {
      expectError(res, 401, "unauthorized");
    }
  });
});

describe("администрация ещё не зарегистрирована", () => {
  test("partners/chat — 503; support/report ведёт в чат с Hugo без приветствия", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    expectError(await user.api.post("/api/partners/chat"), 503, "Администрация Shalter ещё не зарегистрирована в приложении");
    const { chatId } = expectOk(await user.api.post("/api/support/report"), chatIdBody);
    const chat = (await user.api.get(`/api/chats/${chatId}`)).body.chat;
    expect(chat).toMatchObject({ type: "dm", otherUser: { id: HUGO_ID } });
    // ПОВЕДЕНИЕ-ВОПРОС: в запасной ветке (без админа) чат с Hugo создаётся пустым — приветствие шлёт только /support/chat.
    expect(await history(user, chatId)).toEqual([]);
    expect(expectOk(await user.api.post("/api/support/chat"), chatIdBody).chatId).toBe(chatId);
  });
});

describe("POST /api/support/chat", () => {
  test("чат с Hugo: приветствие один раз, по WS — только самому пользователю", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    const outsider = await registerUser(baseUrl);
    const [userWs, outsiderWs] = await Promise.all([ws(user.api), ws(outsider.api)]);

    const { chatId } = expectOk(await user.api.post("/api/support/chat"), chatIdBody);
    const ev = await userWs.waitFor("message:new", (e) => e.chatId === chatId, 8000);
    expect(expectShape(message, ev.message)).toMatchObject({ senderId: HUGO_ID, type: "text", text: HUGO_GREETING, readByIds: [HUGO_ID] });
    await outsiderWs.expectNone("message:new");

    const chat = (await user.api.get(`/api/chats/${chatId}`)).body.chat;
    expect(chat).toMatchObject({ type: "dm", memberIds: expect.arrayContaining([user.id, HUGO_ID]), otherUser: { id: HUGO_ID, isBot: true } });

    userWs.clear();
    expect(expectOk(await user.api.post("/api/support/chat"), chatIdBody).chatId).toBe(chatId);
    await userWs.expectNone("message:new");
    expect((await history(user, chatId)).map((m) => m.text)).toEqual([HUGO_GREETING]);
  });
});

describe("POST /api/support/report", () => {
  test("чат с администрацией: приветствие от имени админа обоим, один раз", async () => {
    const { baseUrl } = server();
    const admin = await primary();
    const user = await registerUser(baseUrl);
    const [adminWs, userWs] = await Promise.all([ws(admin.api), ws(user.api)]);

    const { chatId } = expectOk(await user.api.post("/api/support/report"), chatIdBody);
    for (const socket of [adminWs, userWs]) {
      const ev = await socket.waitFor("message:new", (e) => e.chatId === chatId, 8000);
      expect(ev.message).toMatchObject({ senderId: admin.id, text: ADMIN_GREETING });
    }
    expect((await user.api.get(`/api/chats/${chatId}`)).body.chat).toMatchObject({ type: "dm", otherUser: { id: admin.id } });

    expect(expectOk(await user.api.post("/api/support/report"), chatIdBody).chatId).toBe(chatId);
    expect((await history(user, chatId)).map((m) => m.text)).toEqual([ADMIN_GREETING]);
  });

  test("если в личке с админом уже есть переписка — приветствия нет", async () => {
    const { baseUrl } = server();
    const admin = await primary();
    const user = await registerUser(baseUrl);
    const dm = await createDm(user, admin);
    await sendText(user, dm.id, "у меня вопрос");
    expect(expectOk(await user.api.post("/api/support/report"), chatIdBody).chatId).toBe(dm.id);
    expect((await history(user, dm.id)).map((m) => m.text)).toEqual(["у меня вопрос"]);
  });

  test("сам админ попадает в чат с Hugo", async () => {
    const admin = await primary();
    const { chatId } = expectOk(await admin.api.post("/api/support/report"), chatIdBody);
    expect((await admin.api.get(`/api/chats/${chatId}`)).body.chat).toMatchObject({ otherUser: { id: HUGO_ID } });
  });
});

describe("партнёрская программа", () => {
  test("GET /api/partners/me — текст тарифа", async () => {
    const user = await registerUser(server().baseUrl);
    expect(expectOk(await user.api.get("/api/partners/me"), partnerInfoBody)).toEqual({ tariffText: TARIFF });
  });

  test("POST /api/partners/chat: личка с админом и сообщение от пользователя; повтор — без дубля", async () => {
    const { baseUrl } = server();
    const admin = await primary();
    const user = await registerUser(baseUrl);
    const outsider = await registerUser(baseUrl);
    const [adminWs, outsiderWs] = await Promise.all([ws(admin.api), ws(outsider.api)]);

    const { chatId } = expectOk(await user.api.post("/api/partners/chat"), chatIdBody);
    const ev = await adminWs.waitFor("message:new", (e) => e.chatId === chatId, 8000);
    expect(expectShape(message, ev.message)).toMatchObject({ senderId: user.id, text: PARTNER_HELLO });
    await outsiderWs.expectNone("message:new");

    expect(expectOk(await user.api.post("/api/partners/chat"), chatIdBody).chatId).toBe(chatId);
    expect((await history(admin, chatId)).map((m) => [m.senderId, m.text])).toEqual([[user.id, PARTNER_HELLO]]);
  });

  test("админу самому себе — 400", async () => {
    expectError(await (await primary()).api.post("/api/partners/chat"), 400, "Вы и есть администрация");
  });
});
