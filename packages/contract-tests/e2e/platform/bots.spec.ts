// Боты: создание в интерфейсе («Новый бот»), токен, управление в «Настройки → Боты»,
// бот, которого программирует тест через Bot API, отвечает в чате, его кнопки
// работают, мини-приложение бота открывается внутри Shalter.
import { test, expect } from "../support/fixtures";
import { PUBLIC_HOST } from "../support/egress";
import { composer, messageText, sendMessage } from "../support/ui";
import { BotClient, botByName, createBot, startBot } from "./helpers";

test("«Новый бот» из меню списка чатов: токен показан, бот отвечает через Bot API, кнопка уходит боту", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const { page } = await openAs(alice.api, "/");

  await page.getByRole("button", { name: "Новый чат", exact: true }).click();
  await page.getByRole("button", { name: "Новый бот", exact: true }).click();
  await expect(page.getByText("Новый бот", { exact: true }).first()).toBeVisible();
  await page.getByRole("textbox", { name: "Имя бота" }).fill("Погодный бот");
  await page.getByRole("button", { name: "Создать", exact: true }).click();

  // Окно с токеном: тот же токен, что выдаёт сервер владельцу.
  await expect(page.getByRole("heading", { name: "Токен бота «Погодный бот»" })).toBeVisible();
  const bot = await botByName(alice, "Погодный бот");
  await expect(page.getByText(bot.token, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Готово", exact: true }).click();
  await expect(page.getByRole("heading", { name: /^Токен бота/ })).toHaveCount(0);

  // Сразу открыт чат с новым ботом.
  await expect(page).toHaveURL(/\/chat\/[^/]+$/);
  await expect(page.getByRole("banner").getByText("Погодный бот", { exact: true })).toBeVisible();

  // Человек пишет — бот видит сообщение в updates и отвечает с инлайн-кнопками.
  await sendMessage(page, "/start");
  await expect.poll(() => bot.client.updateTexts()).toContain("/start");
  const chatId = new URL(page.url()).pathname.split("/").pop()!;
  const sent = await bot.client.post("sendMessage", {
    chatId,
    text: "Какой город?",
    keyboard: [[{ text: "Москва", action: "city:msk" }, { text: "Казань", action: "city:kzn" }]],
  });
  expect(sent.status).toBe(200);
  await expect(messageText(page, "Какой город?")).toBeVisible();
  const moscow = page.getByRole("button", { name: "Москва", exact: true });
  await expect(moscow).toBeVisible();
  await expect(page.getByRole("button", { name: "Казань", exact: true })).toBeVisible();

  // Нажатие кнопки — от имени человека в чат уходит её действие, бот его получает.
  await moscow.click();
  await expect(messageText(page, "city:msk")).toBeVisible();
  await expect.poll(() => bot.client.updateTexts()).toContain("city:msk");

  await bot.client.post("sendMessage", { chatId, text: "Москва: +5 °C" });
  await expect(messageText(page, "Москва: +5 °C")).toBeVisible();

  // Бот убирает клавиатуру со своего сообщения (живое исчезновение — отдельный тест ниже).
  const cleared = await bot.client.post("editMessageKeyboard", { messageId: sent.body.message.id, keyboard: [] });
  expect(cleared.status).toBe(200);

  // После перезагрузки переписка с ботом на месте, кнопок больше нет.
  await page.reload();
  await expect(messageText(page, "Какой город?")).toBeVisible();
  await expect(messageText(page, "Москва: +5 °C")).toBeVisible();
  await expect(page.getByRole("button", { name: "Москва", exact: true })).toHaveCount(0);
});

// Бот убирает клавиатуру (editMessageKeyboard с пустой) — у открытого чата кнопки
// пропадают сразу, без перезагрузки.
test("бот убирает клавиатуру — кнопки сразу пропадают у открытого чата", async ({ newUser, openAs }) => {
  const owner = await newUser("Владелец");
  const boris = await newUser("Борис");
  const bot = await createBot(owner, "Опросник");
  const dm = await startBot(boris, bot);
  const { page } = await openAs(boris.api, `/chat/${dm.id}`);
  await expect(composer(page)).toBeVisible();
  const sent = await bot.client.post("sendMessage", { chatId: dm.id, text: "Голосуем?", keyboard: [[{ text: "За", action: "yes" }]] });
  const button = page.getByRole("button", { name: "За", exact: true });
  await expect(button).toBeVisible();
  await bot.client.post("editMessageKeyboard", { messageId: sent.body.message.id, keyboard: [] });
  await expect(button).toHaveCount(0);
  await expect(messageText(page, "Голосуем?")).toBeVisible();
});

test("кнопки бота у другого человека: инлайн-кнопка с действием и кнопка-ссылка", async ({ newUser, openAs }) => {
  const owner = await newUser("Владелец");
  const boris = await newUser("Борис");
  const bot = await createBot(owner, "Магазинный бот");
  const dm = await startBot(boris, bot);

  const { page } = await openAs(boris.api, `/chat/${dm.id}`);
  await expect(composer(page)).toBeVisible();
  // Сайт по кнопке-ссылке открывается во встроенном браузере — подменяем его.
  // Адрес — IP из TEST-NET-3: сервер проверяет ссылку (/api/link-check) через
  // заглушку egress, без DNS-запроса.
  await page.route(`https://${PUBLIC_HOST}/**`, (route) =>
    route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: "<h1>Витрина магазина</h1>" }),
  );

  const res = await bot.client.post("sendMessage", {
    chatId: dm.id,
    text: "Добро пожаловать!",
    keyboard: [[{ text: "Каталог", action: "/catalog" }], [{ text: "Наш сайт", url: `https://${PUBLIC_HOST}/` }]],
  });
  expect(res.status).toBe(200);
  await expect(messageText(page, "Добро пожаловать!")).toBeVisible();

  await page.getByRole("button", { name: "Каталог", exact: true }).click();
  await expect(messageText(page, "/catalog")).toBeVisible();
  await expect.poll(() => bot.client.updateTexts()).toContain("/catalog");

  await page.getByRole("button", { name: /^Наш сайт/ }).click();
  await expect(page.getByText(PUBLIC_HOST, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await expect(page.getByText(PUBLIC_HOST, { exact: true })).toHaveCount(0);
});

test("«Настройки → Боты»: показать токен, перевыпустить его и переименовать бота", async ({ newUser, openAs, baseUrl }) => {
  const alice = await newUser("Алиса");
  const bot = await createBot(alice, "Счётчик");
  const { page } = await openAs(alice.api, "/settings/bots");

  await expect(page.getByText("Ваши боты — 1", { exact: true })).toBeVisible();
  await expect(page.getByText("Счётчик", { exact: true })).toBeVisible();
  await expect(page.getByText(`@${bot.username}`, { exact: true })).toBeVisible();

  // Текущий токен.
  await page.getByRole("button", { name: "Показать токен", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Токен бота «Счётчик»" })).toBeVisible();
  await expect(page.getByText(bot.token, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Готово", exact: true }).click();

  // Перевыпуск: подтверждение, новый токен; старый Bot API больше не принимает.
  await expect(page.getByRole("button", { name: "Обновить токен", exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Обновить токен", exact: true }).click();
  await expect(page.getByText(/Обновить токен бота «Счётчик»\?/)).toBeVisible();
  await page.getByRole("button", { name: "Обновить", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Токен бота «Счётчик»" })).toBeVisible();
  const fresh = (await alice.api.get(`/api/bots/${bot.id}/token`)).body.token as string;
  expect(fresh).not.toBe(bot.token);
  await expect(page.getByText(fresh, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Готово", exact: true }).click();
  expect((await bot.client.get("me")).status).toBe(401);
  expect((await new BotClient(baseUrl, fresh).get("me")).status).toBe(200);

  // Переименование в «Настройках бота».
  await page.getByRole("button", { name: "Редактировать бота", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Настройки бота" })).toBeVisible();
  const nameBox = page.getByRole("textbox", { name: "Имя", exact: true });
  await expect(nameBox).toHaveValue("Счётчик");
  await nameBox.fill("Счётчик Про");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.getByText(/Сохранено$/)).toBeVisible();
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await expect(page.getByText("Счётчик Про", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText("Счётчик Про", { exact: true })).toBeVisible();
  expect((await new BotClient(baseUrl, fresh).get("me")).body.bot.name).toBe("Счётчик Про");
});

test("мини-приложение бота открывается из шапки чата и отправляет данные боту", async ({ newUser, openAs }) => {
  const owner = await newUser("Владелец");
  const boris = await newUser("Борис");
  const bot = await createBot(owner, "Пиццерия");
  // Бот сам публикует страницу приложения (хостинг /app/<юзернейм> на том же сервере).
  const code = `<h1>Меню пиццерии</h1>
<p id="who"></p>
<button onclick="Shalter.WebApp.sendData('заказ: маргарита')">Заказать маргариту</button>
<script>
  document.getElementById("who").textContent = "Гость: " + (Shalter.WebApp.user ? Shalter.WebApp.user.name : "?");
  Shalter.WebApp.ready();
</script>`;
  const set = await bot.client.post("setWebAppCode", { code, name: "Заказать пиццу" });
  expect(set.status).toBe(200);
  const dm = await startBot(boris, bot);

  const { page } = await openAs(boris.api, `/chat/${dm.id}`);
  const appButton = page.getByRole("button", { name: "Заказать пиццу", exact: true });
  await expect(appButton).toBeVisible();
  await appButton.click();

  // Окно приложения: заголовок, подпись с ботом и страница бота внутри.
  await expect(page.getByText("бот Пиццерия", { exact: true })).toBeVisible();
  const app = page.getByRole("dialog", { name: "Заказать пиццу" }).getByTitle("Заказать пиццу", { exact: true }).contentFrame();
  await expect(app.getByRole("heading", { name: "Меню пиццерии" })).toBeVisible();
  // Приложение знает, кто его открыл (initData).
  await expect(app.getByText("Гость: Борис")).toBeVisible();

  await app.getByRole("button", { name: "Заказать маргариту" }).click();
  // Данные ушли — окно закрылось, в чате сообщение от человека, бот видит его в updates.
  await expect(page.getByText("бот Пиццерия", { exact: true })).toHaveCount(0);
  await expect(messageText(page, "заказ: маргарита")).toBeVisible();
  await expect.poll(() => bot.client.updateTexts()).toContain("заказ: маргарита");
});
