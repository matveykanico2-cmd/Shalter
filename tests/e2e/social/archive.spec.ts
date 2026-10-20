// Архив чатов: убрать чат в архив из меню строки, найти его на экране «Архив»,
// вернуть обратно; новое сообщение само возвращает незаглушённый чат из архива.
import { test, expect } from "../support/fixtures";
import { createDm, sendText } from "../../support/seed";
import { chatRow, expectSignedIn, navLink } from "../support/ui";
import type { Page } from "@playwright/test";

const EMPTY_ARCHIVE = /^В архиве пусто/;

/** «⋮ Действия с чатом» у строки чата → пункт меню. У пользователя здесь один чат. */
async function chatMenu(page: Page, item: string) {
  // TODO(a11y): кнопка «Действия с чатом» не связана со своей строкой (одинаковое имя
  // у каждой строки); сценарии держат один чат, чтобы она была однозначной.
  await page.getByRole("button", { name: "Действия с чатом" }).click();
  await page.getByRole("button", { name: item, exact: true }).click();
}

test("архивировать из списка, увидеть на экране «Архив», вернуть обратно", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const chat = await createDm(boris, alice);
  await sendText(boris, chat.id, "Старая переписка");

  const { page } = await openAs(alice.api, "/");
  await expectSignedIn(page);
  const row = chatRow(page, "Борис", "Старая переписка");
  await expect(row).toBeVisible();

  await chatMenu(page, "Архивировать");
  await expect(row).toHaveCount(0);
  // В списке появляется строка «Архив» с именами заархивированных чатов.
  await expect(page.getByRole("button", { name: /^Архив\s+Борис/ })).toBeVisible();

  // Экран «Архив» из навигации.
  await navLink(page, "Архив").click();
  await expect(page).toHaveURL(/\/archive$/);
  await expect(page.getByText("В архиве — 1", { exact: true })).toBeVisible();
  await expect(row).toBeVisible();

  // Сохраняется на сервере — после перезагрузки на месте.
  await page.reload();
  await expect(page.getByText("В архиве — 1", { exact: true })).toBeVisible();
  // Сразу после перезагрузки список слева на мгновение рисуется из локального кэша, где
  // чат ещё не в архиве; после ответа сервера строка остаётся только на экране «Архив».
  await expect(row).toHaveCount(1);
  await expect(row).toBeVisible();
  expect((await alice.api.get("/api/chats")).body.chats.find((c: any) => c.id === chat.id)?.archived).toBe(true);
  // Архив личный: у Бориса чат на обычном месте.
  expect((await boris.api.get("/api/chats")).body.chats.find((c: any) => c.id === chat.id)?.archived).toBeFalsy();

  // «Вернуть из архива» — архив пуст, чат снова в общем списке.
  await chatMenu(page, "Вернуть из архива");
  await expect(page.getByText(EMPTY_ARCHIVE)).toBeVisible();
  await navLink(page, "Чаты").click();
  await expect(row).toBeVisible();
  await expect(page.getByRole("button", { name: /^Архив\s+Борис/ })).toHaveCount(0);
});

test("новое сообщение возвращает чат из архива, заглушённый остаётся в архиве", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const vera = await newUser("Вера");
  const loud = await createDm(boris, alice);
  await sendText(boris, loud.id, "Первое от Бориса");
  const quiet = await createDm(vera, alice);
  await sendText(vera, quiet.id, "Первое от Веры");
  // Оба чата в архиве; чат с Верой ещё и заглушён навсегда.
  for (const id of [loud.id, quiet.id]) expect((await alice.api.patch(`/api/chats/${id}`, { archived: true })).status).toBe(200);
  expect((await alice.api.post(`/api/chats/${quiet.id}/mute`, { forever: true })).status).toBe(200);

  const { page } = await openAs(alice.api, "/archive");
  await expect(page.getByText("В архиве — 2", { exact: true })).toBeVisible();
  await expect(page.getByText(/Чаты с включёнными уведомлениями возвращаются из архива/)).toBeVisible();

  await sendText(boris, loud.id, "Ты где пропала?");
  await sendText(vera, quiet.id, "Я тихонько");

  // Борис вернулся в общий список (с новым сообщением), Вера осталась в архиве.
  await expect(page.getByText("В архиве — 1", { exact: true })).toBeVisible();
  await expect(chatRow(page, "Вера", "Я тихонько")).toBeVisible();
  await navLink(page, "Чаты").click();
  await expect(chatRow(page, "Борис", "Ты где пропала?")).toBeVisible();
  await expect(chatRow(page, "Вера", "Я тихонько")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Архив\s+Вера/ })).toBeVisible();
});
