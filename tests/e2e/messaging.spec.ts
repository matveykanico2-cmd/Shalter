// Переписка двух людей в двух браузерах: живая доставка, «печатает…», реакция,
// правка, удаление и отметка о прочтении.
import { test, expect } from "./support/fixtures";
import { createDm, sendText } from "../support/seed";
import { composer, messageText, sendMessage } from "./support/ui";

test("текст, «печатает…», реакция, правка, удаление и прочтение — вживую у собеседника", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const chat = await createDm(alice, boris);
  // Переписка уже начата (удаление самого раннего сообщения — отдельный тест ниже).
  await sendText(boris, chat.id, "Начало переписки");

  const a = (await openAs(alice.api, `/chat/${chat.id}`)).page;
  const b = (await openAs(boris.api, `/chat/${chat.id}`)).page;
  await expect(composer(a)).toBeVisible();
  await expect(composer(b)).toBeVisible();
  // Шапка лички у Бориса: имя собеседника.
  await expect(b.getByRole("banner").getByText("Алиса", { exact: true })).toBeVisible();

  // Алиса набирает — у Бориса в шапке «печатает…».
  await composer(a).click();
  await composer(a).pressSequentially("Привет, Борис!");
  await expect(b.getByRole("banner").getByText("печатает…")).toBeVisible();

  // Отправка Enter: сообщение у обоих, поле очищается, «печатает…» пропадает.
  await composer(a).press("Enter");
  await expect(composer(a)).toHaveValue("");
  await expect(messageText(a, "Привет, Борис!")).toBeVisible();
  await expect(messageText(b, "Привет, Борис!")).toBeVisible();
  await expect(b.getByRole("banner").getByText("печатает…")).toHaveCount(0);

  // Прочтение: Борис держит чат открытым — сервер отмечает сообщение прочитанным,
  // а у Алисы одна галочка сменяется двумя.
  await expect
    .poll(async () => {
      const res = await alice.api.get(`/api/chats/${chat.id}/messages`);
      const msg = res.body.messages.find((m: any) => m.text === "Привет, Борис!");
      return msg?.readByIds ?? [];
    })
    .toContain(boris.id);
  // TODO(a11y): отметка «отправлено/прочитано» — иконка без подписи (одна или две
  // галочки). Ищем внутри сообщения SVG из двух линий («две галочки»); когда у иконки
  // появится aria-label («Прочитано»), проверять её по имени.
  await expect(messageText(a, "Привет, Борис!").locator("svg:has(path + path)").first()).toBeAttached();

  // Ответ Бориса приходит Алисе вживую.
  await sendMessage(b, "Привет, Алиса!");
  await expect(messageText(a, "Привет, Алиса!")).toBeVisible();

  // Реакция: двойной клик по сообщению → плашка реакций → 👍. Алиса видит её у себя.
  await messageText(b, "Привет, Борис!").dblclick();
  const reactions = b.getByRole("menu", { name: "Реакции" });
  await expect(reactions).toBeVisible();
  // Нажатие в первые ~400 мс после открытия плашка игнорирует (защита от «призрачного»
  // клика касания) — повторяем нажатие, пока плашка не закроется.
  await expect(async () => {
    await reactions.getByRole("button", { name: "👍", exact: true }).click({ timeout: 1000 });
    await expect(reactions).toHaveCount(0, { timeout: 500 });
  }).toPass();
  await expect(a.getByRole("button", { name: /👍/ })).toBeVisible();
  await expect(b.getByRole("button", { name: /👍/ })).toBeVisible();

  // Правка: меню сообщения (правый клик) → «Изменить» → новый текст.
  await messageText(a, "Привет, Борис!").click({ button: "right" });
  await a.getByRole("button", { name: "Изменить", exact: true }).click();
  await expect(a.getByText("Изменение", { exact: true })).toBeVisible();
  await expect(composer(a)).toHaveValue("Привет, Борис!");
  await composer(a).fill("Привет, Борис! Как дела?");
  await composer(a).press("Enter");
  await expect(messageText(b, "Привет, Борис! Как дела?")).toBeVisible();
  // Пометка «изменено» рядом со временем (других изменённых сообщений в чате нет).
  await expect(b.getByText("изменено", { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expect(a.getByText("изменено", { exact: true }).filter({ visible: true }).first()).toBeVisible();

  // Удаление у всех: меню → «Удалить» → галочка «Удалить у всех» → «Удалить».
  await messageText(a, "Привет, Борис! Как дела?").click({ button: "right" });
  await a.getByRole("button", { name: "Удалить", exact: true }).click();
  await expect(a.getByText("Удалить сообщение?")).toBeVisible();
  await a.getByRole("checkbox", { name: /Удалить у всех/ }).check();
  await a.getByRole("button", { name: "Удалить", exact: true }).click();
  await expect(messageText(a, "Привет, Борис! Как дела?")).toHaveCount(0);
  await expect(messageText(b, "Привет, Борис! Как дела?")).toHaveCount(0);
  // Остальная переписка на месте.
  await expect(messageText(b, "Привет, Алиса!")).toBeVisible();
});

// Удаление у всех самого раннего сообщения загруженной страницы: у собеседника с
// открытым чатом оно исчезает сразу (сверка со списком сервера не держит его
// как «старую историю»).
test("удаление у всех самого первого сообщения сразу исчезает у собеседника", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const chat = await createDm(alice, boris);
  const a = (await openAs(alice.api, `/chat/${chat.id}`)).page;
  const b = (await openAs(boris.api, `/chat/${chat.id}`)).page;
  await sendMessage(a, "Первое");
  await expect(messageText(b, "Первое")).toBeVisible();
  await sendMessage(a, "Второе");
  await expect(messageText(b, "Второе")).toBeVisible();

  await messageText(a, "Первое").click({ button: "right" });
  await a.getByRole("button", { name: "Удалить", exact: true }).click();
  await a.getByRole("checkbox", { name: /Удалить у всех/ }).check();
  await a.getByRole("button", { name: "Удалить", exact: true }).click();
  await expect(messageText(a, "Первое")).toHaveCount(0);
  await expect(messageText(b, "Первое")).toHaveCount(0);
});
