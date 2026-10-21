// Поддержка: «Настройки → Поддержка — Hugo» открывает личку с ботом Hugo,
// он здоровается один раз и сразу отвечает на типовые вопросы.
import { test, expect, person } from "./fixtures";
import { composer, messageText, navLink, sendMessage } from "../support/ui";

test("«Поддержка — Hugo» из настроек: приветствие, ответ на вопрос про звёзды, повторный вход в тот же чат", async ({ newUser, openAs }) => {
  const alice = await newUser(person("Алиса"));
  const { page } = await openAs(alice.api, "/settings");

  await page.getByRole("button", { name: "Поддержка — Hugo" }).click();
  await expect(page).toHaveURL(/\/chat\//);
  const chatUrl = page.url();
  await expect(page.getByRole("banner").getByText("Hugo", { exact: true })).toBeVisible();
  const greeting = messageText(page, /Здравствуйте! Я Hugo — поддержка Shalter\./);
  await expect(greeting).toBeVisible();
  await expect(composer(page)).toBeVisible();

  // Вопрос по ключевому слову — Hugo отвечает сразу (без ИИ — готовым ответом).
  await sendMessage(page, "Как купить звёзды?");
  await expect(messageText(page, "Как купить звёзды?")).toBeVisible();
  await expect(messageText(page, /Звёзды — внутренняя валюта/)).toBeVisible();

  // Повторно из настроек — тот же чат, приветствие не дублируется.
  await navLink(page, "Настройки").click();
  await page.getByRole("button", { name: "Поддержка — Hugo" }).click();
  await expect(page).toHaveURL(chatUrl);
  await expect(messageText(page, /Звёзды — внутренняя валюта/)).toBeVisible();
  await expect(greeting).toHaveCount(1);

  // Чат с Hugo сохраняется в списке чатов.
  await page.reload();
  await expect(page.getByRole("button", { name: /^Hugo.*Звёзды — внутренняя валюта/ })).toBeVisible();
});
