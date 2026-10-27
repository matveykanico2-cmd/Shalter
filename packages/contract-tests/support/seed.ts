// Создание тестовых данных — только через публичный API, как это делает клиент.
// Никаких прямых записей в базу: тот же набор должен работать и против NestJS.
import { randomBytes } from "node:crypto";
import { Api, type ApiResponse } from "./client";

export interface TestUser {
  api: Api;
  id: string;
  name: string;
  email: string;
  password: string;
  phone: string;
  username: string;
  /** Тело ответа регистрации (selfUser). */
  self: any;
}

function check(res: ApiResponse, what: string) {
  if (res.status !== 200) throw new Error(`${what}: ${res.status} ${res.text.slice(0, 500)}`);
}

let counter = 0;

export function uniq(prefix = "t"): string {
  counter += 1;
  return `${prefix}${randomBytes(4).toString("hex")}${counter}`;
}

/** Уникальный номер в формате +7XXXXXXXXXX (вне админских номеров). */
export function uniqPhone(): string {
  const digits = (parseInt(randomBytes(4).toString("hex"), 16) % 1_000_000_000).toString().padStart(9, "0");
  return `+79${digits}`;
}

export async function registerUser(baseUrl: string, overrides: Partial<Record<string, string>> = {}): Promise<TestUser> {
  const api = new Api(baseUrl);
  const username = overrides.username ?? uniq("u");
  const data = {
    name: "Тест",
    email: `${username}@test.invalid`,
    password: "secret123",
    phone: uniqPhone(),
    username,
    ...overrides,
  };
  const res = await api.post("/api/auth/register-email", data);
  check(res, "регистрация");
  return {
    api,
    id: res.body.user.id,
    name: data.name,
    email: data.email,
    password: data.password,
    phone: data.phone,
    username: data.username,
    self: res.body.user,
  };
}

export async function registerUsers(baseUrl: string, n: number): Promise<TestUser[]> {
  const users: TestUser[] = [];
  for (let i = 0; i < n; i++) users.push(await registerUser(baseUrl, { name: `Тест ${i + 1}` }));
  return users;
}

/** Вход существующего пользователя с нового «устройства». */
export async function login(baseUrl: string, user: Pick<TestUser, "email" | "password">): Promise<Api> {
  const api = new Api(baseUrl);
  const res = await api.post("/api/auth/login-email", { email: user.email, password: user.password });
  check(res, "вход");
  return api;
}

export async function createDm(a: TestUser, b: TestUser): Promise<any> {
  const res = await a.api.post("/api/chats", { userId: b.id });
  check(res, "личка");
  return res.body.chat;
}

export async function createGroup(owner: TestUser, members: TestUser[], extra: Record<string, unknown> = {}): Promise<any> {
  const res = await owner.api.post("/api/chats/groups", { title: "Группа", memberIds: members.map((m) => m.id), ...extra });
  check(res, "группа");
  return res.body.chat;
}

export async function createChannel(owner: TestUser, members: TestUser[] = [], extra: Record<string, unknown> = {}): Promise<any> {
  const res = await owner.api.post("/api/chats/channels", { title: "Канал", memberIds: members.map((m) => m.id), ...extra });
  check(res, "канал");
  return res.body.chat;
}

export async function sendText(user: TestUser, chatId: string, text: string, extra: Record<string, unknown> = {}): Promise<any> {
  const res = await user.api.post(`/api/chats/${chatId}/messages`, { text, ...extra });
  check(res, "сообщение");
  return res.body.message;
}
