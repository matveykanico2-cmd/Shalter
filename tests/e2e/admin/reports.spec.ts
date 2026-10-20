// Жалобы: пользователь жалуется на сообщение или на собеседника, модератор
// видит жалобу в «Настройки → Модерация» и в служебном чате «Shalter» и
// решает её прямо из карточки жалобы.
import { test, expect, person } from "./fixtures";
import { createDm, sendText } from "../../support/seed";
import { dmWithBot, moderator } from "./helpers";
import { expectSignedIn, messageText } from "../support/ui";

test("жалоба на сообщение: видна в «Модерации», модератор удаляет сообщение из карточки жалобы", async ({ newUser, openAs, admin, baseUrl }) => {
  const mod = await moderator(baseUrl, admin, person("Модератор"));
  const aliceName = person("Алиса");
  const borisName = person("Борис");
  const alice = await newUser(aliceName);
  const boris = await newUser(borisName);
  const chat = await createDm(alice, boris);
  await sendText(alice, chat.id, "Привет");
  const spam = `Удвою ваши деньги ${Date.now()}`;
  await sendText(boris, chat.id, spam);

  // Алиса: меню сообщения → «Пожаловаться» → причина, пояснение → «Отправить жалобу».
  const a = (await openAs(alice.api, `/chat/${chat.id}`)).page;
  await messageText(a, spam).click({ button: "right" });
  await a.getByRole("button", { name: "Пожаловаться", exact: true }).click();
  const title = a.getByRole("heading", { name: `Пожаловаться на сообщение от ${borisName}` });
  await expect(title).toBeVisible();
  // По умолчанию выбрана первая причина — «Спам».
  await expect(a.getByRole("radio", { name: "Спам", exact: true })).toBeChecked();
  await a.getByRole("radio", { name: "Мошенничество", exact: true }).check();
  await a.getByPlaceholder("Подробности (необязательно)").fill("Просит перевести деньги");
  await a.getByRole("button", { name: "Отправить жалобу" }).click();
  await expect(title).toHaveCount(0);

  // Модератор: «Настройки → Модерация» → «Открытые жалобы» — причина, на кого и от кого, цитата, пояснение.
  const m = (await openAs(mod.api, "/settings")).page;
  await m.getByRole("link", { name: "Модерация" }).click();
  await expect(m.getByText(/^Открытые жалобы \(\d+\)$/)).toBeVisible();
  await expect(m.getByText(`На: ${borisName} · от: ${aliceName}`)).toBeVisible();
  await expect(m.getByText(`«${spam}»`, { exact: true })).toBeVisible();
  await expect(m.getByText("Пояснение: Просит перевести деньги")).toBeVisible();

  // Та же жалоба пришла карточкой в служебный чат «Shalter» — с кнопками решения.
  const systemChatId = await dmWithBot(mod);
  await m.goto(`/chat/${systemChatId}`);
  await expect(m.getByText("Жалоба: Мошенничество", { exact: true })).toBeVisible();
  await expect(m.getByText(`Сообщение: «${spam}»`, { exact: true })).toBeVisible();
  await m.getByRole("button", { name: "Удалить", exact: true }).click();
  await expect(m.getByText("Удалено", { exact: true })).toBeVisible();
  await expect(m.getByRole("button", { name: "Отклонить", exact: true })).toHaveCount(0);

  // Сообщение исчезло из переписки и после перезагрузки (живое удаление — отдельный тест ниже).
  await a.reload();
  await expect(messageText(a, "Привет")).toBeVisible();
  await expect(messageText(a, spam)).toHaveCount(0);

  // В «Модерации» жалоба больше не числится открытой.
  await m.goto("/settings/moderation");
  await expect(m.getByText(/^Открытые жалобы \(\d+\)$/)).toBeVisible();
  await expect(m.getByText(`На: ${borisName} · от: ${aliceName}`)).toHaveCount(0);
});

// Удаление сообщения по жалобе (POST /api/reports/:id/resolve, action=delete) рассылает
// message:deleted — у участников с открытым чатом сообщение исчезает сразу.
test("сообщение, удалённое по жалобе, сразу исчезает у участников чата", async ({ newUser, openAs, admin, baseUrl }) => {
  const mod = await moderator(baseUrl, admin, person("Модератор"));
  const alice = await newUser(person("Алиса"));
  const boris = await newUser(person("Борис"));
  const chat = await createDm(alice, boris);
  await sendText(alice, chat.id, "Привет");
  const spam = `Спам ${Date.now()}`;
  const msg = await sendText(boris, chat.id, spam);
  const report = await alice.api.post("/api/reports", { targetType: "message", targetId: msg.id, reason: "spam" });
  expect(report.status, report.text).toBe(200);

  const a = (await openAs(alice.api, `/chat/${chat.id}`)).page;
  await expect(messageText(a, spam)).toBeVisible();
  const m = (await openAs(mod.api, `/chat/${await dmWithBot(mod)}`)).page;
  await m.getByRole("button", { name: "Удалить", exact: true }).click();
  await expect(m.getByText("Удалено", { exact: true })).toBeVisible();
  await expect(messageText(a, spam)).toHaveCount(0);
});

test("жалоба на собеседника из панели чата: модератор блокирует — у нарушителя выход и метка «СКАМ» у собеседника", async ({ newUser, openAs, admin, baseUrl }) => {
  const mod = await moderator(baseUrl, admin, person("Модератор"));
  const aliceName = person("Алиса");
  const borisName = person("Борис");
  const alice = await newUser(aliceName);
  const boris = await newUser(borisName);
  const chat = await createDm(alice, boris);
  await sendText(boris, chat.id, "Переведи мне 1000 рублей");

  // Нарушитель сидит в приложении на своём устройстве.
  const b = (await openAs(boris.api, "/")).page;
  await expectSignedIn(b);

  // Алиса: шапка чата → панель информации → «Пожаловаться».
  const a = (await openAs(alice.api, `/chat/${chat.id}`)).page;
  await a.getByRole("banner").getByRole("button", { name: new RegExp(borisName) }).click();
  await a.getByRole("button", { name: "Пожаловаться", exact: true }).click();
  await expect(a.getByRole("heading", { name: `Пожаловаться на ${borisName}` })).toBeVisible();
  await a.getByRole("radio", { name: "Мошенничество", exact: true }).check();
  await a.getByRole("button", { name: "Отправить жалобу" }).click();
  await expect(a.getByRole("heading", { name: `Пожаловаться на ${borisName}` })).toHaveCount(0);

  // Модератор: карточка жалобы на пользователя — удалять нечего, только «Заблокировать»/«Отклонить».
  const m = (await openAs(mod.api, `/chat/${await dmWithBot(mod)}`)).page;
  await expect(m.getByText("Жалоба: Мошенничество", { exact: true })).toBeVisible();
  await expect(m.getByText(`Пользователь: ${borisName} (@${boris.username})`, { exact: true })).toBeVisible();
  await expect(m.getByRole("button", { name: "Удалить", exact: true })).toHaveCount(0);
  await m.getByRole("button", { name: "Заблокировать", exact: true }).click();
  await expect(m.getByText("Пользователь заблокирован", { exact: true })).toBeVisible();

  // Нарушителя выкидывает на экран входа с причиной блокировки.
  await expect(b.getByText("Этот аккаунт заблокирован администрацией Shalter. Причина: Жалоба: Мошенничество")).toBeVisible({ timeout: 30_000 });
  await expect(b).toHaveURL(/\/login/);

  // Жалоба «Мошенничество» ставит метку «СКАМ» — Алиса видит её в шапке чата.
  await a.goto(`/chat/${chat.id}`);
  await expect(a.getByRole("banner").getByText("СКАМ", { exact: true })).toBeVisible();
});
