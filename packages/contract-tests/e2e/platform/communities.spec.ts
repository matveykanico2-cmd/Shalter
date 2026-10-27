// Сообщества: создание из меню «Новый чат», добавление своей группы, страница
// сообщества по ссылке /community/:id — другой человек вступает в сообщество и в чат.
import { test, expect } from "../support/fixtures";
import { createGroup, sendText } from "../../support/seed";
import { chatRow, composer, expectSignedIn, messageText } from "../support/ui";
import { publicGroup } from "./helpers";

test("создание сообщества и добавление своей группы — панель сообщества в списке чатов", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const club = await publicGroup(alice, [boris], "Клуб садоводов");
  await sendText(alice, club.id, "Рассада готова");

  const { page } = await openAs(alice.api, "/");
  await expectSignedIn(page);
  await page.getByRole("button", { name: "Новый чат", exact: true }).click();
  await page.getByRole("button", { name: "Новое сообщество", exact: true }).click();
  await page.getByRole("textbox", { name: "Название сообщества" }).fill("Дачники");
  await page.getByRole("textbox", { name: "Описание (необязательно)" }).fill("Всё о даче");
  // Кто может добавлять чаты — по умолчанию «Все участники».
  await expect(page.getByRole("radio", { name: /^Все участники/ })).toBeChecked();
  await page.getByRole("radio", { name: /^Только администраторы/ }).click();
  await expect(page.getByRole("radio", { name: /^Только администраторы/ })).toBeChecked();
  await page.getByRole("button", { name: "Создать", exact: true }).click();
  await expect(page.getByText("Сообщество создано")).toBeVisible();

  // Открылась панель сообщества: описание и кнопка добавления чата.
  await expect(page.getByRole("button", { name: /Дачники.*0 чатов · 1 участник/ })).toBeVisible();
  await expect(page.getByText("Всё о даче", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Добавить чат в сообщество" }).click();
  await expect(page.getByRole("heading", { name: "Добавить чат в сообщество" })).toBeVisible();
  await page.getByRole("button", { name: "Клуб садоводов" }).click();

  // Видимость чата перед добавлением.
  await expect(page.getByRole("radio", { name: /^Видимый/ })).toBeChecked();
  await page.getByRole("button", { name: "Добавить", exact: true }).click();

  // Группа в разделе «Ваши чаты» панели; сервер знает о ней.
  await expect(page.getByText("Ваши чаты", { exact: true })).toBeVisible();
  // В саму группу приходит служебное сообщение о добавлении.
  await expect(chatRow(page, "Клуб садоводов", "Группа добавлена в сообщество «Дачники»")).toBeVisible();
  const { communities } = (await alice.api.get("/api/communities/joined")).body;
  expect(communities).toMatchObject([{ title: "Дачники", chatIds: [club.id] }]);

  // Назад к чатам — сообщество одной строкой в списке; после перезагрузки на месте.
  await page.getByRole("button", { name: "Назад к чатам" }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: /Дачники.*Клуб садоводов: Группа добавлена в сообщество/ })).toBeVisible();
});

test("страница сообщества по ссылке: другой человек вступает в сообщество и в открытую группу", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const open = await publicGroup(alice, [], "Открытый клуб");
  await sendText(alice, open.id, "Всем привет в клубе");
  const closed = await createGroup(alice, [], { title: "Закрытый штаб" });
  const res = await alice.api.post("/api/communities", { title: "Город", description: "Жители города", chatId: open.id });
  expect(res.status).toBe(200);
  const community = res.body.community;
  expect((await alice.api.post(`/api/communities/${community.id}/chats`, { chatId: closed.id })).status).toBe(200);

  const a = (await openAs(alice.api, `/community/${community.id}`)).page;
  await expect(a.getByRole("heading", { name: "Город" })).toBeVisible();
  await expect(a.getByText(/Сообщество · 2 чата · 1 участник$/)).toBeVisible();

  const { page: b } = await openAs(boris.api, `/community/${community.id}`);
  await expect(b.getByRole("heading", { name: "Город" })).toBeVisible();
  await expect(b.getByText("Жители города", { exact: true })).toBeVisible();
  await expect(b.getByText("Открытый клуб", { exact: true })).toBeVisible();
  await expect(b.getByText("Закрытый штаб", { exact: true })).toBeVisible();
  await expect(b.getByText(/по приглашению/)).toBeVisible();

  await b.getByRole("button", { name: "Вступить в сообщество" }).click();
  await expect(b.getByText("Вы вступили в сообщество")).toBeVisible();
  await expect(b.getByRole("button", { name: "Открыть в списке чатов" })).toBeVisible();
  await expect(b.getByRole("button", { name: /Покинуть/ })).toBeVisible();
  // Владелец видит нового участника и после перезагрузки (вживую — отдельный тест ниже).
  await a.reload();
  await expect(a.getByText(/Сообщество · 2 чата · 2 участника$/)).toBeVisible();

  // Вступление в открытую группу сообщества — сразу переписка группы.
  await b.getByRole("button", { name: "Вступить", exact: true }).click();
  await expect(b).toHaveURL(new RegExp(`/chat/${open.id}$`));
  await expect(composer(b)).toBeVisible();
  await expect(messageText(b, "Всем привет в клубе")).toBeVisible();
  expect((await alice.api.get(`/api/chats/${open.id}`)).body.chat.memberIds).toContain(boris.id);

  // После перезагрузки страница сообщества помнит членство.
  await b.goto(`/community/${community.id}`);
  await expect(b.getByRole("button", { name: "Открыть в списке чатов" })).toBeVisible();
  await expect(b.getByRole("button", { name: "Открыть", exact: true })).toBeVisible();
});

test("несуществующее сообщество — понятная ошибка и возврат к чатам", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const { page } = await openAs(alice.api, "/community/cm_nope000000");
  await expect(page.getByRole("heading", { name: "Сообщество недоступно" })).toBeVisible();
  await expect(page.getByText("Сообщество не найдено")).toBeVisible();
  await page.getByRole("button", { name: "К чатам", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
});

// Вступление рассылает community:updated — у владельца с открытой страницей
// счётчик участников меняется сразу.
test("вступление в сообщество сразу видно на открытой странице владельца", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  // Вступить по ссылке можно в открытое сообщество — с видимым публичным чатом.
  const club = await publicGroup(alice, [], "Открытый клуб");
  const res = await alice.api.post("/api/communities", { title: "Живое сообщество", chatId: club.id });
  const id = res.body.community.id;
  const a = (await openAs(alice.api, `/community/${id}`)).page;
  await expect(a.getByText(/· 1 участник$/)).toBeVisible();
  const b = (await openAs(boris.api, `/community/${id}`)).page;
  await b.getByRole("button", { name: "Вступить в сообщество" }).click();
  await expect(b.getByText("Вы вступили в сообщество")).toBeVisible();
  await expect(a.getByText(/· 2 участника$/)).toBeVisible();
});
