// Помощники модуля рекламы. Права админа — по номеру из PREMIUM_ADMIN_PHONE,
// звёзды на баланс — через POST /api/stars/grant от админа (как в приложении).
import { expect } from "vitest";
import { registerUser, type TestUser } from "../../support/seed";

export const ADMIN_PHONE = "+70000000552";
export const ADMIN_ENV = { PREMIUM_ADMIN_PHONE: ADMIN_PHONE, ALLOW_ADMIN_PHONE_SIGNUP: "1" };
export const NO_RIGHTS = "Недостаточно прав";
export const NO_CAMPAIGN = "Кампания не найдена";
export const ADMIN_MISSING = "Администрация Shalter ещё не зарегистрирована в приложении";

export const PLACEMENT_TITLES = {
  chats: "Верх списка чатов",
  chat: "В каналах — рекламное сообщение",
  discover: "Каталог каналов",
  profile: "Своя страница профиля",
};

/** Главный админ — один на сервер, регистрируется при первом обращении. */
export function adminGetter(baseUrl: () => string): () => Promise<TestUser> {
  let admin: Promise<TestUser> | undefined;
  return () => (admin ??= registerUser(baseUrl(), { phone: ADMIN_PHONE, name: "Админ" }));
}

export async function grantStars(admin: TestUser, user: TestUser, stars: number): Promise<void> {
  const res = await admin.api.post("/api/stars/grant", { userId: user.id, stars });
  expect(res.status, res.text).toBe(200);
}

export async function createCampaign(user: TestUser, body: Record<string, unknown> = {}): Promise<any> {
  const res = await user.api.post("/api/ads/campaigns", { text: "Покупайте слонов", ...body });
  expect(res.status, res.text).toBe(200);
  return res.body.campaign;
}

/** Кампания, прошедшая модерацию, с бюджетом и включённая (status: active). */
export async function activeCampaign(admin: TestUser, owner: TestUser, body: Record<string, unknown>, budget: number): Promise<any> {
  const c = await createCampaign(owner, body);
  let res = await admin.api.post(`/api/ads/review/${c.id}`, { approve: true });
  expect(res.status, res.text).toBe(200);
  await grantStars(admin, owner, budget);
  res = await owner.api.post(`/api/ads/campaigns/${c.id}/budget`, { stars: budget });
  expect(res.status, res.text).toBe(200);
  res = await owner.api.post(`/api/ads/campaigns/${c.id}/status`, { status: "active" });
  expect(res.status, res.text).toBe(200);
  return res.body.campaign;
}
