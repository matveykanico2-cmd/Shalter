// Локальная фикстура папки admin: сервер воркера поднимается с админским
// окружением (права админа даются по номеру телефона, регистрация на него
// разрешена ALLOW_ADMIN_PHONE_SIGNUP=1), а главный админ регистрируется
// через API один раз на воркер.
import { test as base, expect } from "../support/fixtures";
import { startServer, type TestServer } from "../../support/server";
import { registerUser, uniq, type TestUser } from "../../support/seed";

export const ADMIN_PHONE = "+70000000931";

/**
 * MAIL_FROM без «@» — у отправителя нет домена, и проверка почты не ходит в DNS
 * (как в packages/contract-tests/contract/admin/helpers.ts).
 */
export const ADMIN_ENV = {
  PREMIUM_ADMIN_PHONE: ADMIN_PHONE,
  ALLOW_ADMIN_PHONE_SIGNUP: "1",
  MAIL_FROM: "Shalter",
};

type WorkerFixtures = { server: TestServer; admin: TestUser };

export const test = base.extend<{}, WorkerFixtures>({
  server: [
    async ({ egress }, use) => {
      const server = await startServer({ env: { ...egress.env, ...ADMIN_ENV } });
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
      await use(await registerUser(server.baseUrl, { phone: ADMIN_PHONE, name: "Главный админ" }));
    },
    { scope: "worker" },
  ],
});

/** Уникальное имя человека: несколько тестов делят базу воркера. */
export function person(name: string): string {
  return `${name} ${uniq("").slice(0, 5)}`;
}

export { expect };
