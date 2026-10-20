// Shalter Premium: экран подписки, карусель возможностей, покупка за звёзды и
// что Premium видимо открывает (цвет имени, бесплатная платная личка). Оплата
// рублями без платёжного сервиса — это заявка админу в личку.
import { economyTest, expect, grantStars, registerPremiumUser, starsBalance } from "./helpers";
import { createDm } from "../../support/seed";
import { composer, messageText } from "../support/ui";

const test = economyTest();

test("покупка Premium за звёзды: экран меняется, открывается цвет имени, срок сохраняется", async ({ newUser, openAs, admin }) => {
  const alice = await newUser("Алиса");
  await grantStars(admin, alice, 450);

  const page = (await openAs(alice.api, "/settings/profile")).page;
  // Без Premium цвет имени закрыт.
  await expect(page.getByText("Выбирать цвет имени можно с Shalter Premium.")).toBeVisible();
  await page.getByRole("button", { name: "Красный — с Premium" }).click();
  await expect(page.getByText("Цвет имени — возможность Shalter Premium")).toBeVisible();

  await page.goto("/settings");
  await page.getByRole("link", { name: "Shalter Premium", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Shalter Premium" }).last()).toBeVisible();
  await expect(page.getByText("Выберите срок")).toBeVisible();
  // Выбран самый выгодный тариф; кнопки — рублями и звёздами.
  await expect(page.getByRole("radio", { name: /12 месяцев/ })).toBeChecked();
  await expect(page.getByRole("button", { name: "Подписаться за 799 ₽" })).toBeVisible();
  await page.getByRole("radio", { name: /^1 месяц/ }).click();
  await expect(page.getByRole("radio", { name: /^1 месяц/ })).toBeChecked();
  await expect(page.getByRole("button", { name: "Подписаться за 99 ₽" })).toBeVisible();
  await page.getByRole("radio", { name: /12 месяцев/ }).click();
  const byStars = page.getByRole("button", { name: "Или за 400 ⭐ (у вас 450)" });
  await expect(byStars).toBeEnabled();
  await byStars.click();

  // Квитанция приходит в «Избранное» — туда же переходит приложение.
  await expect(page.getByRole("banner").getByText("Избранное", { exact: true })).toBeVisible();
  await expect(messageText(page, /Вам выдан Shalter Premium на 12 месяцев за 400/)).toBeVisible();

  await page.goto("/settings/premium");
  await expect(page.getByRole("heading", { name: "У вас Shalter Premium" })).toBeVisible();
  await expect(page.getByText(/^Активен до \d{2}\.\d{2}\.\d{4}$/)).toBeVisible();
  await expect(page.getByText("Продлить Premium")).toBeVisible();
  await expect(page.getByRole("button", { name: "Продлить за 799 ₽" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Не хватает звёзд: нужно 400 ⭐ , у вас 50" })).toBeDisabled();
  expect(await starsBalance(alice)).toBe(50);

  await page.reload();
  await expect(page.getByRole("heading", { name: "У вас Shalter Premium" })).toBeVisible();

  // Цвет имени теперь доступен и сохраняется.
  await page.goto("/settings/profile");
  await expect(page.getByText("Цвет имени видят все участники групп.")).toBeVisible();
  await page.getByRole("button", { name: "Синий", exact: true }).click();
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect.poll(async () => (await alice.api.get("/api/auth/session")).body.user.nameColor).toBeTruthy();
});

test("карусель «Что даёт Premium» и подписка рублями — заявка админу в личке", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const page = (await openAs(alice.api, "/settings/premium")).page;
  await expect(page.getByText("Что даёт Premium")).toBeVisible();
  await expect(page.getByText("Оплата переводом администрации Shalter. Автопродления нет — срок просто закончится сам.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Не хватает звёзд: нужно 400 ⭐ , у вас 0" })).toBeDisabled();
  await page.getByRole("radio", { name: /^1 месяц/ }).click();
  await expect(page.getByRole("button", { name: "Не хватает звёзд: нужно 50 ⭐ , у вас 0" })).toBeDisabled();

  // Нажатие на возможность открывает карусель на ней.
  await page.getByRole("button", { name: /^Значок Premium Звезда у имени/ }).click();
  await expect(page.getByRole("heading", { name: "Значок Premium", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Дальше" })).toBeVisible();
  await page.getByRole("button", { name: "Подписаться на Shalter Premium" }).click();

  // Подписка без платёжного сервиса — заявка уходит админу, Premium не выдан.
  await expect(messageText(page, /Хочу оформить Shalter Premium на 1 месяц за 99₽\. Перевожу на \+70000000951/)).toBeVisible();
  expect((await alice.api.get("/api/premium/me")).body.isPremium).toBe(false);
});

test("с Premium: экран «У вас Premium», в карусели «Понятно», платная личка — бесплатно", async ({ newUser, openAs, server }) => {
  const vera = await registerPremiumUser(server.baseUrl, "Вера");
  const alice = await newUser("Алиса");
  await alice.api.post("/api/stars/price", { stars: 25 });

  const page = (await openAs(vera.api, "/settings/premium")).page;
  await expect(page.getByRole("heading", { name: "У вас Shalter Premium" })).toBeVisible();
  await page.getByRole("button", { name: /^Цвет имени Выберите цвет/ }).click();
  await expect(page.getByRole("button", { name: "Понятно" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Подписаться на Shalter Premium" })).toHaveCount(0);
  await page.getByRole("button", { name: "Понятно" }).click();
  await expect(page.getByRole("button", { name: "Понятно" })).toHaveCount(0);

  // Алиса берёт 25 ⭐ за сообщения от незнакомых, но Premium пишет без цены и бесплатно.
  const chat = await createDm(vera, alice);
  await page.goto(`/chat/${chat.id}`);
  await expect(composer(page)).toBeVisible();
  await expect(page.getByText(/Этот пользователь принимает сообщения за/)).toHaveCount(0);
  await composer(page).fill("Привет от Premium");
  await composer(page).press("Enter");
  const a = (await openAs(alice.api, `/chat/${chat.id}`)).page;
  await expect(messageText(a, "Привет от Premium")).toBeVisible();
  expect(await starsBalance(alice)).toBe(0);
});
