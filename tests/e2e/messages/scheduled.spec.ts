// Отложенные сообщения: «Отправить позже», список запланированных, отправка сейчас и удаление.
import { test, expect } from "../support/fixtures";
import { createDm, sendText } from "../../support/seed";
import { composer, messageText } from "../support/ui";
import { chatMenu, menuItem } from "./helpers";

test("запланировать сообщение, увидеть его в списке и отправить сейчас — оно приходит собеседнику", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const chat = await createDm(alice, boris);
  await sendText(boris, chat.id, "Напомни про встречу");

  const a = (await openAs(alice.api, `/chat/${chat.id}`)).page;
  const b = (await openAs(boris.api, `/chat/${chat.id}`)).page;
  await expect(messageText(a, "Напомни про встречу")).toBeVisible();
  await expect(messageText(b, "Напомни про встречу")).toBeVisible();

  // Правый клик по кнопке отправки → «Отправить позже» → окно выбора времени (по умолчанию +5 минут).
  await composer(a).fill("Встреча в 15:00");
  await a.getByRole("button", { name: /^Отправить \(правый клик/ }).click({ button: "right" });
  await menuItem(a, "Отправить позже").click();
  await expect(a.getByRole("heading", { name: "Отправить позже" })).toBeVisible();
  await expect(a.getByRole("combobox", { name: "Повтор" })).toHaveValue("");
  // В личке есть вариант «Отправить, когда будет в сети».
  await expect(a.getByRole("button", { name: "Отправить, когда будет в сети" })).toBeVisible();
  await a.getByRole("button", { name: "Запланировать", exact: true }).click();

  // Поле очищается, сразу открывается список запланированных с этим сообщением.
  await expect(composer(a)).toHaveValue("");
  await expect(a.getByRole("heading", { name: "Запланированные сообщения" })).toBeVisible();
  await expect(a.getByText("Встреча в 15:00", { exact: true })).toBeVisible();
  // Собеседнику пока ничего не пришло.
  await expect(messageText(b, "Встреча в 15:00")).toHaveCount(0);
  await a.getByRole("button", { name: "Закрыть", exact: true }).click();
  await expect(messageText(a, "Встреча в 15:00")).toHaveCount(0);

  // Список доступен из меню «Ещё» и после перезагрузки.
  await a.reload();
  await expect(messageText(a, "Напомни про встречу")).toBeVisible();
  await chatMenu(a, "Запланированные сообщения");
  await expect(a.getByText("Встреча в 15:00", { exact: true })).toBeVisible();

  // «Отправить сейчас» — сообщение уходит, список пустеет, Борис видит его вживую.
  await a.getByRole("button", { name: "Отправить сейчас" }).click();
  await expect(a.getByText("Нет запланированных сообщений")).toBeVisible();
  await expect(messageText(b, "Встреча в 15:00")).toBeVisible();
  await a.getByRole("button", { name: "Закрыть", exact: true }).click();
  await expect(messageText(a, "Встреча в 15:00")).toBeVisible();
});

test("запланированное с повтором можно удалить — оно не уйдёт", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const chat = await createDm(alice, boris);
  await sendText(boris, chat.id, "Привет");

  const a = (await openAs(alice.api, `/chat/${chat.id}`)).page;
  await expect(messageText(a, "Привет")).toBeVisible();

  // Кнопка «Отправить позже» (часы) в панели ввода; повтор — «Каждый день».
  await composer(a).fill("Доброе утро!");
  await a.getByRole("button", { name: "Отправить позже", exact: true }).click();
  await a.getByRole("combobox", { name: "Повтор" }).selectOption({ label: "Каждый день" });
  await a.getByRole("button", { name: "Запланировать", exact: true }).click();

  await expect(a.getByRole("heading", { name: "Запланированные сообщения" })).toBeVisible();
  await expect(a.getByText("Доброе утро!", { exact: true })).toBeVisible();
  // Пометка повтора: «🔁 Каждый день» (эмодзи рисуется картинкой).
  await expect(a.getByText(/Каждый день/)).toBeVisible();

  await a.getByRole("button", { name: "Удалить", exact: true }).last().click();
  await expect(a.getByText("Нет запланированных сообщений")).toBeVisible();
  const res = await alice.api.get(`/api/chats/${chat.id}/messages/scheduled`);
  expect(res.body.scheduled).toEqual([]);
});
