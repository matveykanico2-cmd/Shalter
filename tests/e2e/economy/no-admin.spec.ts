// Сервер без главного админа (PREMIUM_ADMIN_PHONE не задан): покупки рублями
// некуда отправить — интерфейс показывает ошибку, ничего не начисляется.
import { test, expect } from "../support/fixtures";
import { NO_ADMIN } from "./helpers";

test("без администрации: покупка звёзд и Premium показывает, что заявку некуда отправить", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const page = (await openAs(alice.api, "/settings/stars")).page;
  await expect(page.getByText(/^Баланс\s*0$/)).toBeVisible();
  await page.getByRole("button", { name: "+50 100 ₽" }).click();
  await expect(page.getByText(NO_ADMIN)).toBeVisible();
  // Остаёмся на экране «Звёзды», баланс прежний.
  await expect(page.getByText(/^Баланс\s*0$/)).toBeVisible();

  await page.goto("/settings/premium");
  await page.getByRole("button", { name: "Подписаться за 799 ₽" }).click();
  await expect(page.getByText(NO_ADMIN)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Shalter Premium" }).last()).toBeVisible();
  expect((await alice.api.get("/api/premium/me")).body.isPremium).toBe(false);
});
