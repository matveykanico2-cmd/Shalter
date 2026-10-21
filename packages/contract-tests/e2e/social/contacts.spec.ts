// Экран «Контакты»: добавление по юзернейму и по номеру, переименование «у себя»,
// удаление, поиск друзей по вставленным номерам. У свежего пользователя один контакт,
// поэтому кнопки строки («Переименовать у себя», «Удалить из контактов»…) однозначны.
// На устройствах с мышью эти кнопки появляются только при наведении на строку —
// поэтому перед нажатием сценарий наводит курсор на контакт (rowAction).
import { test, expect } from "../support/fixtures";
import { uniqPhone } from "../../support/seed";
import { expectSignedIn, navLink } from "../support/ui";
import { contactEntry, profilePanel, rowAction } from "./helpers";

test("добавить по юзернейму, переименовать у себя, удалить", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");

  const { page } = await openAs(alice.api, "/");
  await expectSignedIn(page);
  await navLink(page, "Контакты").click();
  await expect(page).toHaveURL(/\/contacts$/);
  await expect(page.getByText("Список контактов пуст")).toBeVisible();

  await page.getByRole("button", { name: "Добавить", exact: true }).click();
  await page.getByRole("button", { name: "По юзернейму", exact: true }).click();
  const search = page.getByPlaceholder("@юзернейм");
  // Себя добавить нельзя.
  await search.fill(`@${alice.username}`);
  await expect(page.getByText("Это вы", { exact: true })).toBeVisible();
  // Несуществующий ник.
  await search.fill("@no_such_e2e_user");
  await expect(page.getByText("Пользователь не найден")).toBeVisible();
  // Нашёлся Борис — строка-кандидат с его ником, нажатие добавляет.
  await search.fill(`@${boris.username}`);
  const candidate = page.getByRole("button", { name: new RegExp(`Борис\\s*@${boris.username}`) });
  await expect(candidate).toBeVisible();
  await candidate.click();

  await expect(page.getByText("Контакты — 1", { exact: true })).toBeVisible();
  await expect(contactEntry(page, "Борис")).toBeVisible();

  // Переименовать у себя: окно с полем, где уже выделено текущее имя.
  await rowAction(page, "Борис", "Переименовать у себя");
  await expect(page.getByRole("heading", { name: "Как записать Борис?" })).toBeVisible();
  await page.keyboard.type("Боря с работы");
  await page.getByRole("button", { name: "OK", exact: true }).click();
  await expect(contactEntry(page, "Боря с работы")).toBeVisible();

  // Своё имя для контакта сохраняется и видно в его профиле вместе с настоящим.
  await page.reload();
  await expect(contactEntry(page, "Боря с работы")).toBeVisible();
  await contactEntry(page, "Боря с работы").click();
  const panel = profilePanel(page);
  await expect(panel.getByText("Имя в профиле: Борис")).toBeVisible();
  await expect(panel.getByRole("button", { name: /Удалить из контактов/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);

  // Фильтр по имени.
  const filter = page.getByPlaceholder("Поиск по имени или номеру");
  await filter.fill("никого-такого");
  await expect(page.getByText("По запросу «никого-такого» никого нет")).toBeVisible();
  await filter.fill("боря");
  await expect(page.getByText("Найдено — 1", { exact: true })).toBeVisible();
  await filter.fill("");

  // Удаление — список снова пуст, и после перезагрузки тоже.
  await rowAction(page, "Боря с работы", "Удалить из контактов");
  await expect(page.getByText("Список контактов пуст")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Список контактов пуст")).toBeVisible();
  expect((await alice.api.get("/api/contacts")).body.contacts).toHaveLength(0);
});

test("добавить по номеру телефона с именем «как в телефонной книге»; незарегистрированный номер — приглашение", async ({
  newUser,
  openAs,
}) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");

  const { page } = await openAs(alice.api, "/contacts");
  await page.getByRole("button", { name: "Добавить", exact: true }).click();
  // Режим «По номеру» — по умолчанию.
  await expect(page.getByText(/Как в телефонной книге/)).toBeVisible();

  const phoneBox = page.getByPlaceholder("999 123 45 67");
  // Номер, на котором никого нет.
  const nobody = uniqPhone();
  await phoneBox.fill(nobody.slice(2));
  await page.getByRole("button", { name: "Найти", exact: true }).click();
  await expect(page.getByText(/никого нет в Shalter/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Пригласить в Shalter" })).toBeVisible();

  await page.getByPlaceholder("Имя (как записать у себя)").fill("Борис Сосед");
  await phoneBox.fill(boris.phone.slice(2));
  await page.getByRole("button", { name: "Найти", exact: true }).click();
  const candidate = page.getByRole("button", { name: new RegExp(`Борис.*@${boris.username}`) });
  await expect(candidate).toBeVisible();
  await candidate.click();

  await expect(page.getByText("Контакты — 1", { exact: true })).toBeVisible();
  await expect(contactEntry(page, "Борис Сосед")).toBeVisible();
  const saved = (await alice.api.get("/api/contacts")).body.contacts;
  expect(saved).toHaveLength(1);
  expect(saved[0].userId).toBe(boris.id);

  // Тот же номер второй раз — «Уже в контактах».
  await page.getByRole("button", { name: "Добавить", exact: true }).click();
  await page.getByPlaceholder("999 123 45 67").fill(boris.phone.slice(2));
  await page.getByRole("button", { name: "Найти", exact: true }).click();
  await expect(page.getByText("Уже в контактах", { exact: true })).toBeVisible();
});

test("друзья из контактов: вставленные номера — найденные сразу в контактах, остальных пригласить", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const stranger = uniqPhone();

  const { page } = await openAs(alice.api, "/contacts");
  await page.getByRole("button", { name: "Найти друзей из контактов", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Друзья из контактов" })).toBeVisible();
  await page.getByPlaceholder("+7 999 111-22-33").fill(`Боря ${boris.phone}\nНезнакомец ${stranger}`);
  await page.getByRole("button", { name: "Проверить эти номера" }).click();

  await expect(page.getByText(/^Проверено номеров: 2/)).toBeVisible();
  await expect(page.getByText("Уже в Shalter (1)")).toBeVisible();
  await expect(page.getByText("Пригласить (1)")).toBeVisible();
  await expect(page.getByText("добавлен ✓")).toBeVisible();
  await expect(page.getByRole("button", { name: "Пригласить", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();

  // Найденный уже в списке контактов — под именем из вставленного списка.
  await expect(page.getByText("Контакты — 1", { exact: true })).toBeVisible();
  await expect(contactEntry(page, "Боря").or(contactEntry(page, "Борис"))).toBeVisible();
  await expect.poll(async () => (await alice.api.get("/api/contacts")).body.contacts.map((c: any) => c.userId)).toEqual([boris.id]);
});

test("«Написать» из контактов открывает личку", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  expect((await alice.api.post("/api/contacts", { userId: boris.id })).status).toBe(200);

  const { page } = await openAs(alice.api, "/contacts");
  await expect(page.getByText("Контакты — 1", { exact: true })).toBeVisible();
  await rowAction(page, "Борис", "Написать");
  await expect(page).toHaveURL(/\/chat\//);
  await expect(page.getByRole("banner").getByText("Борис", { exact: true })).toBeVisible();
});
