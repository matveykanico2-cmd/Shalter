// Помощники сценариев платформы: боты (Bot API по токену), игры (Game API),
// сообщества и прочая подготовка через публичный API. Локальные копии из
// tests/contract/*/helpers.ts — те тянут vitest и в Playwright не импортируются.
import { Api, type ApiResponse } from "../../support/client";
import { createGroup, uniq, type TestUser } from "../../support/seed";

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

  /** Тексты входящих сообщений бота (GET updates без long-poll). */
  async updateTexts(): Promise<string[]> {
    const res = await this.get("updates");
    if (res.status !== 200) throw new Error(`updates: ${res.status} ${res.text}`);
    return res.body.messages.map((m: any) => m.text);
  }
}

export interface TestBot {
  id: string;
  username: string;
  token: string;
  client: BotClient;
}

/** Бот через POST /api/bots (то же, что делает форма «Новый бот»). */
export async function createBot(owner: TestUser, name: string): Promise<TestBot> {
  const res = await owner.api.post("/api/bots", { name });
  if (res.status !== 200) throw new Error(`бот: ${res.status} ${res.text.slice(0, 300)}`);
  const { bot, token } = res.body;
  return { id: bot.id, username: bot.user.username, token, client: new BotClient(owner.api.baseUrl, token) };
}

/** Бот владельца по имени + его действующий токен (после создания в интерфейсе). */
export async function botByName(owner: TestUser, name: string): Promise<TestBot> {
  const { bots } = (await owner.api.get("/api/bots")).body;
  const bot = bots.find((b: any) => b.user.name === name);
  if (!bot) throw new Error(`бот «${name}» не найден`);
  const { token } = (await owner.api.get(`/api/bots/${bot.id}/token`)).body;
  return { id: bot.id, username: bot.user.username, token, client: new BotClient(owner.api.baseUrl, token) };
}

/** Личка человека с ботом — так человек «запускает» бота. */
export async function startBot(user: TestUser, bot: TestBot): Promise<any> {
  const res = await user.api.post("/api/chats", { userId: bot.id });
  if (res.status !== 200) throw new Error(`личка с ботом: ${res.status} ${res.text}`);
  return res.body.chat;
}

/** Публичная группа (с юзернеймом) — такие видны по ссылкам папок и в сообществах. */
export function publicGroup(owner: TestUser, members: TestUser[], title: string): Promise<any> {
  return createGroup(owner, members, { title, isPublic: true, username: uniq("grp") });
}

/** Запрос к Game API с токеном игры (как сервер разработчика игры). */
export function gameApi(baseUrl: string, token: string) {
  const api = new Api(baseUrl);
  return {
    post: (method: string, json: unknown = {}) => api.post(`/api/game-api/${method}`, json, { headers: { authorization: `Bearer ${token}` } }),
  };
}

/** Экранирование для RegExp из пользовательского текста. */
export const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
