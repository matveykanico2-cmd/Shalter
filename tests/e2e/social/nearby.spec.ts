// «Люди рядом»: геолокация браузера подменена (permissions + setGeolocation).
// Сервер не ограничивает радиус, а список общий на всю базу воркера, поэтому
// сценарий проверяет конкретных людей по уникальным именам, а в конце перестаёт
// показывать обоих.
import { test, expect } from "../support/fixtures";
import { uniq } from "../../support/seed";
import { navLink } from "../support/ui";

// Москва: две точки примерно в 2,5 км друг от друга.
const HERE = { latitude: 55.75, longitude: 37.61 };
const NEAR = { latitude: 55.75, longitude: 37.65 };

test("двое делятся местоположением и видят друг друга с расстоянием диапазоном", async ({ newUser, openAs }) => {
  const aliceName = `Алиса ${uniq("n")}`;
  const borisName = `Борис ${uniq("n")}`;
  const alice = await newUser(aliceName);
  const boris = await newUser(borisName);

  const sa = await openAs(alice.api, "/contacts");
  await sa.context.grantPermissions(["geolocation"]);
  await sa.context.setGeolocation(HERE);
  const a = sa.page;
  // Вход — кнопка «Люди рядом» на экране контактов.
  await navLink(a, "Контакты").waitFor();
  await a.getByRole("button", { name: "Люди рядом", exact: true }).click();
  await expect(a).toHaveURL(/\/nearby$/);
  await expect(a.getByRole("heading", { name: "Люди рядом" })).toBeVisible();
  await expect(a.getByText(/Координаты огрубляются до примерно километра/)).toBeVisible();
  await a.getByRole("button", { name: "Показать, кто рядом" }).click();
  await expect(a.getByRole("button", { name: "Перестать показывать меня" })).toBeVisible();
  await expect(a.getByText(borisName, { exact: true })).toHaveCount(0);

  // Борис неподалёку тоже включает — и сразу видит Алису с диапазоном расстояния.
  const sb = await openAs(boris.api, "/nearby");
  await sb.context.grantPermissions(["geolocation"]);
  await sb.context.setGeolocation(NEAR);
  const b = sb.page;
  await b.getByRole("button", { name: "Показать, кто рядом" }).click();
  await expect(b.getByText(aliceName, { exact: true })).toBeVisible();
  await expect(b.getByText("1–3 км", { exact: true })).toBeVisible();

  // Список Алисы обновляется при следующем изменении её местоположения.
  await sa.context.setGeolocation({ latitude: HERE.latitude + 0.001, longitude: HERE.longitude });
  await expect(a.getByText(borisName, { exact: true })).toBeVisible();
  await expect(a.getByText("1–3 км", { exact: true })).toBeVisible();

  // Борис перестаёт показываться — при следующем обновлении Алиса его больше не видит.
  await b.getByRole("button", { name: "Перестать показывать меня" }).click();
  await expect(b.getByRole("button", { name: "Показать, кто рядом" })).toBeVisible();
  await expect(b.getByText(aliceName, { exact: true })).toHaveCount(0);
  await sa.context.setGeolocation(HERE);
  await expect(a.getByText(borisName, { exact: true })).toHaveCount(0);

  await a.getByRole("button", { name: "Перестать показывать меня" }).click();
  await expect(a.getByRole("button", { name: "Показать, кто рядом" })).toBeVisible();
});
