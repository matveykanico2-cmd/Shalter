// Помощники модуля историй. Картинки историй — внешние https-адреса: сервер их
// только хранит (isSafeUrl), не скачивает, поэтому в интернет тесты не ходят.
// Видео из /uploads/ сервер перекодирует (ffmpeg) — в тестах не используется.
import { expect } from "vitest";
import { registerUser, uniq, type TestUser } from "../../support/seed";

export const ADMIN_PHONE = "+70000000551";
export const ADMIN_ENV = { PREMIUM_ADMIN_PHONE: ADMIN_PHONE, ALLOW_ADMIN_PHONE_SIGNUP: "1" };

export const NOT_FOUND = "not found";
export const NO_RIGHTS = "Недостаточно прав";

export function imageUrl(): string {
  return `https://img.test.invalid/${uniq("s")}.jpg`;
}

/** Публикует историю из одной картинки (или из items); возвращает сохранённую историю. */
export async function postStory(user: TestUser, body: Record<string, unknown> = { kind: "image", url: imageUrl() }): Promise<any> {
  const res = await user.api.post("/api/stories", body);
  expect(res.status, res.text).toBe(200);
  return res.body.story;
}

export async function postChannelStory(user: TestUser, chatId: string, body: Record<string, unknown> = { kind: "image", url: imageUrl() }): Promise<any> {
  const res = await user.api.post(`/api/stories/channel/${chatId}`, body);
  expect(res.status, res.text).toBe(200);
  return res.body.story;
}

/** Главный админ (права модерации — по номеру из PREMIUM_ADMIN_PHONE). Один на сервер. */
export function adminGetter(baseUrl: () => string): () => Promise<TestUser> {
  let admin: Promise<TestUser> | undefined;
  return () => (admin ??= registerUser(baseUrl(), { phone: ADMIN_PHONE, name: "Админ" }));
}

export async function comment(user: TestUser, storyId: string, text: string, parentId?: string): Promise<any> {
  const res = await user.api.post(`/api/stories/${storyId}/comments`, { text, parentId });
  expect(res.status, res.text).toBe(200);
  return res.body.comment;
}
