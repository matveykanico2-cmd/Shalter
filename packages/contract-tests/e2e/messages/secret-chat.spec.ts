// Секретный чат: начинается из профиля собеседника, сообщения нельзя переслать
// или скопировать, а сам чат привязан к устройству.
import { test, expect, login } from "../support/fixtures";
import { createDm, sendText } from "../../support/seed";
import { chatRow, composer, expectSignedIn, messageText, sendMessage } from "../support/ui";
import { menuItem } from "./helpers";

test("секретный чат из профиля: переписка без пересылки и копирования, только на этом устройстве", async ({ newUser, openAs, baseUrl }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  // Обычная личка уже есть — секретный чат заводится отдельно от неё.
  const dm = await createDm(alice, boris);
  await sendText(boris, dm.id, "Обычная личка");

  // Профиль Бориса по его адресу /u/<username> → «Начать секретный чат» → подтверждение.
  const a = (await openAs(alice.api, `/u/${boris.username}`)).page;
  await a.getByRole("button", { name: "Начать секретный чат" }).click();
  await expect(a.getByRole("heading", { name: "Начать секретный чат с Борис?" })).toBeVisible();
  await a.getByRole("button", { name: "Начать", exact: true }).click();

  // Открылся новый чат (не обычная личка) с карточкой о секретном чате.
  // (адрес /u/… с уже существующей личкой сначала открывает её, поверх — профиль).
  await expect(a).toHaveURL(new RegExp(`/chat/(?!${dm.id}$)[^/]+$`));
  const secretId = new URL(a.url()).pathname.split("/").pop()!;
  await expect(messageText(a, "Алиса начал(а) секретный чат")).toBeVisible();
  await expect(messageText(a, "Сообщения нельзя переслать")).toBeVisible();
  await expect(composer(a)).toBeVisible();
  await sendMessage(a, "Это только между нами");
  await expect(messageText(a, "Это только между нами")).toBeVisible();

  // Борис открывает его на своём устройстве и видит сообщение.
  const b = (await openAs(boris.api, `/chat/${secretId}`)).page;
  await expect(messageText(b, "Это только между нами")).toBeVisible();
  await sendMessage(b, "Понял");
  await expect(messageText(a, "Понял")).toBeVisible();

  // В меню сообщения нет «Переслать» и «Копировать текст», но «Ответить» есть.
  await messageText(b, "Это только между нами").click({ button: "right" });
  await expect(menuItem(b, "Ответить")).toBeVisible();
  await expect(b.getByRole("button", { name: "Переслать", exact: true })).toHaveCount(0);
  await expect(b.getByRole("button", { name: "Копировать текст", exact: true })).toHaveCount(0);
  await b.keyboard.press("Escape");

  // Секретного чата нет среди целей пересылки из обычной лички.
  await b.goto(`/chat/${dm.id}`);
  await messageText(b, "Обычная личка").click({ button: "right" });
  await menuItem(b, "Переслать").click();
  await expect(b.getByRole("heading", { name: "Переслать сообщение" })).toBeVisible();
  // Обычная личка с Алисой в списке одна (секретная с тем же собеседником не предлагается).
  await expect(b.getByRole("button", { name: /^\S{1,2} Алиса$/ })).toHaveCount(1);
  await b.getByRole("button", { name: "Отмена", exact: true }).click();

  // С другого устройства Алисы секретного чата нет: в списке только обычная личка,
  // а прямая ссылка на секретный чат не открывает переписку.
  const otherDevice = await login(baseUrl, alice);
  const a2 = (await openAs(otherDevice, "/")).page;
  await expectSignedIn(a2);
  await expect(chatRow(a2, "Борис", "Обычная личка")).toBeVisible();
  await expect(chatRow(a2, "Борис", "Понял")).toHaveCount(0);
  await a2.goto(`/chat/${secretId}`);
  await expect(a2.getByText("Чат не найден")).toBeVisible();
  await expect(messageText(a2, "Это только между нами")).toHaveCount(0);
  await expect(composer(a2)).toHaveCount(0);
});
