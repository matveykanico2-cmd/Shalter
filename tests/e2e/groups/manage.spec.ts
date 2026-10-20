// Управление группой из панели информации: участники и роли, добавление и
// исключение, редактирование названия/описания и права участников.
import { test, expect } from "../support/fixtures";
import { createGroup, sendText } from "../../support/seed";
import { chatRow, composer, expectSignedIn, messageText, sendMessage } from "../support/ui";
import { addContact, memberActions, memberRow, menuItem, openInfo, sideTab, toast } from "./helpers";

test("панель группы: назначить админа, добавить и исключить участника — видно у всех", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const vera = await newUser("Вера");
  const gleb = await newUser("Глеб");
  await addContact(alice, gleb);
  const title = `Совет дома ${Date.now()}`;
  const group = await createGroup(alice, [boris, vera], { title });
  await sendText(alice, group.id, "Собрание в четверг");

  const a = (await openAs(alice.api, `/chat/${group.id}`)).page;
  const v = (await openAs(vera.api, "/")).page;
  const g = (await openAs(gleb.api, "/")).page;
  await expect(messageText(a, "Собрание в четверг")).toBeVisible();
  await expect(chatRow(v, title, "Собрание в четверг")).toBeVisible();
  await expectSignedIn(g);

  const panel = await openInfo(a, "Группа");
  await expect(panel.getByText(/^3 участника/)).toBeVisible();
  await expect(panel.getByText("Участники (3)")).toBeVisible();
  await expect(memberRow(panel, "Алиса")).toHaveAccessibleName(/владелец/);
  await expect(memberRow(panel, "Алиса")).toHaveAccessibleName(/это вы/);
  await expect(memberRow(panel, "Борис")).not.toHaveAccessibleName(/админ/);

  // Борис — администратор: в его строке появляется роль.
  await memberActions(panel, "Борис").click();
  await menuItem(a, "Сделать администратором").click();
  await expect(memberRow(panel, "Борис")).toHaveAccessibleName(/админ/);
  await expect
    .poll(async () => (await alice.api.get(`/api/chats/${group.id}`)).body.chat.adminIds)
    .toContain(boris.id);

  // Добавить участника из контактов: Глеб получает группу без перезагрузки.
  await panel.getByRole("button", { name: "Добавить участника" }).click();
  await expect(sideTab(a, "Добавить участников")).toBeVisible();
  await a.getByRole("button", { name: /Глеб @/ }).click();
  await a.getByRole("button", { name: "Добавить", exact: true }).click();
  await expect(panel.getByText("Участники (4)")).toBeVisible();
  await expect(memberRow(panel, "Глеб")).toBeVisible();
  await expect(chatRow(g, title)).toBeVisible();

  // Исключить Веру: из панели пропадает, у самой Веры группа уходит из списка.
  await memberActions(panel, "Вера").click();
  await menuItem(a, "Исключить из чата").click();
  await expect(panel.getByText("Участники (3)")).toBeVisible();
  await expect(memberRow(panel, "Вера")).toHaveCount(0);
  await expect(chatRow(v, title)).toHaveCount(0);

  // Состав сохранился: после перезагрузки панель показывает то же.
  await a.reload();
  const again = await openInfo(a, "Группа");
  await expect(again.getByText("Участники (3)")).toBeVisible();
  await expect(memberRow(again, "Борис")).toHaveAccessibleName(/админ/);
  await expect(memberRow(again, "Глеб")).toBeVisible();
});

test("редактирование группы: новое название и описание видят участники", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const stamp = Date.now();
  const group = await createGroup(alice, [boris], { title: `Черновик ${stamp}` });
  await sendText(alice, group.id, "Привет всем");

  const a = (await openAs(alice.api, `/chat/${group.id}`)).page;
  const b = (await openAs(boris.api, "/")).page;
  await expect(chatRow(b, `Черновик ${stamp}`, "Привет всем")).toBeVisible();

  const panel = await openInfo(a, "Группа");
  await panel.getByRole("button", { name: "Редактировать группу" }).click();
  await expect(sideTab(a, "Изменить группу")).toBeVisible();
  const nameBox = a.getByRole("textbox", { name: "Название группы" });
  await expect(nameBox).toHaveValue(`Черновик ${stamp}`);
  await nameBox.fill(`Книжный клуб ${stamp}`);
  await a.getByRole("textbox", { name: "Описание" }).fill("Читаем по главе в неделю");
  await a.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(toast(a, "Сохранено")).toBeVisible();
  await expect(sideTab(a, "Изменить группу")).toHaveCount(0);

  // У Алисы: панель с новым названием и описанием, служебные сообщения в ленте
  // (шапку проверяет отдельный тест ниже).
  await expect(panel.getByText(`Книжный клуб ${stamp}`, { exact: true })).toBeVisible();
  await expect(panel.getByText("Читаем по главе в неделю")).toBeVisible();
  await expect(messageText(a, `Алиса изменил(а) название группы на «Книжный клуб ${stamp}»`)).toBeVisible();
  await expect(messageText(a, "Алиса изменил(а) описание группы")).toBeVisible();

  // У Бориса название меняется в списке без перезагрузки.
  await expect(chatRow(b, `Книжный клуб ${stamp}`)).toBeVisible();
  await expect(chatRow(b, `Черновик ${stamp}`)).toHaveCount(0);

  // Борис (не админ) открывает группу: шапка с новым названием, описание есть,
  // кнопки редактирования нет.
  await chatRow(b, `Книжный клуб ${stamp}`).click();
  await expect(b.getByRole("banner").getByText(`Книжный клуб ${stamp}`, { exact: true })).toBeVisible();
  await expect(messageText(b, "Алиса изменил(а) описание группы")).toBeVisible();
  const bPanel = await openInfo(b, "Группа");
  await expect(bPanel.getByText("Читаем по главе в неделю")).toBeVisible();
  await expect(bPanel.getByRole("button", { name: "Редактировать группу" })).toHaveCount(0);

  const chat = (await alice.api.get(`/api/chats/${group.id}`)).body.chat;
  expect(chat).toMatchObject({ title: `Книжный клуб ${stamp}`, description: "Читаем по главе в неделю" });
});

test("права участников: запрет писать — участник получает отказ, админ пишет", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const group = await createGroup(alice, [boris], { title: `Объявления ${Date.now()}` });

  const a = (await openAs(alice.api, `/chat/${group.id}`)).page;
  const b = (await openAs(boris.api, `/chat/${group.id}`)).page;
  await expect(composer(b)).toBeVisible();
  await sendMessage(b, "Пока можно");
  await expect(messageText(a, "Пока можно")).toBeVisible();

  const panel = await openInfo(a, "Группа");
  await panel.getByRole("button", { name: "Редактировать группу" }).click();
  await a.getByRole("button", { name: /^Права участников/ }).click();
  await expect(sideTab(a, "Права участников")).toBeVisible();
  await a.getByRole("button", { name: "Отправлять сообщения", exact: true }).click();
  await expect
    .poll(async () => (await alice.api.get(`/api/chats/${group.id}/permissions`)).body.permissions.sendMessages)
    .toBe(false);

  // Борис пробует написать — сервер отказывает, текст ошибки во всплывающем уведомлении.
  await sendMessage(b, "А теперь?");
  await expect(toast(b, "В этой группе писать могут только администраторы")).toBeVisible();
  await expect(messageText(a, "А теперь?")).toHaveCount(0);

  // Владельца запрет не касается.
  await a.keyboard.press("Escape");
  await a.keyboard.press("Escape");
  await sendMessage(a, "Только для админов");
  await expect(messageText(b, "Только для админов")).toBeVisible();
});

// Новое название из «Изменить группу» сразу появляется в шапке открытого чата у редактора.
test("новое название группы сразу появляется в шапке открытого чата", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const stamp = Date.now();
  const group = await createGroup(alice, [boris], { title: `Было ${stamp}` });
  const a = (await openAs(alice.api, `/chat/${group.id}`)).page;
  const panel = await openInfo(a, "Группа");
  await panel.getByRole("button", { name: "Редактировать группу" }).click();
  await a.getByRole("textbox", { name: "Название группы" }).fill(`Стало ${stamp}`);
  await a.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(toast(a, "Сохранено")).toBeVisible();
  await expect(a.getByRole("banner").getByText(`Стало ${stamp}`, { exact: true })).toBeVisible();
});
