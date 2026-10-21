// Закрепление сообщения: плашка закреплённого над перепиской у обоих, открепление.
import { test, expect } from "../support/fixtures";
import { createDm, sendText } from "../../support/seed";
import { messageText } from "../support/ui";
import { messageAction, menuItem } from "./helpers";

test("закрепить и открепить сообщение — плашка появляется и исчезает у собеседника", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const chat = await createDm(alice, boris);
  await sendText(alice, chat.id, "Адрес: ул. Ленина, 1");
  await sendText(boris, chat.id, "Спасибо!");

  const a = (await openAs(alice.api, `/chat/${chat.id}`)).page;
  const b = (await openAs(boris.api, `/chat/${chat.id}`)).page;
  await expect(messageText(a, "Спасибо!")).toBeVisible();
  await expect(messageText(b, "Спасибо!")).toBeVisible();
  // Пока ничего не закреплено — кнопки «Открепить» нет.
  await expect(b.getByRole("button", { name: "Открепить", exact: true })).toHaveCount(0);

  await messageAction(a, "Адрес: ул. Ленина, 1", "Закрепить");

  // Плашка закреплённого: кнопка с текстом сообщения и кнопка «Открепить» — у обоих.
  const pinnedA = a.getByRole("button", { name: "Адрес: ул. Ленина, 1" });
  await expect(pinnedA).toBeVisible();
  await expect(a.getByRole("button", { name: "Открепить", exact: true })).toBeVisible();
  await expect(b.getByRole("button", { name: "Открепить", exact: true })).toBeVisible();
  await expect(b.getByRole("button", { name: "Адрес: ул. Ленина, 1" })).toBeVisible();

  // В меню сообщения пункт сменился на «Открепить».
  await messageText(b, "Адрес: ул. Ленина, 1").click({ button: "right" });
  await expect(menuItem(b, "Открепить")).toBeVisible();
  await b.keyboard.press("Escape");

  // Закреп переживает перезагрузку.
  await b.reload();
  await expect(messageText(b, "Спасибо!")).toBeVisible();
  await expect(b.getByRole("button", { name: "Адрес: ул. Ленина, 1" })).toBeVisible();

  // Борис открепляет крестиком на плашке — у Алисы плашка пропадает вживую.
  await b.getByRole("button", { name: "Открепить", exact: true }).click();
  await expect(b.getByRole("button", { name: "Открепить", exact: true })).toHaveCount(0);
  await expect(a.getByRole("button", { name: "Открепить", exact: true })).toHaveCount(0);
  await expect(pinnedA).toHaveCount(0);
  // Само сообщение осталось.
  await expect(messageText(a, "Адрес: ул. Ленина, 1")).toBeVisible();
});
