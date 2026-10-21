// Общие помощники «экономики» (звёзды, Premium, подарки, юзернеймы, донаты).
// Звёзды у новых пользователей — 0; начисляет их только главный админ
// (POST /api/stars/grant), а админ — это номер из PREMIUM_ADMIN_PHONE,
// зарегистрированный с ALLOW_ADMIN_PHONE_SIGNUP=1.
import { afterAll, expect } from "vitest";
import { Api } from "../../support/client";
import { registerUser, type TestUser } from "../../support/seed";
import { connectWs, type WsClient, type WsEvent } from "../../support/ws";

export const SYSTEM_BOT_ID = "bot_shalter";
export const NO_RIGHTS = "Недостаточно прав";
export const NO_ADMIN = "Администрация Shalter ещё не зарегистрирована в приложении";

/** Окружение сервера с главным админом. */
export function adminEnv(phone: string): Record<string, string> {
  return { PREMIUM_ADMIN_PHONE: phone, ALLOW_ADMIN_PHONE_SIGNUP: "1" };
}

export function registerAdmin(baseUrl: string, phone: string): Promise<TestUser> {
  return registerUser(baseUrl, { phone, name: "Админ" });
}

/** Клиент без сессии — для проверки 401. */
export function anonymous(baseUrl: string): Api {
  return new Api(baseUrl);
}

/** Начислить (или списать, если stars < 0) звёзды через админа; возвращает новый баланс. */
export async function grantStars(admin: TestUser, user: TestUser, stars: number): Promise<number> {
  const res = await admin.api.post("/api/stars/grant", { userId: user.id, stars });
  expect(res.status, res.text).toBe(200);
  return res.body.balance;
}

export async function starsBalance(user: TestUser): Promise<number> {
  const res = await user.api.get("/api/stars");
  expect(res.status, res.text).toBe(200);
  return res.body.balance;
}

/** selfUser из сессии — актуальный профиль с полкой подарков. */
export async function selfOf(user: TestUser): Promise<any> {
  const res = await user.api.get("/api/auth/session");
  expect(res.status, res.text).toBe(200);
  return res.body.user;
}

export const msgs = (chatId: string, rest = "") => `/api/chats/${chatId}/messages${rest}`;

export async function messagesIn(user: TestUser, chatId: string): Promise<any[]> {
  const res = await user.api.get(msgs(chatId));
  expect(res.status, res.text).toBe(200);
  return res.body.messages;
}

/** Личка пользователя с otherId из его списка чатов (себе — «Избранное»). */
export async function dmWith(user: TestUser, otherId: string): Promise<any | undefined> {
  const res = await user.api.get("/api/chats");
  expect(res.status, res.text).toBe(200);
  const want = [...new Set([user.id, otherId])].sort().join(",");
  return res.body.chats.find((c: any) => c.type === "dm" && [...c.memberIds].sort().join(",") === want);
}

/** Сокеты, открытые в файле, закрываются после всех тестов. */
export function wsPool() {
  const sockets: WsClient[] = [];
  afterAll(async () => {
    await Promise.all(sockets.map((s) => s.close()));
  });
  return async (user: TestUser | Api): Promise<WsClient> => {
    const ws = await connectWs("api" in user ? user.api : user);
    sockets.push(ws);
    return ws;
  };
}

/** WS-ожидание с запасом: машина может быть нагружена параллельными прогонами. */
export const WAIT = 10_000;

export const newMessageFrom = (senderId: string, text?: string | RegExp) => (e: WsEvent) =>
  e.message?.senderId === senderId &&
  (text === undefined || (typeof text === "string" ? e.message?.text === text : text.test(e.message?.text ?? "")));

/** Каждый маршрут без сессии — 401 unauthorized. */
export async function expectAll401(baseUrl: string, routes: ReadonlyArray<readonly [string, string]>) {
  const api = anonymous(baseUrl);
  for (const [method, path] of routes) {
    const res = await api.request(method, path, method === "GET" ? {} : { json: {} });
    expect(res.status, `${method} ${path}: ${res.text}`).toBe(401);
    expect(res.body).toEqual({ error: "unauthorized" });
  }
}
