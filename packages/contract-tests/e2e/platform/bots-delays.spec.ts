import { test, expect } from "../support/fixtures";
import { createBot } from "./helpers";

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 700 }]) {
  test(`документация Bot API прокручивается колесом и по оглавлению (${viewport.width}px)`, async ({ page, baseUrl }) => {
    await page.setViewportSize(viewport);
    await page.goto(`${baseUrl}/bots`);
    await expect(page.getByRole("heading", { name: "Bot API", exact: true })).toBeVisible();
    await page.mouse.move(viewport.width - 40, viewport.height / 2);
    await page.mouse.wheel(0, 1200);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
    await page.getByRole("navigation").getByRole("link", { name: "Объекты", exact: true }).click();
    await expect(page).toHaveURL(/#objects$/);
    await expect(page.getByRole("heading", { name: "Объекты", exact: true })).toBeInViewport();
  });
}

test("запоздавший токен не заменяет настройки бота", async ({ newUser, openAs }) => {
  const user = await newUser();
  await createBot(user, "Медленный бот");
  const { page } = await openAs(user.api, "/settings/bots");
  let release!: () => void;
  let arrived!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { arrived = resolve; });
  await page.route("**/api/bots/*/token", async (route) => {
    const response = await route.fetch();
    arrived();
    await gate;
    await route.fulfill({ response });
  });
  await page.getByRole("button", { name: "Показать токен", exact: true }).click();
  await started;
  await page.getByRole("button", { name: "Редактировать бота", exact: true }).click();
  const response = page.waitForResponse((res) => res.url().endsWith("/token"));
  release();
  await response;
  const dialog = page.getByRole("dialog", { name: "Настройки бота", exact: true });
  await dialog.getByRole("textbox", { name: "Имя", exact: true }).fill("Продолжаю редактировать");
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Токен бота/ })).toHaveCount(0);
});

test("закрытое создание не открывает токен снова после медленного ответа", async ({ newUser, openAs }) => {
  const user = await newUser();
  const { page } = await openAs(user.api, "/settings/bots");
  let release!: () => void;
  let arrived!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { arrived = resolve; });
  await page.route("**/api/bots", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch();
    arrived();
    await gate;
    await route.fulfill({ response });
  });
  await page.getByRole("button", { name: "Создать бота", exact: true }).click();
  await page.getByRole("textbox", { name: "Имя бота", exact: true }).fill("Бот после задержки");
  await page.getByRole("button", { name: "Создать", exact: true }).click();
  await started;
  await page.getByRole("button", { name: "Отмена", exact: true }).click();
  release();
  await expect(page.getByText("Бот после задержки", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("закрытие токена отменяет поздний переход в чат нового бота", async ({ newUser, openAs }) => {
  const user = await newUser();
  const { page } = await openAs(user.api, "/");
  let release!: () => void;
  let arrived!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { arrived = resolve; });
  await page.route("**/api/chats", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch();
    arrived();
    await gate;
    await route.fulfill({ response });
  });
  await page.getByRole("button", { name: "Новый чат", exact: true }).click();
  await page.getByRole("button", { name: "Новый бот", exact: true }).click();
  await page.getByRole("textbox", { name: "Имя бота", exact: true }).fill("Без позднего перехода");
  await page.getByRole("button", { name: "Создать", exact: true }).click();
  await started;
  await page.getByRole("button", { name: "Готово", exact: true }).click();
  const response = page.waitForResponse((res) => res.request().method() === "POST" && res.url().endsWith("/api/chats"));
  release();
  await response;
  await page.getByRole("button", { name: "Новый чат", exact: true }).click();
  await expect(page.getByRole("button", { name: "Новый бот", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});

test("обновление SW удаляет старые API-ответы; токен не кэшируется и не возвращается без сети", async ({ newUser, openAs }) => {
  const user = await newUser();
  const bot = await createBot(user, "Бот без старого кэша");
  // Статическая документация не регистрирует SW: начинаем с прежнего кэша устройства.
  const { page, context } = await openAs(user.api, "/bots");
  const path = `/api/bots/${bot.id}/token`;
  await page.evaluate(async (path) => {
    const old = await caches.open("shalter-v4");
    await old.put(path, new Response(JSON.stringify({ token: "obsolete-token" })));
    await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
  }, path);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  expect(await page.evaluate(async () => (await caches.keys()).includes("shalter-v4"))).toBe(false);
  expect(await page.evaluate(async (path) => (await (await fetch(path)).json()).token, path)).toBe(bot.token);
  expect(await page.evaluate(async (path) => !!(await caches.match(path)), path)).toBe(false);
  await context.setOffline(true);
  expect(await page.evaluate(async (path) => {
    try { await fetch(path); return "cached-response"; } catch { return "offline"; }
  }, path)).toBe("offline");
});
