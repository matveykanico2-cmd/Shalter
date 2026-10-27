// Общее для тестов коллекционных юзернеймов: админ (номер из PREMIUM_ADMIN_PHONE),
// звёзды через POST /api/stars/grant, уведомления от системного бота.
import { expect } from "vitest";
import { selfUser } from "../../schemas/user";
import { expectShape } from "../../support/expect";
import { uniq, type TestUser } from "../../support/seed";

export { NO_RIGHTS, SYSTEM_BOT_ID, WAIT, adminEnv, expectAll401, grantStars, newMessageFrom, registerAdmin, starsBalance, wsPool } from "../stars/helpers";

/** Свободный валидный юзернейм. */
export const freeName = (prefix = "nick") => uniq(prefix).slice(0, 32);

export async function sessionUser(user: TestUser): Promise<any> {
  const res = await user.api.get("/api/auth/session");
  expect(res.status, res.text).toBe(200);
  return expectShape(selfUser, res.body.user, "selfUser");
}

/** Сменить юзернейм через профиль (PATCH /api/users/:id). */
export async function renameTo(user: TestUser, username: string): Promise<void> {
  const res = await user.api.patch(`/api/users/${user.id}`, { username });
  expect(res.status, res.text).toBe(200);
}

/** Все маршруты /api/usernames. */
export const USERNAME_ROUTES = [
  ["GET", "/api/usernames"],
  ["POST", "/api/usernames"],
  ["POST", "/api/usernames/ua_x/bid"],
  ["POST", "/api/usernames/ua_x/close"],
  ["DELETE", "/api/usernames/ua_x"],
  ["POST", "/api/usernames/grant"],
  ["GET", "/api/usernames/market"],
  ["POST", "/api/usernames/market"],
  ["DELETE", "/api/usernames/market/ul_x"],
  ["POST", "/api/usernames/market/ul_x/buy"],
] as const;
