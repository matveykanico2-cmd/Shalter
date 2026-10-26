// Звёзды: баланс на экране «Звёзды», перевод другу, плата за сообщения от
// незнакомцев и покупка набора без платёжного сервиса (заявка админу в личку).
// Звёзды начисляет только главный админ — сервер поднят с ним (см. helpers.ts).
import { economyTest, expect, grantStars, starsBalance } from "./helpers";
import { createDm } from "../../support/seed";
import { chatRow, messageText } from "../support/ui";
import type { Page } from "@playwright/test";

const test = economyTest();

/** Строка «Баланс N» на экране «Звёзды» (подпись и число — соседние элементы). */
function balance(page: Page, n: number) {
  return page.getByText(new RegExp(`^Баланс\\s*${n}$`));
}

/** Поле сообщения в личке; у платной лички в имени ещё и цена («Сообщение · 25 ⭐»). */
function composerAny(page: Page) {
  return page.getByRole("textbox", { name: /^Сообщение/ });
}

test("баланс после начисления админом и перевод звёзд другу — у друга сообщение и новый баланс", async ({ newUser, openAs, admin }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  await grantStars(admin, alice, 300);

  const a = (await openAs(alice.api, "/settings")).page;
  // Начисление пришло сообщением от админа в личку.
  await expect(chatRow(a, "Админ", "Вам начислено 300 звёзд. Баланс: 300.")).toBeVisible();
  // Пункт меню с балансом справа.
  await a.getByRole("link", { name: "Звёзды 300", exact: true }).click();
  await expect(a.getByRole("heading", { name: "Звёзды" }).first()).toBeVisible();
  await expect(balance(a, 300)).toBeVisible();
  // Витрина наборов и цены действий.
  await expect(a.getByRole("button", { name: "+50 100 ₽" })).toBeVisible();
  await expect(a.getByText("Поднять своё сообщение")).toBeVisible();

  const b = (await openAs(boris.api, "/")).page;
  await expect(b.getByRole("navigation").getByRole("link", { name: "Чаты", exact: true })).toBeVisible();

  // Получатель ищется по имени или нику; выбираем его из подсказок.
  await a.getByRole("textbox", { name: "Имя или @ник" }).fill(boris.username);
  await a.getByRole("button", { name: `Борис · @${boris.username}` }).click();
  await expect(a.getByText("Получатель: Борис")).toBeVisible();
  await a.getByRole("spinbutton", { name: "Сколько ⭐" }).fill("120");
  await a.getByRole("button", { name: "Отправить", exact: true }).click();
  await expect(a.getByText(/Отправлено 120\s*— Борис/)).toBeVisible();
  await expect(balance(a, 180)).toBeVisible();

  // Борис видит перевод вживую — новая личка с Алисой в списке и сообщение в ней.
  const row = chatRow(b, "Алиса", "Перевод: 120");
  await expect(row).toBeVisible();
  await row.click();
  await expect(messageText(b, /Перевод: 120/)).toBeVisible();
  await b.goto("/settings/stars");
  await expect(balance(b, 120)).toBeVisible();

  // Баланс сохранён.
  await a.reload();
  await expect(balance(a, 180)).toBeVisible();
});

test("плата за сообщения: незнакомец видит цену, без звёзд не может написать, со звёздами — платит", async ({ newUser, openAs, admin }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");

  const a = (await openAs(alice.api, "/settings/stars")).page;
  await expect(balance(a, 0)).toBeVisible();
  const price = a.getByRole("spinbutton", { name: "Плата за сообщения мне" });
  await expect(price).toHaveValue("0");
  await price.fill("25");
  await a.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(a.getByText(/Незнакомцы платят 25\s*за сообщение/)).toBeVisible();
  await a.reload();
  await expect(price).toHaveValue("25");

  // Борис пишет Алисе впервые: цена в поле ввода и пояснение над ним.
  const chat = await createDm(boris, alice);
  const b = (await openAs(boris.api, `/chat/${chat.id}`)).page;
  await expect(b.getByRole("textbox", { name: "Сообщение · 25 ⭐" })).toBeVisible();
  await expect(b.getByText(/Этот пользователь принимает сообщения за 25\s*— спишется за каждое отправленное/)).toBeVisible();

  // Звёзд нет — сообщение не уходит, объясняется почему.
  await composerAny(b).fill("Можно вопрос?");
  await composerAny(b).press("Enter");
  await expect(b.getByText(/Этот пользователь берёт 25\s*за сообщение от незнакомых\. Не хватает звёзд\. С Premium писать можно бесплатно/)).toBeVisible();
  expect((await alice.api.get(`/api/chats/${chat.id}/messages`)).body.messages).toHaveLength(0);

  // Со звёздами — уходит, Алиса получает сообщение вживую и 25 звёзд.
  await grantStars(admin, boris, 30);
  const a2 = (await openAs(alice.api, `/chat/${chat.id}`)).page;
  await expect(composerAny(a2)).toBeVisible();
  await composerAny(b).fill("Можно вопрос? Плачу звёздами");
  await composerAny(b).press("Enter");
  await expect(messageText(b, "Можно вопрос? Плачу звёздами")).toBeVisible();
  await expect(messageText(a2, "Можно вопрос? Плачу звёздами")).toBeVisible();
  await expect.poll(() => starsBalance(boris)).toBe(5);
  await a.reload();
  await expect(balance(a, 25)).toBeVisible();
});

test("покупка набора без платёжного сервиса — заявка админу в личке, звёзды не начислены", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const a = (await openAs(alice.api, "/settings/stars")).page;
  await expect(balance(a, 0)).toBeVisible();
  await expect(a.getByText("Оплата переводом администрации — заявка создастся автоматически, звёзды придут после подтверждения.")).toBeVisible();

  await a.getByRole("button", { name: "+50 100 ₽" }).click();
  // Открывается личка с админом, где уже лежит заявка.
  await expect(a.getByRole("banner").getByText("Админ", { exact: true })).toBeVisible();
  await expect(messageText(a, /Хочу купить 50 звёзд за 100₽\. Перевожу на \+70000000951 и жду подтверждения/)).toBeVisible();
  await expect(chatRow(a, "Админ", "Хочу купить 50 звёзд")).toBeVisible();
  expect(await starsBalance(alice)).toBe(0);
});

test("админ: в «Донатах» видно, что платёжные сервисы не настроены", async ({ openAs, admin }) => {
  const page = (await openAs(admin.api, "/settings")).page;
  await page.getByRole("link", { name: "Донаты", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Донаты" }).first()).toBeVisible();
  await expect(page.getByText(/На сервере не заданы DONATIONALERTS_CLIENT_ID .* — без них подключение недоступно\./)).toBeVisible();
  await expect(page.getByText(/На сервере не заданы DONATEPAY_API_TOKEN \/ DONATEPAY_PAGE_URL — без них DonatePay недоступен/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Подключить DonationAlerts" })).toHaveCount(0);
});

// Пункт «Звёзды» в меню настроек показывает баланс справа.
test("баланс звёзд виден в меню настроек рядом с пунктом «Звёзды»", async ({ newUser, openAs, admin }) => {
  const alice = await newUser("Алиса");
  await grantStars(admin, alice, 77);
  const page = (await openAs(alice.api, "/settings")).page;
  await expect(page.getByRole("link", { name: "Звёзды 77" })).toBeVisible();
});
