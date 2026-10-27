// Превью ссылки в сообщении: сервер сам открывает страницу и достаёт og-теги,
// карточка появляется у обоих собеседников без перезагрузки.
// «Сайт» — локальная заглушка за прокси (фикстура egress, support/egress.ts): в интернет тест не ходит.
import { test, expect } from "../support/fixtures";
import { createDm, sendText } from "../../support/seed";
import { messageText, sendMessage } from "../support/ui";
import { html, PUBLIC_HOST } from "../support/egress";

test("ссылка в сообщении превращается в карточку с заголовком, описанием и сайтом", async ({ newUser, openAs, egress }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const chat = await createDm(alice, boris);
  await sendText(boris, chat.id, "Скинь статью");
  egress.routes.set(
    "/pelmeni",
    html(`<!doctype html><html><head>
      <meta property="og:title" content="Как лепить пельмени">
      <meta property="og:description" content="Пошаговый рецепт с фотографиями">
      <meta property="og:site_name" content="Кулинарный блог">
    </head><body><p>Текст</p></body></html>`)
  );
  const url = `http://${PUBLIC_HOST}/pelmeni`;

  const a = (await openAs(alice.api, `/chat/${chat.id}`)).page;
  const b = (await openAs(boris.api, `/chat/${chat.id}`)).page;
  await expect(messageText(a, "Скинь статью")).toBeVisible();
  await expect(messageText(b, "Скинь статью")).toBeVisible();

  await sendMessage(a, `Вот: ${url}`);
  // Ссылка в тексте — кликабельная.
  await expect(b.getByRole("link", { name: url })).toBeVisible();

  // Карточка-кнопка: предупреждение про http, заголовок, описание, название сайта.
  for (const p of [a, b]) {
    const card = p.getByRole("button", { name: /Как лепить пельмени/ });
    await expect(card).toBeVisible();
    await expect(card).toHaveAccessibleName(/Небезопасное соединение \(не https\)/);
    await expect(card).toHaveAccessibleName(/Пошаговый рецепт с фотографиями/);
    await expect(card).toHaveAccessibleName(/Кулинарный блог/);
  }
  expect(egress.hits).toContain("/pelmeni");

  // Превью сохранено с сообщением.
  await b.reload();
  await expect(messageText(b, "Скинь статью")).toBeVisible();
  await expect(b.getByRole("button", { name: /Как лепить пельмени/ })).toBeVisible();
});
