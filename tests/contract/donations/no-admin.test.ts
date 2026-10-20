// Сервер без PREMIUM_ADMIN_PHONE (или админ ещё не зарегистрирован): заявки на
// покупку некуда отправить — 503; админские маршруты закрыты для всех.
import { describe, expect, test } from "vitest";
import { expectError } from "../../support/expect";
import { registerUsers } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { NO_ADMIN, NO_RIGHTS, starsBalance } from "../stars/helpers";

const server = useServer();

describe("нет главного админа", () => {
  test("заявки на звёзды, Premium и подарок — 503; проверки входных данных идут раньше", async () => {
    const [user, friend] = await registerUsers(server().baseUrl, 2);
    expectError(await user.api.post("/api/stars/request", { packId: "stars_50" }), 503, NO_ADMIN);
    expectError(await user.api.post("/api/stars/request", { packId: "nope" }), 404, "Такого набора нет");
    expectError(await user.api.post("/api/premium/request", { plan: "1m" }), 503, NO_ADMIN);
    expectError(await user.api.post("/api/gifts/request", { giftId: "cake", recipientId: friend.id }), 503, NO_ADMIN);
    expectError(await user.api.post("/api/gifts/request", { giftId: "nope", recipientId: friend.id }), 404, "Подарок не найден");
    expectError(await user.api.post("/api/gifts/request", { giftId: "cake", recipientId: "u_nope" }), 404, "Получатель не найден");
    expect(await starsBalance(user)).toBe(0);
  });

  test("админские маршруты — 403 любому пользователю", async () => {
    const [user, other] = await registerUsers(server().baseUrl, 2);
    expectError(await user.api.post("/api/stars/grant", { userId: other.id, stars: 5 }), 403, NO_RIGHTS);
    expectError(await user.api.post("/api/premium/grant", { userId: other.id }), 403, NO_RIGHTS);
    expectError(await user.api.post("/api/gifts/deliver", { giftId: "cake", recipientId: other.id }), 403, NO_RIGHTS);
    expectError(await user.api.get("/api/gifts/catalog"), 403, NO_RIGHTS);
    expectError(await user.api.post("/api/usernames", { username: "free_name" }), 403, NO_RIGHTS);
    expectError(await user.api.get("/api/donation-alerts/status"), 403, NO_RIGHTS);
    expect((await user.api.get("/api/usernames")).body.isAdmin).toBe(false);
    expect((await user.api.get("/api/premium/me")).body.isAdmin).toBe(false);
  });
});
