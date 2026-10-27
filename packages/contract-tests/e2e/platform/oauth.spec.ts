// «Войти через Shalter» (OAuth): экран согласия /oauth/authorize — разрешить (браузер
// уходит на redirect_uri с кодом), отменить, вход в аккаунт прямо на экране согласия;
// сторона разработчика — приложения и их ключи в «Настройки → Войти через Shalter».
import { test, expect } from "../support/fixtures";
import { Api } from "../../support/client";
import { expectSignedIn } from "../support/ui";
import type { Page } from "@playwright/test";
import type { TestUser } from "../../support/seed";

/** redirect_uri стороннего сайта — в браузере подменяется, в сеть запрос не уходит. */
const REDIRECT = "https://127.0.0.1:9/oauth/callback";

async function createApp(owner: TestUser, name: string) {
  const res = await owner.api.post("/api/oauth/apps", { name, redirectUri: REDIRECT });
  if (res.status !== 200) throw new Error(`oauth app: ${res.status} ${res.text}`);
  return res.body.app as { id: string; clientId: string; clientSecret: string; name: string };
}

function authorizeUrl(clientId: string, state = "st-42") {
  return `/oauth/authorize?${new URLSearchParams({ client_id: clientId, redirect_uri: REDIRECT, state })}`;
}

/** Страница-заглушка стороннего сайта по redirect_uri. */
async function stubThirdParty(page: Page) {
  await page.route("https://127.0.0.1:9/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: "<h1>Сайт партнёра: вход выполнен</h1>" }),
  );
}

test("«Разрешить» на экране согласия: возврат на redirect_uri с кодом, код меняется на данные пользователя", async ({ newUser, openAs, baseUrl }) => {
  const dev = await newUser("Разработчик");
  const alice = await newUser("Алиса");
  const app = await createApp(dev, "Книжный клуб");

  const { page } = await openAs(alice.api, authorizeUrl(app.clientId));
  await stubThirdParty(page);
  await expect(page.getByText("«Книжный клуб» хочет войти через Shalter")).toBeVisible();
  await expect(page.getByText("Алиса", { exact: true })).toBeVisible();
  await expect(page.getByText(`@${alice.username}`, { exact: true })).toBeVisible();
  await expect(page.getByText(/получит только имя, юзернейм и фото профиля/)).toBeVisible();

  await page.getByRole("button", { name: "Разрешить", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Сайт партнёра: вход выполнен" })).toBeVisible();
  const back = new URL(page.url());
  expect(`${back.origin}${back.pathname}`).toBe(REDIRECT);
  expect(back.searchParams.get("state")).toBe("st-42");
  const code = back.searchParams.get("code");
  expect(code).toBeTruthy();

  // Сервер партнёра меняет код на токен и узнаёт, кто вошёл.
  const anon = new Api(baseUrl);
  const tok = await anon.post("/api/oauth/token", { client_id: app.clientId, client_secret: app.clientSecret, code, redirect_uri: REDIRECT });
  expect(tok.status).toBe(200);
  const info = await anon.get("/api/oauth/userinfo", { headers: { authorization: `Bearer ${tok.body.access_token}` } });
  expect(info.body).toMatchObject({ id: alice.id, name: "Алиса", username: alice.username });
});

test("«Отмена» на экране согласия возвращает к чатам без кода", async ({ newUser, openAs }) => {
  const dev = await newUser("Разработчик");
  const alice = await newUser("Алиса");
  const app = await createApp(dev, "Погода");

  const { page } = await openAs(alice.api, authorizeUrl(app.clientId));
  let redirected = false;
  await page.route("https://127.0.0.1:9/**", (route) => {
    redirected = true;
    return route.abort();
  });
  await expect(page.getByText("«Погода» хочет войти через Shalter")).toBeVisible();
  await page.getByRole("link", { name: "Отмена", exact: true }).click();
  await expectSignedIn(page);
  await expect(page).toHaveURL(/\/$/);
  expect(redirected).toBe(false);
});

// Гостю экран согласия показывает название приложения и форму входа прямо на месте
// (GET /api/oauth/app-info открыт без сессии).
test("без входа: экран согласия просит войти, после входа — согласие и возврат с кодом", async ({ newUser, page }) => {
  const dev = await newUser("Разработчик");
  const alice = await newUser("Алиса");
  const app = await createApp(dev, "Кинотеатр");
  await stubThirdParty(page);

  await page.goto(authorizeUrl(app.clientId, "anon-1"));
  await expect(page.getByText("Чтобы войти в «Кинотеатр» через Shalter, сначала войдите в свой аккаунт.")).toBeVisible();
  await page.getByPlaceholder("you@example.com").fill(alice.email);
  await page.getByPlaceholder("Пароль").fill(alice.password);
  await page.getByRole("button", { name: "Войти", exact: true }).click();

  await expect(page.getByText("«Кинотеатр» хочет войти через Shalter")).toBeVisible();
  await expect(page.getByText(`@${alice.username}`, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Разрешить", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Сайт партнёра: вход выполнен" })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("state")).toBe("anon-1");
});

test("неверная ссылка согласия: неизвестное приложение и неполные параметры", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const { page } = await openAs(alice.api, authorizeUrl("nope-client"));
  await expect(page.getByText("Приложение не найдено или redirect_uri не совпадает")).toBeVisible();
  await expect(page.getByRole("button", { name: "Разрешить" })).toHaveCount(0);

  await page.goto("/oauth/authorize?client_id=abc");
  await expect(page.getByText("Ссылка неполная — не хватает client_id или redirect_uri.")).toBeVisible();
  await page.getByRole("link", { name: "На главную" }).click();
  await expectSignedIn(page);
});

test("разработчик: приложение в настройках, ключ показывается и перевыпускается", async ({ newUser, openAs, baseUrl }) => {
  const dev = await newUser("Разработчик");
  const { page } = await openAs(dev.api, "/settings/oauth");
  await expect(page.getByRole("heading", { name: "Войти через Shalter" })).toBeVisible();
  await expect(page.getByText("Ваши приложения — 0", { exact: true })).toBeVisible();

  // Ошибка проверки адреса видна на форме.
  await page.getByPlaceholder("Название приложения").fill("Мой магазин");
  await page.getByPlaceholder("https://ваш-сайт.example/callback").fill("http://shop.example/cb");
  await page.getByRole("button", { name: "Создать приложение" }).click();
  await expect(page.getByText("redirect_uri должен быть https:// (кроме localhost для разработки)")).toBeVisible();

  await page.getByPlaceholder("https://ваш-сайт.example/callback").fill(REDIRECT);
  await page.getByRole("button", { name: "Создать приложение" }).click();
  await expect(page.getByRole("heading", { name: "Ключ приложения «Мой магазин»" })).toBeVisible();
  const created = (await dev.api.get("/api/oauth/apps")).body.apps[0];
  const first = (await dev.api.get(`/api/oauth/apps/${created.id}/secret`)).body;
  await expect(page.getByText(`client_secret: ${first.clientSecret}`).first()).toBeVisible();
  await page.getByRole("button", { name: "Готово", exact: true }).click();

  await expect(page.getByText("Ваши приложения — 1", { exact: true })).toBeVisible();
  await expect(page.getByText(REDIRECT, { exact: true })).toBeVisible();
  await expect(page.getByText(`client_id: ${first.clientId}`).first()).toBeVisible();

  // Показать действующий ключ.
  await page.getByRole("button", { name: "Показать и скопировать ключ" }).click();
  await expect(page.getByText(/Это действующий ключ приложения/)).toBeVisible();
  await page.getByRole("button", { name: "Готово", exact: true }).click();

  // Перевыпуск секрета: подтверждение, новый секрет, старый не принимается.
  await page.getByRole("button", { name: "Перегенерировать секрет" }).click();
  await page.getByRole("button", { name: "Перегенерировать", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ключ приложения «Мой магазин»" })).toBeVisible();
  const second = (await dev.api.get(`/api/oauth/apps/${created.id}/secret`)).body;
  expect(second.clientSecret).not.toBe(first.clientSecret);
  await expect(page.getByText(`client_secret: ${second.clientSecret}`).first()).toBeVisible();
  await page.getByRole("button", { name: "Готово", exact: true }).click();
  const stale = await new Api(baseUrl).post("/api/oauth/token", { client_id: first.clientId, client_secret: first.clientSecret, code: "x", redirect_uri: REDIRECT });
  expect(stale.body).toEqual({ error: "invalid_client" });

  // После перезагрузки приложение в списке.
  await page.reload();
  await expect(page.getByText("Ваши приложения — 1", { exact: true })).toBeVisible();
  await expect(page.getByText("Мой магазин", { exact: true })).toBeVisible();
});
