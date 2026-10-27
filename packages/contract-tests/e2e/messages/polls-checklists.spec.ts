// Опросы, викторины и чек-листы: создание через меню вложений, голос/отметка
// одного участника сразу видна остальным.
import { test, expect } from "../support/fixtures";
import { createDm, createGroup, sendText } from "../../support/seed";
import { messageText } from "../support/ui";
import { attachMenu } from "./helpers";

test("опрос в группе: создание, голоса участников и результаты вживую", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const vera = await newUser("Вера");
  const group = await createGroup(alice, [boris, vera], { title: "Поход" });
  await sendText(alice, group.id, "Решаем, куда идём");

  const a = (await openAs(alice.api, `/chat/${group.id}`)).page;
  const b = (await openAs(boris.api, `/chat/${group.id}`)).page;
  const v = (await openAs(vera.api, `/chat/${group.id}`)).page;
  for (const p of [a, b, v]) await expect(messageText(p, "Решаем, куда идём")).toBeVisible();

  // Пустую форму не создать — подсказка об ошибке.
  await attachMenu(a, "Опрос");
  await expect(a.getByRole("heading", { name: "Новый опрос" })).toBeVisible();
  await a.getByRole("button", { name: "Создать", exact: true }).click();
  await expect(a.getByText("Введите вопрос")).toBeVisible();
  await a.getByPlaceholder("Вопрос", { exact: true }).fill("Куда пойдём в субботу?");
  await a.getByRole("button", { name: "Создать", exact: true }).click();
  await expect(a.getByText("Нужно хотя бы 2 варианта ответа")).toBeVisible();
  await a.getByPlaceholder("Вариант 1").fill("В горы");
  await a.getByPlaceholder("Вариант 2").fill("На озеро");
  await a.getByRole("button", { name: /Добавить вариант/ }).click();
  await a.getByPlaceholder("Вариант 3").fill("В музей");
  await a.getByRole("button", { name: "Создать", exact: true }).click();
  await expect(a.getByRole("heading", { name: "Новый опрос" })).toHaveCount(0);

  // Опрос пришёл всем: вопрос, тип «Опрос», варианты и «Пока нет голосов».
  for (const p of [a, b, v]) {
    await expect(messageText(p, "Куда пойдём в субботу?")).toBeVisible();
    await expect(p.getByText("Пока нет голосов")).toBeVisible();
    await expect(p.getByRole("button", { name: "На озеро" })).toBeEnabled();
  }

  // Борис голосует — у него проценты и отметка, повторно в обычном опросе не выбрать.
  await b.getByRole("button", { name: "На озеро" }).click();
  await expect(b.getByRole("button", { name: /100%\s*На озеро/ })).toBeVisible();
  await expect(b.getByText("1 проголосовал", { exact: true })).toBeVisible();
  await expect(b.getByRole("button", { name: /В горы/ })).toBeDisabled();
  await expect(b.getByRole("button", { name: "Отменить голос" })).toBeVisible();

  // Алиса и Вера видят счётчик голосов вживую; результаты им не показаны, пока сами не проголосуют.
  await expect(a.getByText("1 проголосовал", { exact: true })).toBeVisible();
  await expect(v.getByText("1 проголосовал", { exact: true })).toBeVisible();
  await expect(v.getByRole("button", { name: "В горы", exact: true })).toBeEnabled();

  // Вера голосует за другой вариант — у Бориса проценты пересчитываются вживую.
  await v.getByRole("button", { name: "В горы", exact: true }).click();
  await expect(v.getByRole("button", { name: /50%\s*В горы/ })).toBeVisible();
  await expect(b.getByRole("button", { name: /50%\s*На озеро/ })).toBeVisible();
  await expect(b.getByRole("button", { name: /50%\s*В горы/ })).toBeVisible();
  await expect(b.getByText("2 проголосовали", { exact: true })).toBeVisible();

  // Борис отменяет голос — снова может выбирать, у Веры 100% «В горы».
  await b.getByRole("button", { name: "Отменить голос" }).click();
  await expect(b.getByRole("button", { name: "На озеро", exact: true })).toBeEnabled();
  await expect(v.getByRole("button", { name: /100%\s*В горы/ })).toBeVisible();
  await expect(v.getByText("1 проголосовал", { exact: true })).toBeVisible();

  // Автор останавливает опрос — у всех «Опрос завершён», кнопки неактивны.
  await a.getByRole("button", { name: "Остановить", exact: true }).click();
  await a.getByRole("button", { name: "Остановить", exact: true }).last().click();
  for (const p of [a, b, v]) await expect(p.getByText("Опрос завершён")).toBeVisible();
  await expect(b.getByRole("button", { name: /На озеро/ })).toBeDisabled();

  // Итог сохранён на сервере.
  await b.reload();
  await expect(b.getByText("Опрос завершён")).toBeVisible();
  await expect(b.getByRole("button", { name: /100%\s*В горы/ })).toBeVisible();
});

test("викторина: ответивший сразу видит, угадал ли, и правильный ответ", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const chat = await createDm(alice, boris);
  await sendText(boris, chat.id, "Давай викторину");

  const a = (await openAs(alice.api, `/chat/${chat.id}`)).page;
  const b = (await openAs(boris.api, `/chat/${chat.id}`)).page;
  await expect(messageText(a, "Давай викторину")).toBeVisible();
  await expect(messageText(b, "Давай викторину")).toBeVisible();

  await attachMenu(a, "Опрос");
  await a.getByRole("button", { name: "Викторина", exact: true }).click();
  await expect(a.getByRole("heading", { name: "Новая викторина" })).toBeVisible();
  await a.getByPlaceholder("Вопрос", { exact: true }).fill("Столица Австралии?");
  await a.getByPlaceholder("Вариант 1").fill("Сидней");
  await a.getByPlaceholder("Вариант 2").fill("Канберра");
  // Правильный ответ — отметка у второго варианта. По умолчанию отмечен первый.
  const first = a.getByRole("button", { name: "Правильный ответ: вариант 1" });
  const second = a.getByRole("button", { name: "Правильный ответ: вариант 2" });
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await expect(second).toHaveAttribute("aria-pressed", "false");
  await second.click();
  await expect(second).toHaveAttribute("aria-pressed", "true");
  await expect(first).toHaveAttribute("aria-pressed", "false");
  await a.getByRole("button", { name: "Создать", exact: true }).click();

  await expect(messageText(b, "Столица Австралии?")).toBeVisible();
  await expect(b.getByText("Викторина", { exact: true })).toBeVisible();
  await b.getByRole("button", { name: "Сидней", exact: true }).click();
  await expect(b.getByText("Неверно. Правильный ответ: Канберра")).toBeVisible();
  // Ответ в викторине не меняют.
  await expect(b.getByRole("button", { name: /Канберра/ })).toBeDisabled();
  await expect(a.getByText("1 проголосовал", { exact: true })).toBeVisible();
});

test("чек-лист: участник отмечает пункты, автор видит прогресс вживую", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const group = await createGroup(alice, [boris], { title: "Ремонт" });
  await sendText(alice, group.id, "Составлю список");

  const a = (await openAs(alice.api, `/chat/${group.id}`)).page;
  const b = (await openAs(boris.api, `/chat/${group.id}`)).page;
  await expect(messageText(a, "Составлю список")).toBeVisible();
  await expect(messageText(b, "Составлю список")).toBeVisible();

  await attachMenu(a, "Чек-лист");
  await expect(a.getByRole("heading", { name: "Новый чек-лист" })).toBeVisible();
  await a.getByRole("button", { name: "Создать", exact: true }).click();
  await expect(a.getByText("Добавьте хотя бы один пункт")).toBeVisible();
  await a.getByPlaceholder("Название списка").fill("Купить в магазине");
  await a.getByPlaceholder("Пункт 1").fill("Краска");
  await a.getByPlaceholder("Пункт 2").fill("Кисти");
  await a.getByPlaceholder("Пункт 3").fill("Валик");
  // По умолчанию другие могут отмечать, но не добавлять пункты.
  await expect(a.getByRole("checkbox", { name: "Другие могут отмечать пункты" })).toBeChecked();
  await a.getByRole("checkbox", { name: "Другие могут добавлять пункты" }).check();
  await a.getByRole("button", { name: "Создать", exact: true }).click();

  for (const p of [a, b]) {
    await expect(messageText(p, "Купить в магазине")).toBeVisible();
    await expect(p.getByText("Выполнено 0 из 3")).toBeVisible();
  }

  // Борис отмечает «Кисти» — у него и у Алисы «Выполнено 1 из 3», у Алисы видно, кто отметил.
  await b.getByRole("button", { name: "Кисти" }).click();
  await expect(b.getByText("Выполнено 1 из 3")).toBeVisible();
  await expect(a.getByText("Выполнено 1 из 3")).toBeVisible();
  await expect(a.getByRole("button", { name: /Кисти\s*Борис/ })).toBeVisible();

  // Борис добавляет пункт (разрешено автором).
  await b.getByRole("button", { name: "+ Добавить пункт" }).click();
  await b.getByRole("textbox").last().fill("Шпатель");
  await b.keyboard.press("Enter");
  await expect(a.getByRole("button", { name: "Шпатель" })).toBeVisible();
  await expect(a.getByText("Выполнено 1 из 4")).toBeVisible();

  // Состояние сохранено.
  await a.reload();
  await expect(a.getByText("Выполнено 1 из 4")).toBeVisible();
});
