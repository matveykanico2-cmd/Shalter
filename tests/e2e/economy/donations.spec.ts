// Подключённый донат-сервис (DonatePay: токен и страница в окружении): покупка
// рублями — это окно с кодом заказа и ссылкой на страницу доната. Страница
// указывает на 127.0.0.1:9 — ссылку тест не открывает, наружу ничего не уходит.
import { economyTest, expect } from "./helpers";

const PAGE = "http://127.0.0.1:9/donatepay-page";
const test = economyTest({ DONATEPAY_API_TOKEN: "test-token", DONATEPAY_PAGE_URL: PAGE });

test("покупка звёзд и Premium через DonatePay — окно с кодом и ссылкой на оплату", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const page = (await openAs(alice.api, "/settings/stars")).page;
  await expect(page.getByText(/^Баланс\s*0$/)).toBeVisible();
  await page.getByRole("button", { name: "+250 500 ₽" }).click();

  await expect(page.getByRole("heading", { name: "Оплата через DonatePay" })).toBeVisible();
  await expect(page.getByText(/Переведите 500₽ по ссылке ниже и обязательно укажите в сообщении к донату этот код/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Перейти к оплате" })).toHaveAttribute("href", PAGE);
  await expect(page.getByRole("button", { name: "Скопировать код" })).toBeVisible();
  await expect(page.getByText("Как только донат придёт — покупка активируется автоматически, обычно в течение минуты.")).toBeVisible();
  await page.getByRole("button", { name: "Готово" }).click();
  await expect(page.getByRole("heading", { name: "Оплата через DonatePay" })).toHaveCount(0);
  // Пока донат не пришёл — звёзд нет, админу заявка не пишется.
  await expect(page.getByText(/^Баланс\s*0$/)).toBeVisible();
  expect((await alice.api.get("/api/chats")).body.chats.filter((c: any) => c.type === "dm")).toHaveLength(0);

  await page.goto("/settings/premium");
  await page.getByRole("radio", { name: /3 месяца 249 ₽/ }).click();
  await page.getByRole("button", { name: "Подписаться за 249 ₽" }).click();
  await expect(page.getByRole("heading", { name: "Оплата через DonatePay" })).toBeVisible();
  await expect(page.getByText(/Переведите 249₽ по ссылке ниже/)).toBeVisible();
  await page.getByRole("button", { name: "Готово" }).click();
  expect((await alice.api.get("/api/premium/me")).body.isPremium).toBe(false);
});

test("админ: в «Донатах» DonatePay настроен, DonationAlerts — нет", async ({ openAs, admin }) => {
  const page = (await openAs(admin.api, "/settings/donations")).page;
  await expect(page.getByRole("heading", { name: "Донаты" }).first()).toBeVisible();
  await expect(page.getByText(/^Настроен/)).toBeVisible();
  await expect(page.getByText(/На сервере не заданы DONATIONALERTS_CLIENT_ID/)).toBeVisible();
  await expect(page.getByText(/На сервере не заданы DONATEPAY_API_TOKEN/)).toHaveCount(0);
});
