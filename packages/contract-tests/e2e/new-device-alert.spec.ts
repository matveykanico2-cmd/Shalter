import { expect, login, test } from "./support/fixtures";
import { expectSignedIn } from "./support/ui";

test("новый вход показывается над чатами: подробности и отзыв чужого сеанса", async ({ baseUrl, newUser, openAs }) => {
  const user = await newUser("Семён");
  const { page } = await openAs(user.api, "/");
  await expectSignedIn(page);

  const otherDevice = await login(baseUrl, user);
  const alert = page.getByRole("region", { name: "Вход с нового устройства" });
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("Подробности");

  await alert.getByRole("button", { name: /Вход с нового устройства/ }).click();
  await expect(page).toHaveURL(/\/settings\/devices$/);
  await expect(page.getByText("Активные сеансы")).toBeVisible();

  await page.goto("/");
  await expect(alert).toBeVisible();
  await alert.getByRole("button", { name: "Это не я" }).click();
  await expect(alert).toBeHidden();

  const sessions = await user.api.get("/api/sessions");
  expect(sessions.status).toBe(200);
  expect(sessions.body.sessions).toHaveLength(1);
  expect((await otherDevice.get("/api/bootstrap")).status).toBe(401);
});

test("«Это я» подтверждает новый вход и предупреждение не возвращается после перезагрузки", async ({ baseUrl, newUser, openAs }) => {
  const user = await newUser("Семён");
  const { page } = await openAs(user.api, "/");
  await expectSignedIn(page);
  await login(baseUrl, user);

  const alert = page.getByRole("region", { name: "Вход с нового устройства" });
  await expect(alert).toBeVisible();
  await alert.getByRole("button", { name: "Это я" }).click();
  await expect(alert).toBeHidden();
  await page.reload();
  await expect(alert).toHaveCount(0);
});

test("пропавший chunk экрана один раз обновляет приложение и восстанавливает маршрут", async ({ newUser, openAs }) => {
  const user = await newUser("Семён");
  const session = await openAs(user.api, "/");
  let failed = false;
  await session.context.route(/\/assets\/contacts-[^/]+\.js$/, async (route) => {
    if (!failed) {
      failed = true;
      await route.abort("failed");
    } else {
      await route.continue();
    }
  });

  await session.page.goto("/contacts");
  await expect(session.page).toHaveURL(/\/contacts$/);
  await expect(session.page.getByRole("heading", { name: "Контакты" })).toBeVisible();
  expect(failed).toBe(true);
});
