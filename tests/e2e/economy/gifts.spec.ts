// Подарки: магазин «Отправить подарок» из профиля собеседника, сообщение-подарок
// у обоих, карточка подарка и полка в профиле получателя; анонимный подарок с Premium.
//
// renderGiftArt (public/js/lib/giftTraits.js) возвращает узел синхронно: вызывающие
// кладут его прямо в el(). Когда в b8b7e505 она стала async, весь интерфейс подарков
// падал (пустой магазин, чат с подарком не открывался, «Нет связи с сервером»).
import { economyTest, expect, grantStars, registerPremiumUser, starsBalance } from "./helpers";
import { createDm, sendText } from "../../support/seed";
import { chatRow, messageText } from "../support/ui";
import type { Page } from "@playwright/test";

const test = economyTest();

function shop(page: Page) {
  return page.getByRole("dialog", { name: "Отправить подарок" });
}

/** Открыть магазин подарков из панели «Профиль» лички (шапка чата → «Отправить подарок»). */
async function openShopFromChat(page: Page, peerName: string) {
  await page.getByRole("banner").getByRole("button", { name: new RegExp(peerName) }).click();
  await page.getByRole("complementary").getByRole("button", { name: "Отправить подарок" }).click();
  await expect(shop(page).getByRole("heading", { name: "Отправить подарок" })).toBeVisible();
}

test("подарок другу: отправитель в чате с подарком, получатель видит его вживую, в карточке и на полке профиля", async ({ newUser, openAs, admin }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  await grantStars(admin, alice, 300);
  const chat = await createDm(alice, boris);
  await sendText(alice, chat.id, "Привет");

  const a = (await openAs(alice.api, `/chat/${chat.id}`)).page;
  const b = (await openAs(boris.api, `/chat/${chat.id}`)).page;
  await expect(messageText(b, "Привет")).toBeVisible();

  await openShopFromChat(a, "Борис");
  const s = shop(a);
  await expect(s.getByRole("button", { name: "Баланс ⭐ 300" })).toBeVisible();
  await expect(s.getByText("Борис получит подарок в профиль, а в вашем чате появится сообщение о нём.")).toBeVisible();
  await expect(s.getByRole("tab", { name: "Все" })).toHaveAttribute("aria-selected", "true");
  await s.getByRole("button", { name: "Торт", exact: true }).click();

  // Страница отправки: превью сообщения, подпись, анонимность только с Premium.
  await expect(s.getByText(/^Вы отправили подарок за 250/)).toBeVisible();
  await expect(s.getByText("Борис сможет показать этот подарок в своём профиле.")).toBeVisible();
  await expect(s.getByRole("checkbox", { name: "Скрыть моё имя" })).toBeDisabled();
  await expect(s.getByText("Анонимные подарки доступны с Premium.")).toBeVisible();
  await s.getByRole("textbox", { name: "Сообщение к подарку" }).fill("С днём рождения!");
  await s.getByRole("button", { name: "Отправить подарок за ⭐ 250" }).click();

  await expect(a.getByText("«Торт» отправлен — Борис")).toBeVisible();
  await expect(shop(a)).toHaveCount(0);
  await expect(a.getByText(/^Вы отправили подарок за 250/)).toBeVisible();
  await expect(a.getByText("С днём рождения!")).toBeVisible();
  expect(await starsBalance(alice)).toBe(50);

  // Получатель — вживую, с кнопкой обмена на звёзды.
  await expect(b.getByText(/^Алиса отправил\(а\) вам подарок за 250/)).toBeVisible();
  await expect(b.getByText("С днём рождения!")).toBeVisible();
  await expect(b.getByRole("button", { name: "Обменять на 250 ⭐" })).toBeVisible();

  // Карточка подарка.
  await b.getByRole("button", { name: "Посмотреть" }).click();
  await expect(b.getByText("Владелец")).toBeVisible();
  await expect(b.getByText("От кого")).toBeVisible();
  await expect(b.getByText("Сообщение", { exact: true })).toBeVisible();
  await expect(b.getByRole("button", { name: "Отправить такой же" })).toBeVisible();
  await b.getByRole("button", { name: "Закрыть", exact: true }).click();

  // Полка в профиле получателя переживает перезагрузку.
  await b.goto("/settings");
  await b.getByRole("button", { name: "Мой профиль" }).click();
  await b.getByRole("button", { name: "Подарки", exact: true }).click();
  await expect(b.getByRole("button", { name: "Торт", exact: true })).toBeVisible();
});

test("анонимный подарок с Premium: имя скрыто у получателя, подарок объявляет Shalter", async ({ newUser, openAs, admin, server }) => {
  const vera = await registerPremiumUser(server.baseUrl, "Вера");
  const boris = await newUser("Борис");
  await grantStars(admin, vera, 100);
  const chat = await createDm(vera, boris);
  await sendText(vera, chat.id, "Привет");

  const v = (await openAs(vera.api, `/chat/${chat.id}`)).page;
  const b = (await openAs(boris.api, "/")).page;
  await expect(chatRow(b, "Вера", "Привет")).toBeVisible();

  await openShopFromChat(v, "Борис");
  const s = shop(v);
  await s.getByRole("button", { name: "Роза", exact: true }).click();
  const anon = s.getByRole("checkbox", { name: "Скрыть моё имя" });
  await expect(anon).toBeEnabled();
  await expect(s.getByText("Борис и посетители профиля не увидят, от кого этот подарок.")).toBeVisible();
  await anon.check({ force: true });
  await expect(s.getByText(/Подарок от\s*Аноним/)).toBeVisible();
  await s.getByRole("button", { name: "Отправить подарок за ⭐ 10" }).click();
  await expect(v.getByText("«Роза» отправлен — Борис")).toBeVisible();

  // Получателю подарок приходит от Shalter, имени дарителя нет.
  const row = chatRow(b, "Shalter", "Роза");
  await expect(row).toBeVisible();
  await row.click();
  await expect(b.getByText(/^Вам анонимно подарили подарок за 10/)).toBeVisible();
  await expect(b.getByRole("banner").getByText("Shalter", { exact: true })).toBeVisible();
  await expect(b.getByText(/Подарок от\s*Аноним/)).toBeVisible();
});

// Запись «🎁 Вы отправили анонимный подарок: …» в общей личке дарителя и
// получателя видна только отправителю (visibleToId) — получатель видит лишь
// объявление от Shalter.
test("анонимный подарок не появляется у получателя в личке с дарителем", async ({ newUser, openAs, admin, server }) => {
  const vera = await registerPremiumUser(server.baseUrl, "Вера");
  const boris = await newUser("Борис");
  await grantStars(admin, vera, 100);
  const chat = await createDm(vera, boris);
  await sendText(vera, chat.id, "Привет");

  const v = (await openAs(vera.api, `/chat/${chat.id}`)).page;
  const b = (await openAs(boris.api, `/chat/${chat.id}`)).page;
  await expect(messageText(b, "Привет")).toBeVisible();
  await openShopFromChat(v, "Борис");
  await shop(v).getByRole("button", { name: "Роза", exact: true }).click();
  await shop(v).getByRole("checkbox", { name: "Скрыть моё имя" }).check({ force: true });
  await shop(v).getByRole("button", { name: "Отправить подарок за ⭐ 10" }).click();
  // Отправитель видит свою запись в личке…
  await expect(v.getByText(/Вы отправили анонимный подарок|Вы отправили подарок/).first()).toBeVisible();
  // …а получатель — только объявление от Shalter, не в личке с Верой.
  await expect(chatRow(b, "Shalter", "Роза")).toBeVisible();
  await expect(b.getByText(/подарили подарок|отправил\(а\) вам подарок/)).toHaveCount(0);
  await expect(chatRow(b, "Вера", "Привет")).toBeVisible();
});

test("не хватает звёзд на подарок — предупреждение и предложение купить звёзды", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const chat = await createDm(alice, boris);
  await sendText(alice, chat.id, "Привет");

  const a = (await openAs(alice.api, `/chat/${chat.id}`)).page;
  await openShopFromChat(a, "Борис");
  const s = shop(a);
  await expect(s.getByRole("button", { name: "Баланс ⭐ 0" })).toBeVisible();
  await s.getByRole("button", { name: "Сердце", exact: true }).click();
  await expect(s.getByText(/^Не хватает 100\s*— при отправке предложим докупить\.$/)).toBeVisible();
  await s.getByRole("button", { name: "Отправить подарок за ⭐ 100" }).click();
  await expect(a.getByRole("heading", { name: /Не хватает звёзд.*Открыть покупку звёзд\?/ })).toBeVisible();
  await a.getByRole("button", { name: "OK", exact: true }).click();
  await expect(a.getByText("Купить звёзды")).toBeVisible();
  expect((await boris.api.get("/api/auth/session")).body.user.giftsReceived).toEqual([]);
});

test("встроенная сцена подарка грузится отдельным файлом только для показанных подарков", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const chat = await createDm(alice, boris);
  await sendText(alice, chat.id, "Привет");

  const { page } = await openAs(alice.api, `/chat/${chat.id}`);
  const sceneRequests: string[] = [];
  page.on("request", (req) => {
    const { pathname } = new URL(req.url());
    if (pathname.startsWith("/gift-scenes/") || pathname.includes("giftTraits.scenes")) sceneRequests.push(pathname);
  });
  await openShopFromChat(page, "Борис");

  // «Утёнок на отдыхе» своей анимации не имеет — рисуется встроенной сценой (SVG).
  const duck = shop(page).getByRole("button", { name: "Утёнок на отдыхе", exact: true });
  await expect(duck.locator("svg.ce-scene")).toBeVisible();

  expect(sceneRequests).toContain("/gift-scenes/index.json");
  expect(sceneRequests).toContain("/gift-scenes/tw_duck_vacation.json");
  // Подарки с анимацией (Торт) сцену не запрашивают; старого модуля всех сцен больше нет.
  expect(sceneRequests).not.toContain("/gift-scenes/cake.json");
  expect(sceneRequests.some((p) => p.includes("giftTraits.scenes"))).toBe(false);
});
