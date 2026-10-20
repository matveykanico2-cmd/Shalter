// Навигация по длинной переписке: поиск по чату и переход к дате через календарь.
import { test, expect } from "../support/fixtures";
import { createDm, sendText } from "../../support/seed";
import { messageText } from "../support/ui";
import { chatMenu } from "./helpers";

/** Длинная история: первое сообщение не попадает в первую загруженную страницу ленты. */
async function seedLongHistory(user: Parameters<typeof sendText>[0], chatId: string, first: string, total = 75) {
  await sendText(user, chatId, first);
  for (let i = 2; i <= total; i++) await sendText(user, chatId, `Сообщение номер ${i}`);
}

test("поиск по чату находит старое сообщение и прокручивает к нему", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const chat = await createDm(alice, boris);
  await seedLongHistory(boris, chat.id, "Пароль от wi-fi: кукушка42");

  const a = (await openAs(alice.api, `/chat/${chat.id}`)).page;
  await expect(messageText(a, "Сообщение номер 75")).toBeVisible();
  // Самое старое ещё не подгружено.
  await expect(messageText(a, "Пароль от wi-fi: кукушка42")).toHaveCount(0);

  await chatMenu(a, "Поиск по чату");
  const field = a.getByPlaceholder("Найти в этом чате");
  await expect(field).toBeFocused();
  await field.fill("несуществующее");
  await expect(a.getByText("Ничего не найдено")).toBeVisible();

  await field.fill("кукушка");
  // Результат — кнопка с именем автора и текстом.
  const hit = a.getByRole("button", { name: /Борис\s*Пароль от wi-fi: кукушка42/ });
  await expect(hit).toBeVisible();
  await hit.click();
  // Поиск закрылся, лента подгрузила историю и показала найденное.
  await expect(field).toHaveCount(0);
  await expect(messageText(a, "Пароль от wi-fi: кукушка42")).toBeInViewport();
});

test("переход к дате: календарь подсвечивает дни с сообщениями и ведёт к первому сообщению дня", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const chat = await createDm(alice, boris);
  await seedLongHistory(boris, chat.id, "Самое первое сообщение сегодня");

  const a = (await openAs(alice.api, `/chat/${chat.id}`)).page;
  await expect(messageText(a, "Сообщение номер 75")).toBeVisible();
  await expect(messageText(a, "Самое первое сообщение сегодня")).toHaveCount(0);

  // Разделитель дня «Сегодня» — кнопка, открывающая календарь.
  await a.getByRole("button", { name: "Сегодня", exact: true }).first().click();
  await expect(a.getByRole("heading", { name: "Перейти к дате" })).toBeVisible();
  const months = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
  const now = new Date();
  await expect(a.getByText(`${months[now.getMonth()]} ${now.getFullYear()}`, { exact: true })).toBeVisible();

  // Сегодня писали — день активен; любой другой день месяца неактивен.
  const today = a.getByRole("button", { name: String(now.getDate()), exact: true });
  await expect(today).toBeEnabled();
  const otherDay = now.getDate() === 1 ? 2 : 1;
  await expect(a.getByRole("button", { name: String(otherDay), exact: true })).toBeDisabled();

  await today.click();
  await expect(a.getByRole("heading", { name: "Перейти к дате" })).toHaveCount(0);
  await expect(messageText(a, "Самое первое сообщение сегодня")).toBeInViewport();
});
