// Общие помощники тестов ботов: создание бота через /api/bots, клиент Bot API
// с токеном в заголовке, бот в группе/канале, сокеты.
import { afterAll } from "vitest";
import { Api, type ApiResponse } from "../../support/client";
import { registerUser, type TestUser } from "../../support/seed";
import { connectWs, type WsClient } from "../../support/ws";

/** Клиент Bot API: Authorization: Bearer <token>, без cookie. */
export class BotClient {
  readonly api: Api;
  constructor(
    baseUrl: string,
    readonly token: string,
  ) {
    this.api = new Api(baseUrl);
  }

  private headers() {
    return { authorization: `Bearer ${this.token}` };
  }

  get<T = any>(method: string, query?: Record<string, string | number | boolean | undefined>): Promise<ApiResponse<T>> {
    return this.api.get<T>(`/api/bot-api/${method}`, { query, headers: this.headers() });
  }

  post<T = any>(method: string, body: unknown = {}): Promise<ApiResponse<T>> {
    return this.api.post<T>(`/api/bot-api/${method}`, body, { headers: this.headers() });
  }
}

export interface TestBot {
  /** id бота = id его аккаунта (bot_…). */
  id: string;
  username: string;
  token: string;
  owner: TestUser;
  client: BotClient;
  /** Тело ответа создания (bot с user). */
  bot: any;
}

export async function createBot(owner: TestUser, name = "Тестовый бот", extra: Record<string, unknown> = {}): Promise<TestBot> {
  const res = await owner.api.post("/api/bots", { name, ...extra });
  if (res.status !== 200) throw new Error(`бот: ${res.status} ${res.text.slice(0, 300)}`);
  const { bot, token } = res.body;
  return { id: bot.id, username: bot.user.username, token, owner, client: new BotClient(owner.api.baseUrl, token), bot };
}

/** Личка человека с ботом — так человек «запускает» бота. */
export async function startBot(user: TestUser, bot: TestBot): Promise<any> {
  const res = await user.api.post("/api/chats", { userId: bot.id });
  if (res.status !== 200) throw new Error(`личка с ботом: ${res.status} ${res.text}`);
  return res.body.chat;
}

/** Группа владельца с ботом; admin — сделать бота администратором. */
export async function groupWithBot(owner: TestUser, members: TestUser[], bot: TestBot, { admin = true, ...extra }: Record<string, any> = {}) {
  const res = await owner.api.post("/api/chats/groups", {
    title: "Группа с ботом",
    memberIds: [...members.map((m) => m.id), bot.id],
    adminIds: admin ? [bot.id] : [],
    ...extra,
  });
  if (res.status !== 200) throw new Error(`группа: ${res.status} ${res.text}`);
  return res.body.chat;
}

export async function channelWithBot(owner: TestUser, members: TestUser[], bot: TestBot, { admin = true, ...extra }: Record<string, any> = {}) {
  const res = await owner.api.post("/api/chats/channels", {
    title: "Канал с ботом",
    memberIds: [...members.map((m) => m.id), bot.id],
    adminIds: admin ? [bot.id] : [],
    ...extra,
  });
  if (res.status !== 200) throw new Error(`канал: ${res.status} ${res.text}`);
  return res.body.chat;
}

/**
 * Пользователь с Premium через публичный API (регистрация по коду друга) —
 * локальная копия registerPremiumUser из contract/chats/helpers.ts.
 */
export async function registerPremiumUser(baseUrl: string, overrides: Record<string, string> = {}): Promise<TestUser> {
  const referrer = await registerUser(baseUrl, { name: "Пригласивший" });
  const user = await registerUser(baseUrl, { referralCode: referrer.self.referralCode, ...overrides });
  if (!user.self.isPremium) throw new Error("регистрация по коду друга не дала Premium");
  return user;
}

/** Сокеты, открытые в файле, закрываются после всех тестов. */
export function wsPool() {
  const sockets: WsClient[] = [];
  afterAll(async () => {
    await Promise.all(sockets.map((s) => s.close()));
  });
  return async (user: TestUser | Api): Promise<WsClient> => {
    const ws = await connectWs(user instanceof Api ? user : user.api);
    sockets.push(ws);
    return ws;
  };
}

export const NOT_MEMBER = "Bot is not a member of this chat";
export const NOT_ADMIN = "Bot must be an admin of this chat";
export const MSG_NOT_FOUND = "Message not found";
