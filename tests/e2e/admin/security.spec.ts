// Безопасность аккаунта в «Настройки → Конфиденциальность»: облачный пароль
// как второй фактор (и вход через форму с ним), локальный код-пароль этого
// устройства и «Пароль при запуске».
import { test, expect, person } from "./fixtures";
import { expectSignedIn, navLink } from "../support/ui";
import type { Page } from "@playwright/test";

async function openPrivacy(page: Page) {
  // Через навигацию, без перезагрузки: перезагрузка заново показала бы экран код-пароля.
  await navLink(page, "Настройки").click();
  await page.getByRole("link", { name: "Конфиденциальность" }).click();
  await expect(page.getByRole("heading", { name: "Конфиденциальность" })).toBeVisible();
}

/**
 * Поле кода в окне «Код-пароль» / «Отключить код-пароль».
 * TODO(a11y): у поля нет ни подписи, ни placeholder — только текст-подсказка над ним;
 * на экране одно видимое поле пароля. Заменить на getByLabel, когда подпись появится.
 */
function passcodeField(page: Page) {
  return page.locator('input[type="password"]:visible');
}

test("облачный пароль: включение в настройках, затем вход через форму спрашивает его после обычного пароля", async ({ newUser, openAs, page }) => {
  const alice = await newUser(person("Алиса"));
  const s = (await openAs(alice.api, "/")).page;
  await expectSignedIn(s);
  await openPrivacy(s);

  const row = s.getByRole("button", { name: /^Двухэтапная аутентификация/ });
  await expect(row).toHaveAccessibleName("Двухэтапная аутентификация Выкл.");
  await row.click();
  await expect(s.getByRole("heading", { name: "Двухфакторная аутентификация" })).toBeVisible();
  await s.getByRole("button", { name: /Облачный пароль/ }).click();

  // Проверки формы: короткий пароль и несовпадение.
  await s.getByLabel("Облачный пароль", { exact: true }).fill("abc");
  await s.getByRole("button", { name: "Включить", exact: true }).click();
  await expect(s.getByText("Облачный пароль — не короче 6 знаков")).toBeVisible();
  await s.getByLabel("Облачный пароль", { exact: true }).fill("Гора-2026");
  await s.getByLabel("Ещё раз", { exact: true }).fill("Гора-2027");
  await s.getByRole("button", { name: "Включить", exact: true }).click();
  await expect(s.getByText("Пароли не совпадают")).toBeVisible();

  await s.getByLabel("Ещё раз", { exact: true }).fill("Гора-2026");
  await s.getByLabel("Подсказка (необязательно)").fill("гора и год");
  await s.getByLabel("Пароль от аккаунта").fill(alice.password);
  await s.getByRole("button", { name: "Включить", exact: true }).click();
  await expect(s.getByRole("heading", { name: "Двухфакторная аутентификация" })).toHaveCount(0);
  await expect(row).toHaveAccessibleName("Двухэтапная аутентификация Вкл. · облачный пароль");
  await s.reload();
  await expect(s.getByRole("button", { name: /^Двухэтапная аутентификация/ })).toHaveAccessibleName("Двухэтапная аутентификация Вкл. · облачный пароль");

  // Новое устройство: обычный вход по почте и паролю → экран облачного пароля с подсказкой.
  await page.goto("/");
  await page.getByPlaceholder("you@example.com").fill(alice.email);
  await page.getByPlaceholder("Пароль", { exact: true }).fill(alice.password);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page.getByText(`Вход в аккаунт ${alice.name} защищён облачным паролем — введите его.`)).toBeVisible();
  await expect(page.getByText("Подсказка: гора и год")).toBeVisible();
  await expect(navLink(page, "Чаты")).toHaveCount(0);

  // Неверный облачный пароль — ошибка, остаёмся на шаге.
  await page.getByPlaceholder("Облачный пароль").fill("не-тот");
  await page.getByRole("button", { name: "Подтвердить вход" }).click();
  // ПОВЕДЕНИЕ-ВОПРОС: на неверный облачный пароль сервер отвечает «Неверный код» (как
  // для TOTP-кода) со счётчиком попыток, а не «Неверный облачный пароль».
  await expect(page.getByText(/^Неверный код\. Осталось попыток: \d+$/)).toBeVisible();
  await expect(navLink(page, "Чаты")).toHaveCount(0);

  await page.getByPlaceholder("Облачный пароль").fill("Гора-2026");
  await page.getByRole("button", { name: "Подтвердить вход" }).click();
  await expectSignedIn(page);
});

test("код-пароль этого устройства: после перезагрузки экран блокировки, другое устройство не заблокировано; отключение", async ({ newUser, openAs }) => {
  const alice = await newUser(person("Алиса"));
  const s = (await openAs(alice.api, "/")).page;
  await expectSignedIn(s);
  await openPrivacy(s);

  const row = s.getByRole("button", { name: /^Код-пароль/ });
  await expect(row).toHaveAccessibleName("Код-пароль Выкл.");
  await row.click();
  await expect(s.getByRole("heading", { name: "Код-пароль" })).toBeVisible();
  await expect(s.getByText("Придумайте код-пароль (минимум 4 цифры)")).toBeVisible();
  await passcodeField(s).fill("12");
  await s.getByRole("button", { name: "Далее" }).click();
  await expect(s.getByText("Минимум 4 цифры", { exact: true })).toBeVisible();
  await passcodeField(s).fill("2468");
  await s.getByRole("button", { name: "Далее" }).click();
  await expect(s.getByText("Повторите код-пароль")).toBeVisible();
  await passcodeField(s).fill("2468");
  await s.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(s.getByRole("heading", { name: "Код-пароль" })).toHaveCount(0);
  await expect(row).toHaveAccessibleName("Код-пароль Вкл.");

  // Перезагрузка — приложение закрыто экраном блокировки.
  await s.reload();
  await expect(s.getByText("Shalter заблокирован")).toBeVisible();
  await expect(navLink(s, "Чаты")).toHaveCount(0);
  await s.getByPlaceholder("Код-пароль").fill("1111");
  await s.getByRole("button", { name: "Разблокировать" }).click();
  await expect(s.getByText("Неверный код-пароль")).toBeVisible();
  await s.getByPlaceholder("Код-пароль").fill("2468");
  await s.getByRole("button", { name: "Разблокировать" }).click();
  await expect(s.getByText("Shalter заблокирован")).toHaveCount(0);
  await expectSignedIn(s);

  // Код-пароль — только на этом устройстве: второе устройство открывается сразу.
  const other = (await openAs(alice.api, "/")).page;
  await expectSignedIn(other);
  await expect(other.getByText("Shalter заблокирован")).toHaveCount(0);

  // Отключение: «Код-пароль» → «Отключить код-пароль» → текущий код.
  await openPrivacy(s);
  await s.getByRole("button", { name: /^Код-пароль/ }).click();
  await s.getByRole("button", { name: "Отключить код-пароль" }).click();
  await expect(s.getByRole("heading", { name: "Отключить код-пароль" })).toBeVisible();
  await passcodeField(s).fill("0000");
  await s.getByRole("button", { name: "Отключить", exact: true }).click();
  await expect(s.getByText("Неверный код-пароль")).toBeVisible();
  await passcodeField(s).fill("2468");
  await s.getByRole("button", { name: "Отключить", exact: true }).click();
  await expect(s.getByRole("heading", { name: "Отключить код-пароль" })).toHaveCount(0);
  await expect(s.getByRole("button", { name: /^Код-пароль/ })).toHaveAccessibleName("Код-пароль Выкл.");
  await s.reload();
  await expectSignedIn(s);
  await expect(s.getByText("Shalter заблокирован")).toHaveCount(0);
});

async function enablePasswordOnLaunch(page: Page, user: { api: any }) {
  await openPrivacy(page);
  await page.getByRole("button", { name: /^Пароль при запуске/ }).click();
  await expect
    .poll(async () => (await user.api.get("/api/settings")).body.settings.requirePasswordOnLaunch)
    .toBe(true);
}

test("«Пароль при запуске»: после перезагрузки приложение закрыто экраном пароля, неверный пароль не пускает", async ({ newUser, openAs }) => {
  const alice = await newUser(person("Алиса"));
  const s = (await openAs(alice.api, "/")).page;
  await expectSignedIn(s);
  await enablePasswordOnLaunch(s, alice);

  await s.reload();
  await expect(s.getByText("Введите пароль", { exact: true })).toBeVisible();
  await expect(s.getByText("Приложение защищено паролем от аккаунта")).toBeVisible();
  await expect(navLink(s, "Чаты")).toHaveCount(0);
  await s.getByPlaceholder("Пароль", { exact: true }).fill("неверный");
  await s.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(s.getByText("Неверный пароль", { exact: true })).toBeVisible();
  await expect(s.getByPlaceholder("Пароль", { exact: true })).toHaveValue("");
  await expect(navLink(s, "Чаты")).toHaveCount(0);
});

test("«Пароль при запуске»: верный пароль открывает приложение", async ({ newUser, openAs }) => {
  const alice = await newUser(person("Алиса"));
  const s = (await openAs(alice.api, "/")).page;
  await expectSignedIn(s);
  await enablePasswordOnLaunch(s, alice);
  await s.reload();
  await s.getByPlaceholder("Пароль", { exact: true }).fill(alice.password);
  await s.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(s.getByText("Приложение защищено паролем от аккаунта")).toHaveCount(0);
  await expectSignedIn(s);
});
