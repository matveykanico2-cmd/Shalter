// Блокировка из интерфейса и её видимые последствия для обеих сторон.
import { test, expect } from "../support/fixtures";
import { createDm, sendText } from "../../support/seed";
import { composer, messageText, sendMessage } from "../support/ui";
import { confirmDialog, contactEntry, profilePanel, rowAction, storyItem } from "./helpers";
import type { TestUser } from "../support/fixtures";

async function texts(user: TestUser, chatId: string): Promise<string[]> {
  return (await user.api.get(`/api/chats/${chatId}/messages`)).body.messages.map((m: any) => m.text);
}

test("блокировка из лички: собеседник не может писать и не видит «в сети»; разблокировка возвращает переписку", async ({
  newUser,
  openAs,
}) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const chat = await createDm(alice, boris);
  await sendText(boris, chat.id, "Купи слона");

  const a = (await openAs(alice.api, `/chat/${chat.id}`)).page;
  const b = (await openAs(boris.api, `/chat/${chat.id}`)).page;
  await expect(messageText(a, "Купи слона")).toBeVisible();
  await expect(messageText(b, "Купи слона")).toBeVisible();
  // Пока не заблокирован, Борис видит, что Алиса в сети.
  await expect(b.getByRole("banner").getByText("в сети", { exact: true })).toBeVisible();

  // Плашка над перепиской незнакомого собеседника: «Заблокировать» → подтверждение.
  await a.getByRole("button", { name: "Заблокировать", exact: true }).click();
  await confirmDialog(a, /^Заблокировать Борис\?/, "Заблокировать");
  // Вместо поля ввода — плашка с разблокировкой.
  await expect(a.getByText("Вы заблокировали этого пользователя")).toBeVisible();
  await expect(composer(a)).toHaveCount(0);
  await expect(a.getByRole("button", { name: "Разблокировать", exact: true }).first()).toBeVisible();

  // Борис пишет — сервер отказывает, Борис видит причину, текст остаётся в поле.
  await sendMessage(b, "Ну купи");
  await expect(b.getByRole("status").filter({ hasText: "Пользователь заблокировал вас" })).toBeVisible();
  await expect(composer(b)).toHaveValue("Ну купи");
  expect(await texts(alice, chat.id)).not.toContain("Ну купи");
  await expect(messageText(a, "Ну купи")).toHaveCount(0);

  // После перезагрузки Борис уже не видит, что Алиса в сети.
  await b.reload();
  await expect(messageText(b, "Купи слона")).toBeVisible();
  await expect(b.getByRole("banner").getByText("был(а) недавно", { exact: true })).toBeVisible();
  await expect(b.getByRole("banner").getByText("в сети", { exact: true })).toHaveCount(0);

  // Блокировка переживает перезагрузку и у Алисы.
  await a.reload();
  await expect(a.getByText("Вы заблокировали этого пользователя")).toBeVisible();

  // Разблокировка — поле ввода возвращается, сообщения Бориса снова доходят.
  await a.getByRole("button", { name: "Разблокировать", exact: true }).last().click();
  await expect(a.getByText("Вы заблокировали этого пользователя")).toHaveCount(0);
  await expect(composer(a)).toBeVisible();
  await sendMessage(b, "Мир?");
  await expect(messageText(a, "Мир?")).toBeVisible();
});

test("блокировка из контактов и разблокировка из профиля", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  expect((await alice.api.post("/api/contacts", { userId: boris.id })).status).toBe(200);
  const chat = await createDm(boris, alice);
  await sendText(boris, chat.id, "Привет из контактов");

  const a = (await openAs(alice.api, "/contacts")).page;
  await expect(a.getByText("Контакты — 1", { exact: true })).toBeVisible();
  // Кнопка в строке контакта меняется на «Разблокировать».
  await rowAction(a, "Борис", "Заблокировать");
  await contactEntry(a, "Борис").hover();
  await expect(a.getByRole("button", { name: "Разблокировать", exact: true })).toBeVisible();
  await expect(a.getByRole("button", { name: "Заблокировать", exact: true })).toHaveCount(0);

  // Борис больше не может отправить Алисе сообщение.
  const b = (await openAs(boris.api, `/chat/${chat.id}`)).page;
  await sendMessage(b, "Ты меня заблокировала?");
  await expect(b.getByRole("status").filter({ hasText: "Пользователь заблокировал вас" })).toBeVisible();

  // В профиле Бориса у Алисы: «Разблокировать», а звонков нет.
  await a.goto(`/u/${boris.username}`);
  const panel = profilePanel(a);
  await expect(panel.getByRole("button", { name: /Разблокировать/ })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Звонок", exact: true })).toHaveCount(0);
  await panel.getByRole("button", { name: /Разблокировать/ }).click();
  await expect(panel.getByRole("button", { name: /Заблокировать/ })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Звонок", exact: true })).toBeVisible();

  await sendMessage(b, "Ура, снова можно");
  await expect.poll(() => texts(alice, chat.id)).toContain("Ура, снова можно");
});

// Заблокированный собеседник не «печатает» у того, кто его заблокировал: событие
// набора через блокировку не доставляется.
test("заблокированный не показывает «печатает…»", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const chat = await createDm(alice, boris);
  await sendText(boris, chat.id, "Привет");
  expect((await alice.api.post(`/api/users/${boris.id}/block`, { blocked: true })).status).toBe(200);

  const a = (await openAs(alice.api, `/chat/${chat.id}`)).page;
  const b = (await openAs(boris.api, `/chat/${chat.id}`)).page;
  await expect(a.getByText("Вы заблокировали этого пользователя")).toBeVisible();
  await expect(storyItem(a, "Борис")).toHaveCount(0);
  await composer(b).click();
  await composer(b).pressSequentially("Ну ответь же");
  // Точка синхронизации: Борис после набора выкладывает историю — когда её кружок
  // дошёл до Алисы, событие набора (отправленное раньше) тоже бы уже дошло.
  expect((await boris.api.post("/api/stories", { kind: "image", url: "https://img.test.invalid/sync.jpg" })).status).toBe(200);
  await expect(storyItem(a, "Борис")).toBeVisible();
  // Проверка без ожидания: индикатор и так гаснет сам через несколько секунд.
  expect(await a.getByRole("banner").getByText("печатает…").count()).toBe(0);
});
