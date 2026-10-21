// Регистрация, выход и вход через форму — без API-подсказок, как живой человек.
import { test, expect } from "./support/fixtures";
import { uniq, uniqPhone } from "../support/seed";
import { navLink, expectSignedIn } from "./support/ui";

test("регистрация через форму, выход и вход по email и паролю", async ({ page }) => {
  const username = uniq("e2e");
  const email = `${username}@test.invalid`;
  const password = "secret123";

  await page.goto("/");
  // Без сессии приложение отправляет на экран входа.
  await expect(page.getByRole("button", { name: "Войти", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Нет аккаунта? Зарегистрироваться" }).click();

  await page.getByPlaceholder("Имя", { exact: true }).fill("Регина");
  await page.getByPlaceholder("you@example.com").fill(email);
  await page.getByPlaceholder("999 123 45 67").fill(uniqPhone().slice(2));
  await page.getByPlaceholder("юзернейм").fill(username);
  await expect(page.getByText("Свободен ✓")).toBeVisible();
  await page.getByPlaceholder("Пароль").fill(password);
  await page.getByRole("button", { name: "Создать аккаунт" }).click();

  // После регистрации — сразу в приложении.
  await expectSignedIn(page);
  await navLink(page, "Настройки").click();
  await expect(page.getByText("Регина", { exact: true })).toBeVisible();

  // Выход: Настройки → Аккаунты → «Выйти из текущего аккаунта» → подтверждение.
  await page.getByRole("link", { name: "Аккаунты" }).click();
  await page.getByRole("button", { name: "Выйти из текущего аккаунта" }).click();
  await expect(page.getByText("Выйти из этого аккаунта?")).toBeVisible();
  // Кнопка подтверждения сейчас подписана «OK»; допускаем и «Выйти».
  await page.getByRole("button", { name: /^(OK|Выйти)$/ }).click();

  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText("Рады видеть вас снова")).toBeVisible();
  // Сервер отзывает сеанс и закрывает сокет кодом 4001, но это свой выход — не «сеанс завершён».
  await expect(page).not.toHaveURL(/reason=revoked/);
  await expect(page.getByText("Сеанс на этом устройстве был завершён — войдите снова.")).toHaveCount(0);

  // Неверный пароль — ошибка, остаёмся на форме.
  await page.getByPlaceholder("you@example.com").fill(email);
  await page.getByPlaceholder("Пароль").fill("wrong-password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page.getByText("Рады видеть вас снова")).toBeVisible();
  await expect(navLink(page, "Чаты")).toHaveCount(0);

  // Вход с правильным паролем.
  await page.getByPlaceholder("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expectSignedIn(page);
  await navLink(page, "Настройки").click();
  await expect(page.getByText("Регина", { exact: true })).toBeVisible();
  await expect(page.getByText(`@${username}`)).toBeVisible();
});
