// Реклама: рекламодатель заводит кампанию в «Настройки → Реклама», модератор
// допускает её в «Модерации», рекламодатель пополняет бюджет и включает показ —
// и подписчик канала видит рекламное сообщение в ленте канала.
import { test, expect, person } from "./fixtures";
import { createChannel, sendText } from "../../support/seed";
import { answerPrompt, moderator } from "./helpers";
import { messageText } from "../support/ui";

test("кампания: создание → проверка модератором → бюджет и включение → объявление в канале у подписчика", async ({ newUser, openAs, admin, baseUrl }) => {
  const mod = await moderator(baseUrl, admin, person("Модератор"));
  const advertiser = await newUser(person("Рекламодатель"));
  const owner = await newUser(person("Автор канала"));
  const reader = await newUser(person("Читатель"));
  const channelTitle = person("Новости");
  const channel = await createChannel(owner, [reader], { title: channelTitle });
  await sendText(owner, channel.id, "Первый пост");
  const adTitle = person("Распродажа");
  const adText = `Скидки на слонов до 90% ${Date.now()}`;
  // Звёзды на баланс рекламодателя — как после перевода администрации.
  const grant = await admin.api.post("/api/stars/grant", { userId: advertiser.id, stars: 1000 });
  expect(grant.status, grant.text).toBe(200);

  // Рекламодатель: «Настройки → Реклама» → «Новая кампания».
  const adv = (await openAs(advertiser.api, "/settings")).page;
  await adv.getByRole("link", { name: "Реклама", exact: true }).click();
  // Баланс звёзд (значок ⭐ рисуется картинкой, число — с неразрывным пробелом).
  await expect(adv.getByText("на балансе — из них и оплачивается показ")).toBeVisible();
  await expect(adv.getByText(/1\s000/)).toBeVisible();
  await adv.getByRole("button", { name: "Новая кампания" }).click();
  await adv.getByPlaceholder("Название — только для вас, например «Осенняя распродажа»").fill(adTitle);
  await adv.getByPlaceholder("Текст объявления — до 200 символов").fill(adText);
  await adv.getByPlaceholder("Ссылка: https://…").fill("https://example.invalid/sale");
  // Место показа: кроме каталога каналов — рекламное сообщение в каналах.
  await adv.getByRole("button", { name: "В каналах — рекламное сообщение" }).click();
  await adv.getByRole("button", { name: "Создать и отправить на проверку" }).click();
  await expect(adv.getByText(adTitle, { exact: true })).toBeVisible();
  await expect(adv.getByText(adText, { exact: true })).toBeVisible();
  await expect(adv.getByText("Каталог каналов · В каналах — рекламное сообщение", { exact: true })).toBeVisible();
  await expect(adv.getByText("На проверке", { exact: true })).toBeVisible();

  // Пока кампания не допущена, читатель канала рекламы не видит.
  const r = (await openAs(reader.api, `/chat/${channel.id}`)).page;
  await expect(messageText(r, "Первый пост")).toBeVisible();
  await expect(r.getByText(adText)).toHaveCount(0);

  // Модератор: «Модерация» → «Реклама на проверке» → «Проверил».
  const m = (await openAs(mod.api, "/settings/moderation")).page;
  await expect(m.getByText(/^Реклама на проверке \(\d+\)$/)).toBeVisible();
  await expect(m.getByText(adText, { exact: true })).toBeVisible();
  await expect(m.getByText(`@${advertiser.username}`, { exact: false })).toBeVisible();
  await m.getByRole("button", { name: "Проверил", exact: true }).click();
  await expect(m.getByText(adText, { exact: true })).toHaveCount(0);

  // Рекламодатель: кампания проверена и стоит на паузе; пополнить бюджет и включить показ.
  await adv.reload();
  await expect(adv.getByText("На паузе", { exact: true })).toBeVisible();
  await adv.getByRole("button", { name: "Пополнить", exact: true }).click();
  await answerPrompt(adv, "Сколько звёзд добавить в бюджет?", "300");
  await expect(adv.getByText(/^Бюджет\s+300 · осталось\s+300$/)).toBeVisible();
  await expect(adv.getByText(/^\D*700$/)).toBeVisible();
  await adv.getByRole("button", { name: "Включить показ" }).click();
  await expect(adv.getByText("Идёт показ", { exact: true })).toBeVisible();

  // Читатель заново открывает канал — в конце ленты рекламное сообщение.
  await r.reload();
  await expect(messageText(r, "Первый пост")).toBeVisible();
  await expect(r.getByText("Реклама", { exact: true })).toBeVisible();
  await expect(r.getByText(adTitle, { exact: true })).toBeVisible();
  await expect(r.getByText(adText, { exact: true })).toBeVisible();
  await expect(r.getByRole("button", { name: "Открыть", exact: true })).toBeVisible();
});
