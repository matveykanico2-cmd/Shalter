// Окно удаления сообщения: «только у себя» против «у всех», и чужое сообщение в группе.
// (Удаление у всех своего сообщения в личке — в tests/e2e/messaging.spec.ts.)
import { test, expect } from "../support/fixtures";
import { createDm, createGroup, sendText } from "../../support/seed";
import { messageText } from "../support/ui";
import { messageAction } from "./helpers";

test("удаление только у себя: сообщение пропадает у меня, у собеседника остаётся", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const chat = await createDm(alice, boris);
  await sendText(boris, chat.id, "Начало");
  await sendText(alice, chat.id, "Случайно отправила");
  await sendText(boris, chat.id, "Конец");

  const a = (await openAs(alice.api, `/chat/${chat.id}`)).page;
  const b = (await openAs(boris.api, `/chat/${chat.id}`)).page;
  await expect(messageText(a, "Конец")).toBeVisible();
  await expect(messageText(b, "Конец")).toBeVisible();

  await messageAction(a, "Случайно отправила", "Удалить");
  await expect(a.getByRole("heading", { name: "Удалить сообщение?" })).toBeVisible();
  // Своё сообщение: галочка «Удалить у всех» есть, по умолчанию снята.
  const everyone = a.getByRole("checkbox", { name: /Удалить у всех/ });
  await expect(everyone).not.toBeChecked();
  await expect(a.getByText("Сообщение исчезнет у всех участников и с сервера — вместе с вложениями.")).toBeVisible();
  await a.getByRole("button", { name: "Удалить", exact: true }).click();

  await expect(messageText(a, "Случайно отправила")).toHaveCount(0);
  // У Бориса — на месте (и после перезагрузки).
  await b.reload();
  await expect(messageText(b, "Случайно отправила")).toBeVisible();
  // У Алисы не возвращается после перезагрузки.
  await a.reload();
  await expect(messageText(a, "Конец")).toBeVisible();
  await expect(messageText(a, "Случайно отправила")).toHaveCount(0);
});

test("чужое сообщение в личке можно удалить у обоих; «Отмена» ничего не удаляет", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const chat = await createDm(alice, boris);
  await sendText(alice, chat.id, "Привет");
  await sendText(boris, chat.id, "Грубость");
  await sendText(alice, chat.id, "Пока");

  const a = (await openAs(alice.api, `/chat/${chat.id}`)).page;
  const b = (await openAs(boris.api, `/chat/${chat.id}`)).page;
  await expect(messageText(a, "Пока")).toBeVisible();
  await expect(messageText(b, "Пока")).toBeVisible();

  // Отмена — сообщение на месте.
  await messageAction(a, "Грубость", "Удалить");
  await a.getByRole("button", { name: "Отмена", exact: true }).click();
  await expect(a.getByRole("heading", { name: "Удалить сообщение?" })).toHaveCount(0);
  await expect(messageText(a, "Грубость")).toBeVisible();

  // В личке и чужое можно удалить у обоих — подсказка про собеседника.
  await messageAction(a, "Грубость", "Удалить");
  await expect(a.getByText("Сообщение исчезнет у собеседника и с сервера — вместе с вложениями.")).toBeVisible();
  await a.getByRole("checkbox", { name: /Удалить у всех/ }).check();
  await a.getByRole("button", { name: "Удалить", exact: true }).click();
  await expect(messageText(a, "Грубость")).toHaveCount(0);
  await expect(messageText(b, "Грубость")).toHaveCount(0);
  await expect(messageText(b, "Пока")).toBeVisible();
});

test("чужое сообщение в группе участник убирает только у себя", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const vera = await newUser("Вера");
  const group = await createGroup(alice, [boris, vera], { title: "Соседи" });
  await sendText(alice, group.id, "Собрание в четверг");
  await sendText(boris, group.id, "Спам от Бориса");
  await sendText(alice, group.id, "Не опаздывайте");

  const v = (await openAs(vera.api, `/chat/${group.id}`)).page;
  await expect(messageText(v, "Не опаздывайте")).toBeVisible();

  await messageAction(v, "Спам от Бориса", "Удалить");
  await expect(v.getByRole("heading", { name: "Удалить сообщение?" })).toBeVisible();
  // Галочки «у всех» нет — только пояснение.
  await expect(v.getByText("Чужое сообщение можно убрать только из своей переписки.")).toBeVisible();
  await expect(v.getByRole("checkbox", { name: /Удалить у всех/ })).toHaveCount(0);
  await v.getByRole("button", { name: "Удалить", exact: true }).click();
  await expect(messageText(v, "Спам от Бориса")).toHaveCount(0);

  // У автора и остальных сообщение осталось.
  const res = await alice.api.get(`/api/chats/${group.id}/messages`);
  expect(res.body.messages.some((m: any) => m.text === "Спам от Бориса" && !m.deleted)).toBe(true);
  await v.reload();
  await expect(messageText(v, "Не опаздывайте")).toBeVisible();
  await expect(messageText(v, "Спам от Бориса")).toHaveCount(0);
});
