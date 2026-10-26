// Помощники сценариев групп и каналов. Только роли и видимые тексты.
import { expect, type Locator, type Page } from "@playwright/test";
import type { TestUser } from "../../support/seed";

/** A добавляет B в контакты (выбор участников показывает только контакты). */
export async function addContact(owner: TestUser, target: TestUser): Promise<void> {
  const res = await owner.api.post("/api/contacts", { userId: target.id });
  expect(res.status, res.text).toBe(200);
}

/**
 * Пункт открытого выпадающего меню (role="menu"; пункты — кнопки). Поиск внутри меню отличает
 * пункт от кнопки шапки с тем же именем («Информация о чате»).
 */
export function menuItem(page: Page, name: string) {
  return page.getByRole("menu").getByRole("button", { name, exact: true });
}

/** Меню «Ещё» в шапке открытого чата → пункт. */
export async function chatMenu(page: Page, item: string) {
  await page.getByRole("banner").getByRole("button", { name: "Ещё", exact: true }).click();
  await menuItem(page, item).click();
}

/** Панель информации о чате (заголовок «Группа» / «Канал»). */
export function infoPanel(page: Page, heading: "Группа" | "Канал") {
  return page.getByRole("complementary").filter({ has: page.getByRole("heading", { name: heading, exact: true }) });
}

/** Открыть панель информации через «Ещё» → «Информация о чате». */
export async function openInfo(page: Page, heading: "Группа" | "Канал") {
  await chatMenu(page, "Информация о чате");
  const panel = infoPanel(page, heading);
  await expect(panel).toBeVisible();
  return panel;
}

/** Строка участника в панели: кнопка профиля (имя: буква аватара, имя, роль, статус). */
export function memberRow(panel: Locator, name: string) {
  return panel.getByRole("button", { name: new RegExp(`(^|\\s)${name}(\\s|$)`) });
}

/** Кнопка «⋯ Действия с участником» в строке участника (группа с его именем). */
export function memberActions(panel: Locator, name: string) {
  return panel.getByRole("group", { name, exact: true }).getByRole("button", { name: "Действия с участником", exact: true });
}

/** Боковая вкладка (tweb side tab) с заголовком title. */
export function sideTab(page: Page, title: string) {
  return page.getByRole("heading", { name: title, exact: true });
}

/** Тост (role="status") с текстом. */
export function toast(page: Page, text: string | RegExp) {
  return page.getByRole("status").filter({ hasText: text });
}

/** Сообщение в ленте или в панели комментариев — текст вне кнопок (см. messageText в ../support/ui). */
export function textOutsideButtons(scope: Page | Locator, text: string | RegExp) {
  return scope.getByText(text).and(scope.locator(":not(button, button *)"));
}
