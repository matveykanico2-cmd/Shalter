// Настройки: профиль (имя, «О себе»), приватность и активные сеансы.
import { test, expect } from "./support/fixtures";
import { Api } from "../support/client";
import { createDm, sendText } from "../support/seed";
import { chatRow, expectSignedIn, navLink } from "./support/ui";

const FIREFOX_LINUX = "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0";

test("имя и «О себе» меняются в профиле, сохраняются и видны собеседнику", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const chat = await createDm(alice, boris);
  await sendText(alice, chat.id, "Привет");

  const { page } = await openAs(alice.api, "/settings");
  await page.getByRole("button", { name: "Изменить профиль" }).click();
  await expect(page.getByRole("heading", { name: "Изменить профиль" })).toBeVisible();
  const nameBox = page.getByRole("textbox", { name: "Имя", exact: true });
  await expect(nameBox).toHaveValue("Алиса");
  await nameBox.fill("Алиса Новая");
  await page.getByRole("textbox", { name: /^О себе/ }).fill("Люблю книги и горы");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();

  // Главная страница настроек показывает новое имя.
  await navLink(page, "Настройки").click();
  await expect(page.getByText("Алиса Новая", { exact: true }).first()).toBeVisible();

  // После перезагрузки значения на месте.
  await page.goto("/settings/profile");
  await expect(page.getByRole("textbox", { name: "Имя", exact: true })).toHaveValue("Алиса Новая");
  await expect(page.getByRole("textbox", { name: /^О себе/ })).toHaveValue("Люблю книги и горы");

  // Собеседник видит новое имя в списке чатов.
  const b = (await openAs(boris.api, "/")).page;
  await expect(chatRow(b, "Алиса Новая", "Привет")).toBeVisible();
});

test("правило приватности сохраняется после перезагрузки", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const { page } = await openAs(alice.api, "/settings");
  await page.getByRole("link", { name: "Конфиденциальность" }).click();
  await expect(page.getByRole("heading", { name: "Конфиденциальность" })).toBeVisible();

  const rule = page.getByRole("button", { name: /^Номер телефона/ });
  await expect(rule).toHaveAccessibleName("Номер телефона Мои контакты");
  await rule.click();
  await expect(page.getByText("Кто видит мой номер телефона?")).toBeVisible();
  await page.getByRole("button", { name: "Никто", exact: true }).click();
  await page.getByRole("button", { name: "Назад" }).click();
  await expect(page.getByRole("button", { name: /^Номер телефона/ })).toHaveAccessibleName("Номер телефона Никто");

  await page.reload();
  await expect(page.getByRole("button", { name: /^Номер телефона/ })).toHaveAccessibleName("Номер телефона Никто");
  // И сервер хранит то же самое.
  expect((await alice.api.get("/api/settings")).body.settings.privacy.phone).toBe("nobody");
});

test("второе устройство видно в сеансах, завершение сеанса разлогинивает его", async ({ newUser, openAs, baseUrl }) => {
  const alice = await newUser("Алиса");
  const { page } = await openAs(alice.api, "/");
  await expectSignedIn(page);

  // Второе устройство — «Firefox на Linux»: вход по паролю с его user-agent.
  const second = new Api(baseUrl);
  const res = await second.post(
    "/api/auth/login-email",
    { email: alice.email, password: alice.password },
    { headers: { "user-agent": FIREFOX_LINUX } }
  );
  expect(res.status).toBe(200);
  const other = (await openAs(second, "/", { userAgent: FIREFOX_LINUX })).page;
  await expectSignedIn(other);

  await navLink(page, "Настройки").click();
  await page.getByRole("link", { name: /^Устройства/ }).click();
  await expect(page.getByRole("heading", { name: "Устройства" })).toBeVisible();
  await expect(page.getByText("Это устройство", { exact: true })).toBeVisible();
  await expect(page.getByText("Активные сеансы", { exact: true })).toBeVisible();
  const row = page.getByRole("button", { name: /^Firefox\b.*Linux/ });
  await expect(row).toBeVisible();

  // Сеанс → «Завершить сеанс» → подтверждение «Завершить».
  await row.click();
  await page.getByRole("button", { name: "Завершить сеанс", exact: true }).click();
  await expect(page.getByText("Завершить сеанс?")).toBeVisible();
  await page.getByRole("button", { name: "Завершить", exact: true }).click();
  await expect(row).toHaveCount(0);
  await expect(page.getByText("Активные сеансы", { exact: true })).toHaveCount(0);

  // Второе устройство само выходит на экран входа (/login?reason=revoked): сервер сразу
  // закрывает его WS кодом 4001 session_revoked, клиент не переподключается, а выходит —
  // без ожидания следующего HTTP-опроса (~10–15 с), отсюда короткий таймаут.
  await expect(other.getByText("Сеанс на этом устройстве был завершён — войдите снова.")).toBeVisible({ timeout: 5_000 });
  await expect(other.getByText("Рады видеть вас снова")).toBeVisible();
  await expect(navLink(other, "Чаты")).toHaveCount(0);
  // А первое остаётся в аккаунте.
  await page.reload();
  await expectSignedIn(page);
});
