// Коллекционные юзернеймы: рынок (владелец выставляет свой @ник, другой покупает
// за звёзды) и аукцион (админ выставляет, участник ставит, админ завершает).
// Экран — «Настройки → Аукцион юзернеймов».
import { economyTest, expect, grantStars, starsBalance } from "./helpers";
import { uniq } from "../../support/seed";
import { chatRow } from "../support/ui";

const test = economyTest();

test("рынок: Борис выставляет свой юзернейм, Алиса покупает — ник и звёзды переходят", async ({ newUser, openAs, admin }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const handle = boris.username;
  await grantStars(admin, alice, 100);

  const b = (await openAs(boris.api, "/settings")).page;
  await b.getByRole("link", { name: "Аукцион юзернеймов", exact: true }).click();
  await expect(b.getByText("Рынок юзернеймов")).toBeVisible();
  // Цена на рынке в этом файле уникальна (43 ⭐): у карточки объявления нет роли и имени,
  // кнопку покупки находим по цене.
  await b.getByRole("spinbutton", { name: "Цена, ⭐" }).fill("43");
  await b.getByRole("button", { name: "Выставить", exact: true }).click();
  await expect(b.getByText("Объявление размещено")).toBeVisible();
  await expect(b.getByText(`@${handle}`, { exact: true })).toBeVisible();
  await expect(b.getByText("Ваше объявление")).toBeVisible();
  await expect(b.getByRole("button", { name: "Снять с продажи" })).toBeVisible();

  const a = (await openAs(alice.api, "/settings/usernames")).page;
  await expect(a.getByText(/^На балансе: 100/)).toBeVisible();
  await expect(a.getByText(`@${handle}`, { exact: true })).toBeVisible();
  await expect(a.getByText("Продавец: Борис")).toBeVisible();
  await a.getByRole("button", { name: "Купить за 43 ⭐" }).click();
  await expect(a.getByText(new RegExp(`^\\s*@${handle} теперь ваш$`))).toBeVisible();
  // И сообщение от Shalter вживую в списке чатов.
  await expect(chatRow(a, "Shalter", `Юзернейм @${handle} теперь ваш`)).toBeVisible();
  await expect(a.getByText(`@${handle}`, { exact: true })).toHaveCount(0);

  // У Алисы новый ник в настройках, звёзды — у Бориса.
  await a.goto("/settings");
  await expect(a.getByRole("button", { name: `@${handle} Имя пользователя` })).toBeVisible();
  expect(await starsBalance(alice)).toBe(57);
  expect(await starsBalance(boris)).toBe(43);

  // Борису приходит уведомление о продаже от Shalter.
  await b.goto("/");
  await expect(chatRow(b, "Shalter", `Ваш юзернейм @${handle} продан за 43`)).toBeVisible();
  await b.goto("/settings");
  await expect(b.getByRole("button", { name: `@${handle} Имя пользователя` })).toHaveCount(0);
});

test("аукцион: админ выставляет ник, участник ставит, админ завершает — ник у победителя", async ({ newUser, openAs, admin }) => {
  const alice = await newUser("Алиса");
  await grantStars(admin, alice, 20);
  const handle = uniq("auc");

  const ad = (await openAs(admin.api, "/settings/usernames")).page;
  await expect(ad.getByText("Выставить юзернейм")).toBeVisible();
  // TODO(a11y): поля без подписей; у «Выставить юзернейм» и «Выдать юзернейм напрямую»
  // одинаковые подсказки «юзернейм», а кнопок «Выставить» две (ещё «Продать свой»).
  // Отличаем по порядку: блок аукциона идёт после рынка и перед прямой выдачей.
  await ad.getByRole("textbox", { name: "юзернейм" }).first().fill(handle);
  await ad.getByRole("spinbutton", { name: "Старт, ⭐" }).fill("5");
  await ad.getByRole("spinbutton", { name: "Часов" }).fill("24");
  await ad.getByRole("button", { name: "Выставить", exact: true }).last().click();
  await expect(ad.getByText("Аукцион создан")).toBeVisible();
  await expect(ad.getByText(`@${handle}`, { exact: true })).toBeVisible();
  await expect(ad.getByText(/^Стартовая цена: 5.*ставок пока нет$/)).toBeVisible();

  const a = (await openAs(alice.api, "/settings/usernames")).page;
  await expect(a.getByText(`@${handle}`, { exact: true })).toBeVisible();
  await expect(a.getByText(/^осталось 2[34] ч/)).toBeVisible();
  // Обычному участнику кнопок админа нет.
  await expect(a.getByRole("button", { name: "Завершить сейчас" })).toHaveCount(0);
  await a.getByRole("button", { name: "Поставить" }).click();
  await expect(a.getByText("Ставка принята")).toBeVisible();
  await expect(a.getByText(/^Текущая ставка: 5.*Алиса \(это вы\)$/)).toBeVisible();
  await expect(a.getByText(/^Ваша ставка: 5/)).toBeVisible();
  // Звёзды до завершения не списываются.
  expect(await starsBalance(alice)).toBe(20);

  await ad.reload();
  await expect(ad.getByText(/^Текущая ставка: 5.*Алиса$/)).toBeVisible();
  await ad.getByRole("button", { name: "Завершить сейчас" }).click();
  await expect(ad.getByText("Аукцион завершён")).toBeVisible();
  await expect(ad.getByText("Завершённые")).toBeVisible();
  await expect(ad.getByText("продан", { exact: true })).toBeVisible();
  await expect(ad.getByText(/^Продан за 5/)).toBeVisible();

  // Победителю приходит сообщение о выигрыше, ник уже его.
  await a.goto("/");
  await expect(chatRow(a, "Shalter", `Вы выиграли аукцион: теперь ваш юзернейм @${handle}`)).toBeVisible();
  await a.goto("/settings");
  await expect(a.getByRole("button", { name: `@${handle} Имя пользователя` })).toBeVisible();
  expect(await starsBalance(alice)).toBe(15);
});
