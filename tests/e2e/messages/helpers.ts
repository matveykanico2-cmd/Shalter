// Общие действия для сценариев про сообщения (ответ, пересылка, закреп, опросы…).
// Только роли и видимые тексты — без классов и структуры DOM.
import { expect, type Page } from "@playwright/test";
import { messageText } from "../support/ui";

/**
 * Пункт открытого всплывающего меню.
 * TODO(a11y): у всплывающего меню нет роли menu, а у пунктов — menuitem; к тому же
 * у пузырей есть быстрые кнопки с теми же именами («Ответить»). Меню добавляется
 * в конец документа, поэтому берём последнюю кнопку с таким именем. Когда появится
 * role="menu", заменить на page.getByRole("menu").getByRole("menuitem", { name }).
 */
export function menuItem(page: Page, item: string) {
  return page.getByRole("button", { name: item, exact: true }).last();
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
