// Общие локаторы и действия в интерфейсе. Только роли и видимые тексты — без классов
// и структуры DOM, чтобы сценарии пережили переписывание фронтенда.
import { expect, type Page } from "@playwright/test";

/** Пункт главной навигации (рейл слева): «Чаты», «Контакты», «Звонки», «Архив», «Настройки». */
export function navLink(page: Page, name: string) {
  return page.getByRole("navigation").getByRole("link", { name, exact: true });
}

/** Приложение загрузилось под пользователем (виден рейл навигации). */
export async function expectSignedIn(page: Page) {
  await expect(navLink(page, "Чаты")).toBeVisible();
}

/** Поле ввода сообщения. */
export function composer(page: Page) {
  return page.getByRole("textbox", { name: "Сообщение", exact: true });
}

/** Отправить текст через композер (Enter). */
export async function sendMessage(page: Page, text: string) {
  const box = composer(page);
  await box.click();
  await box.fill(text);
  await box.press("Enter");
}

/**
 * Строка чата в списке. Имя строки включает собеседника и превью последнего
 * сообщения — по превью отличаем её от шапки открытого чата.
 */
export function chatRow(page: Page, title: string, preview?: string) {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const name = preview ? new RegExp(`${esc(title)}.*${esc(preview)}`) : new RegExp(esc(title));
  return page.getByRole("button", { name });
}

/** Вкладка-фильтр над списком чатов («Все», «Личные», «Группы», «Каналы», папки). Имя может заканчиваться счётчиком. */
export function folderTab(page: Page, name: string) {
  return page.getByRole("button", { name: new RegExp(`^${name}(\\s*\\d+)?$`) });
}

/**
 * Текст сообщения в открытой переписке.
 * TODO(a11y): у ленты сообщений нет роли (log/list) и у пузыря — доступного имени.
 * Отличаем сообщение от превью в списке чатов (строка списка — кнопка) тем, что
 * текст не лежит внутри кнопки. Когда у ленты появится role="log", заменить на
 * page.getByRole("log").getByText(text).
 */
export function messageText(page: Page, text: string | RegExp) {
  return page.getByText(text).and(page.locator(":not(button, button *)"));
}
