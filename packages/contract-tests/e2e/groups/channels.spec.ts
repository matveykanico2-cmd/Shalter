// Каналы: пост приходит подписчику вживую, комментарии под постом, каталог
// публичных каналов с подпиской и отпиской.
import { test, expect } from "../support/fixtures";
import { createChannel, uniq } from "../../support/seed";
import { chatRow, composer, expectSignedIn, messageText, sendMessage } from "../support/ui";
import { menuItem, textOutsideButtons } from "./helpers";

test("пост владельца приходит подписчику вживую, подписчик комментирует — счётчик у автора", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const title = `Сводки ${Date.now()}`;
  const channel = await createChannel(alice, [boris], { title });

  const a = (await openAs(alice.api, `/chat/${channel.id}`)).page;
  const b = (await openAs(boris.api, `/chat/${channel.id}`)).page;
  await expect(composer(a)).toBeVisible();
  await expect(b.getByRole("button", { name: "ОТПИСАТЬСЯ" })).toBeVisible();

  // Пост из поля ввода — у подписчика без перезагрузки.
  await sendMessage(a, "Погода на выходные: солнце");
  await expect(messageText(b, "Погода на выходные: солнце")).toBeVisible();

  // Под постом — полоса «Комментарии»; Борис открывает ветку, она пуста.
  // Имя кнопки заканчивается стрелкой «›» (CSS ::after) — сверяем начало.
  await b.getByRole("button", { name: /^Комментарии/ }).click();
  await expect(b.getByRole("heading", { name: "Комментарии", exact: true })).toBeVisible();
  await expect(b.getByText("Комментариев пока нет — напишите первым")).toBeVisible();
  await expect(b.getByText("Комментарии (0)")).toBeVisible();

  // Комментарий из поля ввода ветки.
  await sendMessage(b, "Наконец-то!");
  await expect(b.getByText("Комментарии (1)")).toBeVisible();
  await expect(textOutsideButtons(b.getByRole("complementary"), "Наконец-то!")).toBeVisible();

  // У автора под постом счётчик комментариев; в ветке комментарий Бориса.
  const counter = a.getByRole("button", { name: /^1 комментарий(\s|$)/ });
  await expect(counter).toBeVisible();
  await counter.click();
  await expect(a.getByRole("heading", { name: "Комментарии", exact: true })).toBeVisible();
  await expect(textOutsideButtons(a.getByRole("complementary"), "Наконец-то!")).toBeVisible();
  await expect(a.getByRole("complementary").getByText("Борис", { exact: true })).toBeVisible();

  // После перезагрузки у подписчика и пост, и счётчик на месте.
  await b.reload();
  await expect(messageText(b, "Погода на выходные: солнце")).toBeVisible();
  await expect(b.getByRole("button", { name: /^1 комментарий(\s|$)/ })).toBeVisible();
});

test("каталог публичных каналов: поиск, подписка из каталога и отписка", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const tag = uniq("rx");
  const title = `Рецепты ${tag}`;
  const channel = await createChannel(alice, [], { title, isPublic: true, username: `${tag}food`, description: "Готовим дома" });
  const post = await alice.api.post(`/api/posts/${channel.id}/publish`, { text: "Борщ за 30 минут" });
  expect(post.status, post.text).toBe(200);

  const b = (await openAs(boris.api, "/")).page;
  await expectSignedIn(b);
  // Вход в каталог — из меню кнопки «Новый чат».
  await b.getByRole("button", { name: "Новый чат", exact: true }).click();
  await menuItem(b, "Публичные каналы").click();
  await expect(b).toHaveURL(/\/discover-channels$/);
  await expect(b.getByText("Публичные каналы", { exact: true })).toBeVisible();

  // Поиск по @юзернейму: строка канала с числом подписчиков.
  await b.getByPlaceholder("Поиск по названию или @юзернейму").fill(`${tag}food`);
  await expect(b.getByText(title, { exact: true })).toBeVisible();
  await expect(b.getByText(`@${tag}food · 1 подписчик`, { exact: true })).toBeVisible();
  // Поиск без совпадений.
  await b.getByPlaceholder("Поиск по названию или @юзернейму").fill(`${tag}nothing`);
  await expect(b.getByText("Ничего не найдено")).toBeVisible();

  // Подписка: открывается канал с постом, канал попадает в список чатов.
  await b.getByPlaceholder("Поиск по названию или @юзернейму").fill(title);
  await b.getByRole("button", { name: "Подписаться", exact: true }).click();
  await expect(b).toHaveURL(new RegExp(`/chat/${channel.id}$`));
  await expect(messageText(b, "Борщ за 30 минут")).toBeVisible();
  await expect(chatRow(b, title, "Борщ за 30 минут")).toBeVisible();
  await expect
    .poll(async () => (await alice.api.get(`/api/chats/${channel.id}`)).body.chat.memberIds)
    .toContain(boris.id);

  // Новый пост приходит подписчику вживую.
  await alice.api.post(`/api/posts/${channel.id}/publish`, { text: "Сырники к завтраку" });
  await expect(messageText(b, "Сырники к завтраку")).toBeVisible();

  // В каталоге канал теперь с кнопкой «Отписаться»; отписка с подтверждением.
  await b.goto(`/discover-channels?q=${encodeURIComponent(title)}`);
  await expect(b.getByText(`@${tag}food · 2 подписчика`, { exact: true })).toBeVisible();
  await b.getByRole("button", { name: "Отписаться", exact: true }).click();
  await expect(b.getByRole("heading", { name: `Отписаться от «${title}»?` })).toBeVisible();
  await b.getByRole("button", { name: "Отписаться", exact: true }).last().click();
  await expect(b.getByRole("button", { name: "Подписаться", exact: true })).toBeVisible();
  await expect(b.getByText(`@${tag}food · 1 подписчик`, { exact: true })).toBeVisible();
  await expect
    .poll(async () => (await alice.api.get(`/api/chats/${channel.id}`)).body.chat.memberIds)
    .not.toContain(boris.id);
});

// В каталоге «Публичные каналы» у канала, на который пользователь уже подписан,
// название и «@юзернейм · N подписчиков» видны рядом с кнопкой «Отписаться».
test("в каталоге у подписанного канала видны название и число подписчиков", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const tag = uniq("vis");
  const title = `Видимость ${tag}`;
  await createChannel(alice, [boris], { title, isPublic: true, username: `${tag}ch` });
  const b = (await openAs(boris.api, `/discover-channels?q=${encodeURIComponent(title)}`)).page;
  await expect(b.getByRole("button", { name: "Отписаться", exact: true })).toBeVisible();
  const row = b.getByRole("button", { name: new RegExp(`${title} @${tag}ch`) });
  await expect(row.getByText(title, { exact: true })).toBeVisible();
  await expect(row.getByText(`@${tag}ch · 2 подписчика`, { exact: true })).toBeVisible();
});
