// Чужой профиль: открытие по ссылке /u/<ник> и /@<ник>, из шапки лички; статус и
// музыка профиля, которые владелец ставит в настройках, а видят другие; QR-код профиля.
import { test, expect } from "../support/fixtures";
import { createDm, sendText } from "../../support/seed";
import { chatRow, composer, expectSignedIn, messageText, sendMessage } from "../support/ui";
import { chooseFile, profilePanel, silentWav, solidPng } from "./helpers";

test("профиль по ссылке /u/<ник>: данные человека и «Написать» начинает личку", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  expect((await boris.api.patch(`/api/users/${boris.id}`, { bio: "Играю на виолончели" })).status).toBe(200);

  // Алиса ещё не переписывалась с Борисом — открывает его ссылку.
  const a = (await openAs(alice.api, `/u/${boris.username}`)).page;
  const panel = profilePanel(a);
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Борис", { exact: true })).toBeVisible();
  await expect(panel.getByText(`@${boris.username}`)).toBeVisible();
  await expect(panel.getByText("Играю на виолончели")).toBeVisible();
  await expect(panel.getByRole("button", { name: /Добавить в контакты/ })).toBeVisible();

  await panel.getByRole("button", { name: "Написать", exact: true }).click();
  await expect(panel).toHaveCount(0);
  await expect(a).toHaveURL(/\/chat\//);
  await expect(a.getByRole("banner").getByText("Борис", { exact: true })).toBeVisible();
  await sendMessage(a, "Нашла тебя по ссылке");
  await expect(messageText(a, "Нашла тебя по ссылке")).toBeVisible();

  // Борис получает новую личку.
  const b = (await openAs(boris.api, "/")).page;
  await expect(chatRow(b, "Алиса", "Нашла тебя по ссылке")).toBeVisible();
});

test("ссылка /@<ник> при существующей личке открывает переписку и профиль; неизвестный ник — «Ничего не найдено»", async ({
  newUser,
  openAs,
}) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const chat = await createDm(alice, boris);
  await sendText(boris, chat.id, "Мы уже знакомы");

  const a = (await openAs(alice.api, `/@${boris.username}`)).page;
  await expect(a).toHaveURL(new RegExp(`/chat/${chat.id}$`));
  await expect(messageText(a, "Мы уже знакомы")).toBeVisible();
  await expect(profilePanel(a).getByText(`@${boris.username}`)).toBeVisible();

  await a.goto("/@nobody_such_user_e2e");
  await expect(a.getByText("Ничего не найдено", { exact: true })).toBeVisible();
  await expect(a.getByText("@nobody_such_user_e2e — такого аккаунта, бота или канала нет.")).toBeVisible();
  await a.getByRole("button", { name: "К чатам", exact: true }).click();
  await expectSignedIn(a);
  await expect(chatRow(a, "Борис", "Мы уже знакомы")).toBeVisible();
});

test("шапка лички открывает панель собеседника, из неё — полный профиль", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  expect((await boris.api.patch(`/api/users/${boris.id}`, { bio: "Люблю джаз" })).status).toBe(200);
  const chat = await createDm(alice, boris);
  await sendText(boris, chat.id, "Загляни в профиль");

  const a = (await openAs(alice.api, `/chat/${chat.id}`)).page;
  await expect(messageText(a, "Загляни в профиль")).toBeVisible();
  await a.getByRole("banner").getByRole("button", { name: /^(Б\s*)?Борис/ }).click();
  const info = profilePanel(a);
  await expect(info).toBeVisible();
  await expect(info.getByText(`@${boris.username}`)).toBeVisible();
  await expect(info.getByText("Люблю джаз")).toBeVisible();
  await expect(info.getByRole("button", { name: /Заблокировать/ })).toBeVisible();

  // Нажатие на аватар с именем в панели — полный профиль с действиями.
  await info.getByRole("button", { name: /^(Б\s*)?Борис/ }).first().click();
  await expect(a.getByRole("button", { name: /Поделиться контактом/ })).toBeVisible();
  await expect(a.getByRole("button", { name: /Отправить подарок/ }).first()).toBeVisible();
});

test("статус и музыка профиля из настроек видны другому в профиле", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");

  const a = (await openAs(alice.api, "/settings/profile")).page;

  // Статус: «Выбрать» → окно «Статус» → своё изображение.
  await a.getByRole("button", { name: "Выбрать", exact: true }).click();
  await expect(a.getByRole("heading", { name: "Статус", exact: true })).toBeVisible();
  await expect(a.getByText("Свои статусы — 0 из 1")).toBeVisible();
  await chooseFile(a, () => a.getByRole("button", { name: "Загрузить своё изображение" }).click(), {
    name: "звезда.png",
    mimeType: "image/png",
    buffer: solidPng(96, 96, [250, 200, 0]),
  });
  await expect(a.getByText("Свои статусы — 1 из 1")).toBeVisible();
  await expect(a.getByRole("button", { name: "Слотов больше нет (максимум 1)" })).toBeDisabled();
  await a.getByRole("button", { name: "Закрыть", exact: true }).click();
  await expect(a.getByRole("heading", { name: "Статус", exact: true })).toHaveCount(0);
  await expect(a.getByRole("button", { name: "Изменить", exact: true })).toBeVisible();

  // Музыка: «Загрузить треки» → аудиофайл → карточка трека в настройках.
  await chooseFile(a, () => a.getByRole("button", { name: "Загрузить треки" }).click(), {
    name: "Колыбельная.wav",
    mimeType: "audio/wav",
    buffer: silentWav(2),
  });
  await expect(a.getByText("основной", { exact: true })).toBeVisible();
  await expect(a.getByRole("button", { name: /Колыбельная/ }).first()).toBeVisible();

  // Борис открывает профиль Алисы по ссылке — видит значок статуса и трек.
  const b = (await openAs(boris.api, `/u/${alice.username}`)).page;
  const panel = profilePanel(b);
  await expect(panel.getByText("Алиса", { exact: true })).toBeVisible();
  // Значок статуса рядом с именем — кнопка, открывающая картинку статуса крупно.
  const badge = panel.getByRole("button", { name: "Статус", exact: true });
  await expect(badge).toBeVisible();
  const track = panel.getByRole("button", { name: /Колыбельная/ });
  await expect(track).toBeVisible();
  await expect(track.getByRole("button", { name: "Слушать" })).toBeVisible();

  // Нажатие на карточку — список треков.
  await track.click();
  await expect(b.getByRole("heading", { name: "Трек", exact: true })).toBeVisible();
  await expect(b.getByText("основной", { exact: true })).toBeVisible();
  await b.keyboard.press("Escape");
  await expect(b.getByRole("heading", { name: "Трек", exact: true })).toHaveCount(0);

  await badge.click();
  await expect(b.getByRole("button", { name: "Закрыть", exact: true })).toBeVisible();
});

test("QR-код профиля: ник, копирование ссылки; ссылка открывает профиль у другого", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");

  const s = await openAs(alice.api, "/settings");
  await s.context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const a = s.page;
  await a.getByRole("button", { name: "QR-код профиля" }).click();
  await expect(a.getByRole("heading", { name: "QR-код", exact: true })).toBeVisible();
  // TODO(a11y): у окна QR нет role="dialog", а сам код — SVG без подписи. Ник под кодом
  // ищем как последний такой текст (окно добавлено поверх страницы настроек, где ник тоже есть);
  // с ролью dialog — a.getByRole("dialog", { name: "QR-код" }).getByText(...).
  await expect(a.getByText(`@${alice.username}`, { exact: true }).last()).toBeVisible();
  await expect(a.getByRole("button", { name: "Отправить в чат" })).toBeVisible();

  await a.getByRole("button", { name: "Скопировать ссылку" }).click();
  await expect(a.getByText("Ссылка скопирована ✓")).toBeVisible();
  // Локальный адрес в ссылку не попадает — подставляется публичный сайт.
  const link = await a.evaluate(() => navigator.clipboard.readText());
  expect(link).toBe(`https://shalter.ru/u/${alice.username}`);

  await a.keyboard.press("Escape");
  await expect(a.getByRole("heading", { name: "QR-код", exact: true })).toHaveCount(0);

  // Тот же путь на этом сервере у Бориса — профиль Алисы.
  const b = (await openAs(boris.api, new URL(link).pathname)).page;
  await expect(profilePanel(b).getByText(`@${alice.username}`)).toBeVisible();
  await expect(profilePanel(b).getByText("Алиса", { exact: true })).toBeVisible();
  await expect(composer(b)).toHaveCount(0);
});
