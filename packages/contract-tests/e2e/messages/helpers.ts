// Общие действия для сценариев про сообщения (ответ, пересылка, закреп, опросы…).
// Только роли и видимые тексты — без классов и структуры DOM.
import { expect, type Page } from "@playwright/test";
import { messageText } from "../support/ui";

/**
 * Пункт открытого всплывающего меню (role="menu"). Пункты — кнопки, а не menuitem:
 * так их ищут сценарии и тесты клиента (см. AGENTS.md). Поиск внутри меню отличает пункт
 * от быстрых кнопок пузыря с тем же именем («Ответить»).
 */
export function menuItem(page: Page, item: string) {
  return page.getByRole("menu").getByRole("button", { name: item, exact: true });
}

/** Меню действий сообщения (правый клик по тексту) → пункт с именем item. */
export async function messageAction(page: Page, text: string | RegExp, item: string) {
  await messageText(page, text).first().click({ button: "right" });
  await menuItem(page, item).click();
}

/** Пункты меню «Ещё» в шапке открытого чата. */
export async function chatMenu(page: Page, item: string) {
  await page.getByRole("banner").getByRole("button", { name: "Ещё", exact: true }).click();
  await menuItem(page, item).click();
}

/** Скрепка → пункт меню вложений. */
export async function attachMenu(page: Page, item: string) {
  await page.getByRole("button", { name: "Вложение", exact: true }).click();
  await menuItem(page, item).click();
}

/** Оба пользователя открыли чат, лента загрузилась (видно сообщение marker). */
export async function expectChatLoaded(pages: Page[], marker: string) {
  for (const p of pages) await expect(messageText(p, marker).first()).toBeVisible();
}

export function esc(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Строка чата в окне «Переслать» (имя = аватар-инициалы + название). */
export function pickRow(page: Page, title: string) {
  return page.getByRole("button", { name: new RegExp(`^\\S{1,2} ${esc(title)}$`) });
}
