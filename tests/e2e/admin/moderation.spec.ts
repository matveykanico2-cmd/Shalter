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
  await page.getByPlaceholder("@юзернейм, +7…, почта или id").fill(`@${username}`);
  // Первая кнопка «Открыть карточку» — у поля поиска; ниже такие же есть у каждой открытой жалобы.
  // TODO(a11y): одинаковые имена у кнопок разных разделов; различать по разделу, когда у них появятся роли region/группы.
  await page.getByRole("button", { name: "Открыть карточку", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: `Управление: ${name}` })).toBeVisible();
}

test("блокировка из карточки: пользователя выкидывает с причиной, вход по форме не пускает; после разблокировки входит", async ({ newUser, openAs, admin, page }) => {
  const borisName = person("Борис");
  const boris = await newUser(borisName);
  const b = (await openAs(boris.api, "/")).page;
  await expectSignedIn(b);

  const adm = (await openAs(admin.api, "/settings")).page;
  // Админу виден раздел «Администрирование» с «Модерацией».
  await expect(adm.getByText("Администрирование", { exact: true })).toBeVisible();
  await openUserCard(adm, boris.username, borisName);
  await expect(adm.getByText("Заблокированный аккаунт не сможет войти и увидит причину на экране входа.")).toBeVisible();
  await adm.getByRole("button", { name: "Заблокировать", exact: true }).click();
  await answerPrompt(adm, `Причина блокировки ${borisName}. Её увидит сам пользователь на экране входа.`, "Рассылка спама");
  await expect(adm.getByText(/Аккаунт заблокирован — пользователь уведомлён в чате с Shalter\./)).toBeVisible();
  await expect(adm.getByText(/^Заблокирован .*\. Причина: Рассылка спама$/)).toBeVisible();
  await expect(adm.getByRole("button", { name: "Разблокировать", exact: true })).toBeVisible();

  // Открытое приложение Бориса уходит на экран входа с причиной.
  await expect(b.getByText("Этот аккаунт заблокирован администрацией Shalter. Причина: Рассылка спама")).toBeVisible({ timeout: 30_000 });
  await expect(navLink(b, "Чаты")).toHaveCount(0);

  // Вход через форму не пускает и показывает причину.
  await page.goto("/");
  await page.getByPlaceholder("you@example.com").fill(boris.email);
  await page.getByPlaceholder("Пароль").fill(boris.password);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page.getByText("Аккаунт заблокирован администрацией Shalter. Причина: Рассылка спама")).toBeVisible();
  await expect(navLink(page, "Чаты")).toHaveCount(0);

  // В «Модерации» Борис в списке заблокированных; разблокировка из карточки.
  await adm.getByRole("button", { name: "Закрыть", exact: true }).click();
  await adm.reload();
  await expect(adm.getByRole("button", { name: new RegExp(`${borisName}.*Рассылка спама`) })).toBeVisible();
  await openUserCard(adm, boris.username, borisName);
  await adm.getByRole("button", { name: "Разблокировать", exact: true }).click();
  await expect(adm.getByText(/Блокировка снята — пользователь уведомлён в чате с Shalter\./)).toBeVisible();

  // Теперь вход проходит, а в служебном чате — уведомление о снятии блокировки.
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
  // TODO(a11y): галочка верификации — иконка с title без роли и имени; искать по роли img и имени, когда появятся.
  await expect(header.getByTitle("Аккаунт подтверждён администрацией Shalter")).toBeVisible();

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
  await expect(a.getByRole("banner").getByTitle("Аккаунт подтверждён администрацией Shalter")).toHaveCount(0);
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
