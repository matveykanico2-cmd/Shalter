// Истории: публикация через редактор, живое появление у собеседника, просмотр,
// лайк, комментарий, ответ в личку, список просмотревших у автора и удаление.
//
// Просмотрщик истории сам листает дальше через ~5 с и закрывается на последней.
// Таймер стоит, пока открыта панель комментариев или «просмотров» либо фокус в поле
// ответа, — поэтому сразу после открытия сценарий открывает одну из панелей.
// (Пробел тоже ставит на паузу, но фокус после клика остаётся на кружке истории,
// и пробел открыл бы второй просмотрщик поверх первого.)
import { test, expect } from "../support/fixtures";
import { createDm, sendText } from "../../support/seed";
import { messageText } from "../support/ui";
import { chooseFile, confirmDialog, myStory, solidPng, storyItem } from "./helpers";
import type { Page } from "@playwright/test";
import type { TestUser } from "../support/fixtures";

/** «Выложить историю» → «История» → выбор фото → «Опубликовать историю» → редактор истории → «Готово». */
async function postStoryViaUi(page: Page) {
  await page.getByRole("button", { name: /Выложить историю$/ }).click();
  await chooseFile(page, () => page.getByTitle("История", { exact: true }).click(), { name: "закат.png", mimeType: "image/png", buffer: solidPng(120, 200) });
  await expect(page.getByText("Выбрано 1 файлов")).toBeVisible();
  await page.getByRole("button", { name: "Опубликовать историю", exact: true }).click();
  const done = page.getByRole("button", { name: "Готово", exact: true });
  await expect(done).toBeVisible();
  // Это редактор, а не мгновенная загрузка: можно «Пропустить» правки или добавить текст «Aa».
  await expect(page.getByRole("button", { name: "Пропустить", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Aa", exact: true })).toBeVisible();
  await done.click();
  await expect(done).toHaveCount(0);
}

async function storiesOf(viewer: TestUser, authorId: string): Promise<any[]> {
  const res = await viewer.api.get("/api/stories");
  return res.body.groups?.find((g: any) => g.user.id === authorId)?.stories ?? [];
}

test("история из редактора: живое появление у собеседника, лайк, комментарий, ответ в личку и просмотры у автора", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const chat = await createDm(alice, boris);
  await sendText(boris, chat.id, "Покажи, где ты");

  // Оба держат открытой переписку (полоса историй — над списком чатов слева).
  const a = (await openAs(alice.api, `/chat/${chat.id}`)).page;
  const b = (await openAs(boris.api, `/chat/${chat.id}`)).page;
  await expect(messageText(a, "Покажи, где ты")).toBeVisible();
  await expect(messageText(b, "Покажи, где ты")).toBeVisible();
  await expect(storyItem(b, "Алиса")).toHaveCount(0);

  await postStoryViaUi(a);

  // У Бориса кружок истории Алисы появляется сам, без перезагрузки.
  const aliceStory = storyItem(b, "Алиса");
  await expect(aliceStory).toBeVisible();
  await expect.poll(async () => (await storiesOf(boris, alice.id)).length).toBe(1);

  // Борис открывает историю: шапка с автором, картинка, поле ответа.
  await aliceStory.click();
  const reply = b.getByRole("textbox", { name: "Ответить Алиса…" });
  await expect(reply).toBeVisible();
  // Комментарии: панель останавливает автопролистывание.
  await b.getByRole("button", { name: "Комментарии", exact: true }).click();
  await expect(b.getByText("Пока нет комментариев")).toBeVisible();
  const commentBox = b.getByPlaceholder("Комментарий…");
  await commentBox.fill("Какой закат!");
  await commentBox.press("Enter");
  await expect(b.getByText("Какой закат!", { exact: true })).toBeVisible();
  await expect(b.getByText("Пока нет комментариев")).toHaveCount(0);

  // Лайк: после нажатия кнопка «Нравится» превращается в счётчик (подсказка «Убрать лайк»).
  await b.getByRole("button", { name: "Нравится", exact: true }).click();
  await expect(b.getByRole("button", { name: "Нравится", exact: true })).toHaveCount(0);
  await expect.poll(async () => (await storiesOf(boris, alice.id))[0]?.likeCount).toBe(1);

  await b.getByRole("button", { name: "Закрыть", exact: true }).click();
  await expect(reply).toHaveCount(0);

  // Ответ на историю уходит Алисе в личку. Фокус в поле ответа тоже держит историю.
  await aliceStory.click();
  await reply.click();
  await reply.fill("Хочу туда же");
  await reply.press("Enter");
  await expect(b.getByPlaceholder("Отправлено ✓")).toBeVisible();
  await expect(messageText(a, "Хочу туда же")).toBeVisible();
  await b.getByRole("button", { name: "Закрыть", exact: true }).click();

  // Автор после перезагрузки видит один просмотр, кто смотрел, лайк и комментарий.
  await a.reload();
  await a.getByRole("button", { name: /Моя история$/ }).click();
  const views = a.getByRole("button", { name: /1 просмотров/ });
  await expect(views).toBeVisible();
  await views.click();
  await expect(a.getByText("Смотрели", { exact: true })).toBeVisible();
  await expect(a.getByRole("button", { name: /Борис$/ }).last()).toBeVisible();
  // Своей истории лайкнуть нельзя — кнопки «Нравится» у автора нет.
  await expect(a.getByRole("button", { name: "Нравится", exact: true })).toHaveCount(0);
  await a.getByRole("button", { name: "Комментарии", exact: true }).click();
  await expect(a.getByText("Какой закат!", { exact: true })).toBeVisible();
  await expect(a.getByText("Смотрели", { exact: true })).toHaveCount(0);
});

test("удалённая автором история пропадает у собеседника без перезагрузки", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const chat = await createDm(alice, boris);
  await sendText(alice, chat.id, "Выложила историю");

  const a = (await openAs(alice.api, `/chat/${chat.id}`)).page;
  const b = (await openAs(boris.api, `/chat/${chat.id}`)).page;
  await expect(messageText(b, "Выложила историю")).toBeVisible();

  await postStoryViaUi(a);
  await expect(storyItem(b, "Алиса")).toBeVisible();

  // Автор: своя история → панель просмотров (пауза) → «Удалить» → подтверждение.
  await myStory(a).click();
  await a.getByRole("button", { name: /просмотров/ }).click();
  await expect(a.getByText("Пока никто не смотрел")).toBeVisible();
  await a.getByRole("button", { name: "Удалить", exact: true }).click();
  await confirmDialog(a, "Удалить историю?", /^(OK|Удалить)$/);
  await expect(a.getByRole("button", { name: /просмотров/ })).toHaveCount(0);

  await expect(storyItem(b, "Алиса")).toHaveCount(0);
  await expect.poll(async () => (await storiesOf(boris, alice.id)).length).toBe(0);
  await b.reload();
  await expect(messageText(b, "Выложила историю")).toBeVisible();
  await expect(storyItem(b, "Алиса")).toHaveCount(0);
});
