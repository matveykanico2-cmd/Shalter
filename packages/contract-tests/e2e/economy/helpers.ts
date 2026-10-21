// Помощники «экономики» для e2e: сервер с главным админом (только он начисляет
// звёзды — POST /api/stars/grant), Premium по коду друга, фото для платного поста.
// Состояние готовится через публичный API; предмет сценариев — интерфейс.
import { test as base, expect } from "../support/fixtures";
import { startServer, type TestServer } from "../../support/server";
import { registerUser, type TestUser } from "../../support/seed";
import type { Api } from "../../support/client";
import { upload, uniquePng } from "../../contract/uploads/helpers";

/** Номер главного админа. У каждого воркера свой сервер, так что номер общий. */
export const ADMIN_PHONE = "+70000000951";
export const NO_ADMIN = "Администрация Shalter ещё не зарегистрирована в приложении";

export function adminEnv(extra: Record<string, string> = {}): Record<string, string> {
  return { PREMIUM_ADMIN_PHONE: ADMIN_PHONE, ALLOW_ADMIN_PHONE_SIGNUP: "1", ...extra };
}

/**
 * Фикстура с сервером, у которого есть главный админ (зарегистрирован один раз на
 * воркер). env — дополнительное окружение сервера (например, донат-сервис).
 */
export function economyTest(extraEnv: Record<string, string> = {}) {
  return base.extend<{}, { server: TestServer; admin: TestUser }>({
    server: [
      async ({ egress }, use) => {
        const server = await startServer({ env: { ...egress.env, ...adminEnv(extraEnv) } });
        try {
          await use(server);
        } finally {
          await server.stop();
        }
      },
      { scope: "worker", timeout: 40_000 },
    ],
    admin: [
      async ({ server }, use) => {
        await use(await registerUser(server.baseUrl, { phone: ADMIN_PHONE, name: "Админ" }));
      },
      // auto: админ есть всегда — иначе заявки на покупку получают 503, а сервер
      // после упавшего теста перезапускается вместе с воркером.
      { scope: "worker", auto: true },
    ],
  });
}

/** Начислить звёзды пользователю от имени главного админа; возвращает новый баланс. */
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

/** Пользователь с Premium: регистрация по реферальному коду друга даёт Premium. */
export async function registerPremiumUser(baseUrl: string, name: string): Promise<TestUser> {
  const referrer = await registerUser(baseUrl, { name: `Пригласивший ${name}` });
  const user = await registerUser(baseUrl, { name, referralCode: referrer.self.referralCode });
  expect(user.self.isPremium, "регистрация по коду друга не дала Premium").toBe(true);
  return user;
}

/** Загрузить уникальную PNG-картинку и вернуть вложение для сообщения. */
export async function uploadPhoto(api: Api, name: string) {
  const res = await upload(api, uniquePng(), { kind: "image", name });
  expect(res.status, res.text).toBe(200);
  return { kind: "image", url: res.body.url, thumbUrl: res.body.url, name };
}

export { expect };
