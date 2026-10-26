// Карточка пользователя в «Настройки → Модерация» (главный админ): блокировка
// с причиной и разблокировка, метка безопасности и галочка верификации —
// и что при этом видят сам пользователь и его собеседники.
import { test, expect, person } from "./fixtures";
import { createDm, sendText } from "../../support/seed";
import { answerPrompt } from "./helpers";
import { chatRow, expectSignedIn, messageText, navLink } from "../support/ui";
import type { Page } from "@playwright/test";

/** «Модерация» → «Найти любой аккаунт» → карточка пользователя. */
async function openUserCard(page: Page, username: string, name: string) {
  await page.goto("/settings/moderation");
  // Разделы экрана — группы с именем по заголовку: «Открыть карточку» есть и у каждой открытой жалобы.
  const lookup = page.getByRole("group", { name: "Найти любой аккаунт" });
  await lookup.getByPlaceholder("@юзернейм, +7…, почта или id").fill(`@${username}`);
  await lookup.getByRole("button", { name: "Открыть карточку", exact: true }).click();
  await expect(page.getByRole("heading", { name: `Управление: ${name}` })).toBeVisible();
}

test("блокировка на 7 дней из карточки: у пользователя экран блокировки с причиной и сроком, «Назад» — выход; после разблокировки входит", async ({ newUser, openAs, admin, page }) => {
  const borisName = person("Борис");
  const boris = await newUser(borisName);
  const b = (await openAs(boris.api, "/")).page;
  await expectSignedIn(b);

  const adm = (await openAs(admin.api, "/settings")).page;
  // Админу виден раздел «Администрирование» с «Модерацией».
  await expect(adm.getByText("Администрирование", { exact: true })).toBeVisible();
  await openUserCard(adm, boris.username, borisName);
  await expect(adm.getByText("Заблокированный сможет войти, но вместо чатов увидит экран блокировки с причиной и сроком.")).toBeVisible();
  await adm.getByRole("button", { name: "7 дней", exact: true }).click();
  await answerPrompt(adm, new RegExp(`^Блокировка ${borisName}: 7 дней`), "Рассылка спама");
  await expect(adm.getByText(/Аккаунт заблокирован — пользователь уведомлён в чате с Shalter\./)).toBeVisible();
  await expect(adm.getByText(/^Заблокирован .* до .*\. Причина: Рассылка спама$/)).toBeVisible();
  await expect(adm.getByRole("button", { name: "Разблокировать", exact: true })).toBeVisible();

  // Открытое приложение Бориса закрывает экран блокировки: причина, срок, сколько осталось.
  const banScreen = (p: Page) => p.getByRole("alertdialog", { name: "Аккаунт заблокирован" });
  await expect(banScreen(b)).toBeVisible({ timeout: 30_000 });
  await expect(banScreen(b).getByText("Рассылка спама", { exact: true })).toBeVisible();
  await expect(banScreen(b).getByText(/^Заблокирован до /)).toBeVisible();
  await expect(banScreen(b).getByText(/^Осталось (6 дней 23 часа|7 дней)$/)).toBeVisible();
  // Чаты под экраном недоступны, и после перезагрузки — снова экран блокировки.
  await expect(navLink(b, "Чаты")).toHaveCount(0);
  await b.reload();
  await expect(banScreen(b)).toBeVisible();

  // Вход через форму пускает в аккаунт — и сразу экран блокировки.
  await page.goto("/");
  await page.getByPlaceholder("you@example.com").fill(boris.email);
  await page.getByPlaceholder("Пароль").fill(boris.password);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(banScreen(page)).toBeVisible();
  // «Назад» — выход из аккаунта на экран входа.
  await banScreen(page).getByRole("button", { name: "Назад" }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByPlaceholder("you@example.com")).toBeVisible();

  // В «Модерации» Борис в списке заблокированных со сроком; разблокировка из карточки.
  await adm.getByRole("button", { name: "Закрыть", exact: true }).click();
  await adm.reload();
  await expect(adm.getByRole("button", { name: new RegExp(`${borisName}.*до .*Рассылка спама`) })).toBeVisible();
  await openUserCard(adm, boris.username, borisName);
  await adm.getByRole("button", { name: "Разблокировать", exact: true }).click();
  await expect(adm.getByText(/Блокировка снята — пользователь уведомлён в чате с Shalter\./)).toBeVisible();

  // Теперь вход открывает чаты, а в служебном чате — уведомление о снятии блокировки.
  await page.getByPlaceholder("you@example.com").fill(boris.email);
  await page.getByPlaceholder("Пароль").fill(boris.password);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expectSignedIn(page);
  await chatRow(page, "Shalter").click();
  await expect(messageText(page, "Блокировка вашего аккаунта снята. Приносим извинения за неудобства.")).toBeVisible();
});

test("метка «СКАМ» и галочка верификации из карточки видны собеседнику в списке чатов и в шапке", async ({ newUser, openAs, admin }) => {
  const aliceName = person("Алиса");
  const borisName = person("Борис");
  const alice = await newUser(aliceName);
  const boris = await newUser(borisName);
  const chat = await createDm(boris, alice);
  await sendText(boris, chat.id, "Продаю дёшево");

  const a = (await openAs(alice.api, "/")).page;
  const row = chatRow(a, borisName, "Продаю дёшево");
  await expect(row).toBeVisible();
  await expect(row).not.toHaveAccessibleName(/СКАМ/);

  const adm = (await openAs(admin.api, "/settings")).page;
  await openUserCard(adm, boris.username, borisName);
  await adm.getByRole("button", { name: "Мошенничество", exact: true }).click();
  await expect(adm.getByText(/Метка установлена — она видна всем в профиле и в списке чатов\./)).toBeVisible();
  await adm.getByRole("button", { name: "Верифицировать", exact: true }).click();
  await expect(adm.getByText(/Аккаунт верифицирован — пользователь уведомлён\./)).toBeVisible();
  await expect(adm.getByRole("button", { name: "Снять галочку", exact: true })).toBeVisible();

  // Алиса после обновления видит метку в строке чата и в шапке переписки, рядом с галочкой.
  await a.reload();
  await expect(chatRow(a, borisName, "Продаю дёшево")).toHaveAccessibleName(/СКАМ/);
  await chatRow(a, borisName, "Продаю дёшево").click();
  const header = a.getByRole("banner");
  await expect(header.getByText("СКАМ", { exact: true })).toBeVisible();
  await expect(header.getByRole("img", { name: "Аккаунт подтверждён администрацией Shalter" })).toBeVisible();

  // Второе окно админа: в «Модерации» Борис в разделе «С метками безопасности».
  const list = (await openAs(admin.api, "/settings/moderation")).page;
  await expect(list.getByText(/^С метками безопасности \(\d+\)$/)).toBeVisible();
  await expect(list.getByRole("button", { name: new RegExp(`${borisName}\\s*СКАМ`) })).toBeVisible();

  // В той же открытой карточке — снять метку и галочку; у Алисы после обновления их больше нет.
  await adm.getByRole("button", { name: "Без метки", exact: true }).click();
  await expect(adm.getByText(/Метка снята\./)).toBeVisible();
  await adm.getByRole("button", { name: "Снять галочку", exact: true }).click();
  await expect(adm.getByText(/Галочка снята\./)).toBeVisible();
  await expect(adm.getByRole("button", { name: "Верифицировать", exact: true })).toBeVisible();
  await a.reload();
  await expect(a.getByRole("banner").getByText(borisName)).toBeVisible();
  await expect(a.getByRole("banner").getByText("СКАМ", { exact: true })).toHaveCount(0);
  await expect(a.getByRole("banner").getByRole("img", { name: "Аккаунт подтверждён администрацией Shalter" })).toHaveCount(0);
});

// Карточка из «Модерации» у уже верифицированного пользователя предлагает «Снять галочку»,
// и галочку оттуда можно снять.
test("повторно открытая карточка верифицированного пользователя предлагает «Снять галочку»", async ({ newUser, openAs, admin }) => {
  const borisName = person("Борис");
  const boris = await newUser(borisName);
  const res = await admin.api.post(`/api/admin/users/${boris.id}/verify`, { verified: true });
  expect(res.status, res.text).toBe(200);
  const adm = (await openAs(admin.api, "/settings")).page;
  await openUserCard(adm, boris.username, borisName);
  await expect(adm.getByText("верифицирован", { exact: true })).toBeVisible();
  await expect(adm.getByRole("button", { name: "Снять галочку", exact: true })).toBeVisible();
  await adm.getByRole("button", { name: "Снять галочку", exact: true }).click();
  await expect(adm.getByText(/Галочка снята\./)).toBeVisible();
  await expect.poll(async () => (await admin.api.get(`/api/users/${boris.id}`)).body.user.isVerified).toBeUndefined();
});
