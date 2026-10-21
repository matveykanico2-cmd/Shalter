// Создание группы и канала из интерфейса: выбор участников, название, окно
// пригласительной ссылки; вступление по ссылке /join/:code в другом браузере.
import { test, expect } from "../support/fixtures";
import { chatRow, composer, expectSignedIn, messageText, sendMessage } from "../support/ui";
import { addContact, menuItem, sideTab } from "./helpers";

test("новая группа из меню: участники из контактов, название — приглашённый видит группу вживую", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const vera = await newUser("Вера");
  await addContact(alice, boris);
  await addContact(alice, vera);
  const title = `Походники ${Date.now()}`;

  const a = (await openAs(alice.api, "/")).page;
  const b = (await openAs(boris.api, "/")).page;
  await expectSignedIn(a);
  await expectSignedIn(b);

  // Кнопка «Новый чат» → «Новая группа» → сначала участники.
  await a.getByRole("button", { name: "Новый чат", exact: true }).click();
  await menuItem(a, "Новая группа").click();
  await expect(sideTab(a, "Добавить участников")).toBeVisible();
  // Поиск по контактам сужает список.
  await a.getByPlaceholder("Кого добавить?").fill("Бор");
  await expect(a.getByRole("button", { name: /Вера/ })).toHaveCount(0);
  await a.getByRole("button", { name: /Борис @/ }).click();
  // Выбранный попадает плашкой в поле поиска (плашка — тоже кнопка «Борис»).
  await expect(a.getByRole("button", { name: /Борис/ })).toHaveCount(2);
  await a.getByRole("button", { name: "Далее", exact: true }).click();

  // Название и фото; список выбранных участников под формой.
  await expect(sideTab(a, "Новая группа")).toBeVisible();
  await expect(a.getByText("1 участник", { exact: true })).toBeVisible();
  // Вкладка выбора участников остаётся под новой (кнопка «Далее» есть у обеих) —
  // жмём верхнюю, последнюю открытую.
  const next = a.getByRole("button", { name: "Далее", exact: true }).last();
  // Без названия группа не создаётся.
  await next.click();
  await expect(sideTab(a, "Новая группа")).toBeVisible();
  await a.getByRole("textbox", { name: "Название группы" }).fill(title);
  await a.getByRole("textbox", { name: "Описание (необязательно)" }).fill("Ходим по горам");
  await next.click();

  // Частная группа: сразу окно с пригласительной ссылкой.
  await expect(a.getByRole("heading", { name: "Группа создана" })).toBeVisible();
  await a.getByRole("button", { name: "Готово", exact: true }).click();
  await expect(a.getByRole("heading", { name: "Группа создана" })).toHaveCount(0);

  // Алиса уже в группе: шапка с названием и числом участников.
  await expect(a).toHaveURL(/\/chat\/[^/]+$/);
  const chatId = new URL(a.url()).pathname.split("/").pop()!;
  await expect(a.getByRole("banner").getByText(title, { exact: true })).toBeVisible();
  await expect(a.getByRole("banner").getByText(/^2 участника/)).toBeVisible();

  // У Бориса группа появилась в списке без перезагрузки; Вера не приглашена.
  await expect(chatRow(b, title)).toBeVisible();
  const veraChats = (await vera.api.get("/api/chats")).body.chats;
  expect(veraChats.some((c: any) => c.id === chatId)).toBe(false);

  // Переписка в новой группе — вживую у участника.
  await sendMessage(a, "Сбор в субботу");
  await chatRow(b, title).click();
  await expect(messageText(b, "Сбор в субботу")).toBeVisible();
  await sendMessage(b, "Я в деле");
  await expect(messageText(a, "Я в деле")).toBeVisible();

  // Сервер сохранил группу с описанием и составом.
  const res = await alice.api.get(`/api/chats/${chatId}`);
  expect(res.body.chat).toMatchObject({ type: "group", title, description: "Ходим по горам" });
  expect([...res.body.chat.memberIds].sort()).toEqual([alice.id, boris.id].sort());

  // После перезагрузки всё на месте.
  await b.reload();
  await expect(messageText(b, "Я в деле")).toBeVisible();
  await expect(b.getByRole("banner").getByText(title, { exact: true })).toBeVisible();
});

test("новый канал без подписчиков, ссылка-приглашение открывает его в другом браузере", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const title = `Вестник ${Date.now()}`;

  const a = (await openAs(alice.api, "/")).page;
  await expectSignedIn(a);
  await a.getByRole("button", { name: "Новый чат", exact: true }).click();
  await menuItem(a, "Новый канал").click();

  // Для канала сначала название и описание, потом подписчики (можно пропустить).
  await expect(sideTab(a, "Новый канал")).toBeVisible();
  await a.getByRole("textbox", { name: "Название канала" }).fill(title);
  await a.getByRole("textbox", { name: "Описание (необязательно)" }).fill("Новости клуба");
  await a.getByRole("button", { name: "Далее", exact: true }).click();
  await expect(sideTab(a, "Добавить подписчиков")).toBeVisible();
  await expect(a.getByText("Список контактов пуст — сначала добавьте людей в контакты.")).toBeVisible();
  await a.getByRole("button", { name: "Создать канал", exact: true }).click();

  await expect(a.getByRole("heading", { name: "Канал создан" })).toBeVisible();
  await expect(a).toHaveURL(/\/chat\/[^/]+$/);
  const chatId = new URL(a.url()).pathname.split("/").pop()!;
  // Ссылка в окне совпадает с выданной сервером.
  const code = (await alice.api.post(`/api/chats/${chatId}/invite`, { revoke: false })).body.code as string;
  expect(code).toBeTruthy();
  // TODO(a11y): поле со ссылкой — input без подписи (readonly); ищем его как
  // единственное поле только для чтения. С подписью («Пригласительная ссылка») — по имени.
  await expect(a.getByRole("textbox").and(a.locator("[readonly]"))).toHaveValue(new RegExp(`/join/${code}$`));
  await a.getByRole("button", { name: "Готово", exact: true }).click();
  await expect(a.getByRole("banner").getByText(title, { exact: true })).toBeVisible();
  await expect(a.getByRole("banner").getByText("1 подписчик", { exact: true })).toBeVisible();
  // Владелец канала пишет посты.
  await sendMessage(a, "Первый выпуск");
  await expect(messageText(a, "Первый выпуск")).toBeVisible();

  // Борис открывает ссылку: карточка канала с описанием и кнопкой вступления.
  const b = (await openAs(boris.api, `/join/${code}`)).page;
  await expect(b.getByRole("heading", { name: title })).toBeVisible();
  await expect(b.getByText("Новости клуба")).toBeVisible();
  await expect(b.getByText("1 подписчиков")).toBeVisible();
  await b.getByRole("button", { name: "Присоединиться к каналу" }).click();

  // Внутри канала: пост виден, писать подписчик не может — вместо поля «ОТПИСАТЬСЯ».
  await expect(b).toHaveURL(new RegExp(`/chat/${chatId}$`));
  await expect(messageText(b, "Первый выпуск")).toBeVisible();
  await expect(b.getByRole("button", { name: "ОТПИСАТЬСЯ" })).toBeVisible();
  await expect(composer(b)).toHaveCount(0);
  await expect(chatRow(b, title, "Первый выпуск")).toBeVisible();

  // У владельца число подписчиков обновляется при следующей загрузке канала.
  await a.reload();
  await expect(a.getByRole("banner").getByText("2 подписчика", { exact: true })).toBeVisible();

  // Повторный переход по ссылке — уже «Открыть».
  await b.goto(`/join/${code}`);
  await b.getByRole("button", { name: "Открыть", exact: true }).click();
  await expect(b).toHaveURL(new RegExp(`/chat/${chatId}$`));
});

test("недействительная ссылка-приглашение — понятная ошибка и выход к чатам", async ({ newUser, openAs }) => {
  const boris = await newUser("Борис");
  const b = (await openAs(boris.api, "/join/nonexistent-code")).page;
  await expect(b.getByRole("heading", { name: "Ссылка не работает" })).toBeVisible();
  await b.getByRole("button", { name: "К чатам" }).click();
  await expectSignedIn(b);
});
