// Ответ на сообщение и пересылка в другой чат.
import { test, expect } from "../support/fixtures";
import { createDm, createGroup, sendText } from "../../support/seed";
import { chatRow, composer, messageText, sendMessage } from "../support/ui";
import { messageAction, pickRow } from "./helpers";

test("ответ на сообщение: цитата видна собеседнику вживую и после перезагрузки", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const chat = await createDm(alice, boris);
  await sendText(boris, chat.id, "Во сколько встречаемся?");
  await sendText(boris, chat.id, "И где?");

  const a = (await openAs(alice.api, `/chat/${chat.id}`)).page;
  const b = (await openAs(boris.api, `/chat/${chat.id}`)).page;
  await expect(messageText(a, "Во сколько встречаемся?")).toBeVisible();
  await expect(messageText(b, "И где?")).toBeVisible();

  // Алиса: меню сообщения → «Ответить» — над полем ввода плашка «Ответ Борис» с текстом оригинала.
  await messageAction(a, "Во сколько встречаемся?", "Ответить");
  await expect(a.getByText("Ответ Борис", { exact: true })).toBeVisible();
  await expect(composer(a)).toBeFocused();
  await sendMessage(a, "В семь вечера");
  await expect(a.getByText("Ответ Борис", { exact: true })).toHaveCount(0);

  // У Бориса ответ пришёл вживую вместе с цитатой (кнопка: автор + текст оригинала).
  await expect(messageText(b, "В семь вечера")).toBeVisible();
  const quote = b.getByRole("button", { name: /Борис.*Во сколько встречаемся\?/ });
  await expect(quote).toBeVisible();

  // Цитата сохраняется после перезагрузки.
  await b.reload();
  await expect(messageText(b, "В семь вечера")).toBeVisible();
  await expect(b.getByRole("button", { name: /Борис.*Во сколько встречаемся\?/ })).toBeVisible();

  // Сервер тоже связал ответ с оригиналом.
  const res = await boris.api.get(`/api/chats/${chat.id}/messages`);
  const original = res.body.messages.find((m: any) => m.text === "Во сколько встречаемся?");
  const reply = res.body.messages.find((m: any) => m.text === "В семь вечера");
  expect(reply.replyToId).toBe(original.id);
});

test("ответ можно отменить (Escape в поле ввода) — сообщение уходит без цитаты", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const chat = await createDm(alice, boris);
  await sendText(boris, chat.id, "Есть вопрос");

  const a = (await openAs(alice.api, `/chat/${chat.id}`)).page;
  await messageAction(a, "Есть вопрос", "Ответить");
  const banner = a.getByText("Ответ Борис", { exact: true });
  await expect(banner).toBeVisible();
  // TODO(a11y): крестик на плашке ответа — кнопка без доступного имени (только иконка),
  // поэтому отменяем клавишей Escape в поле ввода.
  await composer(a).press("Escape");
  await expect(banner).toHaveCount(0);
  await sendMessage(a, "Просто сообщение");
  await expect(messageText(a, "Просто сообщение")).toBeVisible();
  await expect(a.getByRole("button", { name: /Борис.*Есть вопрос/ })).toHaveCount(0);
});

test("пересылка в другой чат: получатель видит «Переслано от» с именем автора", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const vera = await newUser("Вера");
  const dm = await createDm(alice, boris);
  const group = await createGroup(alice, [vera], { title: "Книжный клуб" });
  await sendText(alice, group.id, "Привет, клуб");
  await sendText(boris, dm.id, "Рекомендую «Мастера и Маргариту»");

  const a = (await openAs(alice.api, `/chat/${dm.id}`)).page;
  const v = (await openAs(vera.api, `/chat/${group.id}`)).page;
  await expect(messageText(v, "Привет, клуб")).toBeVisible();

  await messageAction(a, "Рекомендую «Мастера и Маргариту»", "Переслать");
  await expect(a.getByRole("heading", { name: "Переслать сообщение" })).toBeVisible();
  // Пока ничего не выбрано — кнопка отправки неактивна.
  await expect(a.getByRole("button", { name: "Выберите чаты" })).toBeDisabled();
  // Поиск по чатам сужает список.
  await expect(pickRow(a, "Борис")).toBeVisible();
  await a.getByPlaceholder("Поиск", { exact: true }).last().fill("Книж");
  await expect(pickRow(a, "Борис")).toHaveCount(0);
  await pickRow(a, "Книжный клуб").click();
  await a.getByRole("button", { name: "Отправить (1)" }).click();
  await expect(a.getByRole("heading", { name: "Переслать сообщение" })).toHaveCount(0);

  // Вера видит пересланное вживую, с подписью об исходном авторе.
  await expect(messageText(v, "Рекомендую «Мастера и Маргариту»")).toBeVisible();
  await expect(v.getByText(/Переслано от/)).toBeVisible();
  await expect(v.getByRole("button", { name: "Борис", exact: true })).toBeVisible();

  // После перезагрузки подпись на месте.
  await v.reload();
  await expect(messageText(v, "Рекомендую «Мастера и Маргариту»")).toBeVisible();
  await expect(v.getByText(/Переслано от/)).toBeVisible();
});

test("пересылка со скрытым именем отправителя уходит без подписи «Переслано от»", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const vera = await newUser("Вера");
  const dm = await createDm(alice, boris);
  const dm2 = await createDm(alice, vera);
  await sendText(vera, dm2.id, "Жду новостей");
  await sendText(boris, dm.id, "Секретный рецепт пирога");

  const a = (await openAs(alice.api, `/chat/${dm.id}`)).page;
  const v = (await openAs(vera.api, `/chat/${dm2.id}`)).page;
  await expect(messageText(v, "Жду новостей")).toBeVisible();

  await messageAction(a, "Секретный рецепт пирога", "Переслать");
  await pickRow(a, "Вера").click();
  await a.getByRole("checkbox", { name: "Скрыть имя отправителя" }).check();
  await a.getByRole("button", { name: "Отправить (1)" }).click();

  await expect(messageText(v, "Секретный рецепт пирога")).toBeVisible();
  await expect(v.getByText(/Переслано от/)).toHaveCount(0);
});

// После пересылки в другой (не открытый) чат строка этого чата в списке у самого
// отправителя сразу показывает пересланное (message:new сервер шлёт только остальным).
test("после пересылки строка целевого чата у отправителя сразу показывает пересланное", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const vera = await newUser("Вера");
  const dm = await createDm(alice, boris);
  const group = await createGroup(alice, [vera], { title: "Книжный клуб" });
  await sendText(alice, group.id, "Привет, клуб");
  await sendText(boris, dm.id, "Рекомендую «Белую гвардию»");

  const a = (await openAs(alice.api, `/chat/${dm.id}`)).page;
  await messageAction(a, "Рекомендую «Белую гвардию»", "Переслать");
  await pickRow(a, "Книжный клуб").click();
  await a.getByRole("button", { name: "Отправить (1)" }).click();
  await expect(chatRow(a, "Книжный клуб", "Рекомендую «Белую гвардию»")).toBeVisible();
});
