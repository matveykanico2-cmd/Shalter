// Выход из группы и удаление: участник покидает группу через меню чата,
// владелец удаляет группу у всех — у участника она пропадает вживую.
import { test, expect } from "../support/fixtures";
import { createChannel, createGroup, sendText } from "../../support/seed";
import { chatRow, expectSignedIn, messageText } from "../support/ui";
import { chatMenu } from "./helpers";

test("участник покидает группу: группа уходит из его списка, остальные видят служебное сообщение", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const title = `Дача ${Date.now()}`;
  const group = await createGroup(alice, [boris], { title });
  await sendText(alice, group.id, "Кто едет?");

  const a = (await openAs(alice.api, `/chat/${group.id}`)).page;
  const b = (await openAs(boris.api, `/chat/${group.id}`)).page;
  await expect(messageText(b, "Кто едет?")).toBeVisible();
  await expect(a.getByRole("banner").getByText(/^2 участника/)).toBeVisible();

  await chatMenu(b, "Группа: выйти или удалить");
  // Не админ: «удалить у себя» (останется участником) или «Покинуть группу».
  await expect(b.getByRole("heading", { name: "Удалить группу" })).toBeVisible();
  await expect(b.getByText(`Удалить группу «${title}» из списка чатов? Вы останетесь участником`)).toBeVisible();
  await b.getByRole("button", { name: "Покинуть группу" }).click();

  // Бориса возвращает к списку чатов, группы в нём нет.
  await expect(b).toHaveURL(/\/$/);
  await expectSignedIn(b);
  await expect(chatRow(b, title)).toHaveCount(0);

  // Алиса видит служебное сообщение без перезагрузки; число участников в шапке
  // обновляется при следующей загрузке чата.
  await expect(messageText(a, "Борис покинул(а) группу")).toBeVisible();
  await a.reload();
  await expect(a.getByRole("banner").getByText(/^1 участник/)).toBeVisible();

  // После перезагрузки группа к Борису не возвращается.
  await b.reload();
  await expectSignedIn(b);
  await expect(chatRow(b, title)).toHaveCount(0);
  const chats = (await boris.api.get("/api/chats")).body.chats;
  expect(chats.some((c: any) => c.id === group.id)).toBe(false);
});

test("владелец удаляет группу для всех — у участника она пропадает без перезагрузки", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const title = `Временная ${Date.now()}`;
  const group = await createGroup(alice, [boris], { title });
  await sendText(alice, group.id, "Скоро удалю");

  const a = (await openAs(alice.api, `/chat/${group.id}`)).page;
  const b = (await openAs(boris.api, "/")).page;
  await expect(chatRow(b, title, "Скоро удалю")).toBeVisible();
  await expect(messageText(a, "Скоро удалю")).toBeVisible();

  await chatMenu(a, "Группа: выйти или удалить");
  await expect(a.getByRole("heading", { name: "Удалить группу" })).toBeVisible();
  await expect(a.getByText(`Удалить группу «${title}»?`, { exact: true })).toBeVisible();
  // Владелец может и просто выйти, но здесь — удалить у всех.
  await expect(a.getByRole("button", { name: "Покинуть группу" })).toBeVisible();
  await a.getByRole("checkbox", { name: "Удалить для всех участников" }).check();
  await a.getByRole("button", { name: "Удалить", exact: true }).click();

  await expect(a).toHaveURL(/\/$/);
  await expect(chatRow(a, title)).toHaveCount(0);
  await expect(chatRow(b, title)).toHaveCount(0);

  // Группы больше нет и на сервере.
  expect((await boris.api.get(`/api/chats/${group.id}`)).status).not.toBe(200);
});

test("подписчик отписывается от закрытого канала кнопкой «ОТПИСАТЬСЯ» с подтверждением", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const title = `Закрытый ${Date.now()}`;
  const channel = await createChannel(alice, [boris], { title });
  await alice.api.post(`/api/posts/${channel.id}/publish`, { text: "Только для своих" });

  const b = (await openAs(boris.api, `/chat/${channel.id}`)).page;
  await expect(messageText(b, "Только для своих")).toBeVisible();
  await b.getByRole("button", { name: "ОТПИСАТЬСЯ" }).click();
  // Предупреждение: вернуться в закрытый канал можно только по приглашению.
  await expect(b.getByRole("heading", { name: /^Канал закрытый — вернуться в него можно будет только по приглашению/ })).toBeVisible();
  await b.getByRole("button", { name: "Отписаться", exact: true }).click();

  await expect(b).toHaveURL(/\/$/);
  await expect(chatRow(b, title)).toHaveCount(0);
  await expect
    .poll(async () => (await alice.api.get(`/api/chats/${channel.id}`)).body.chat.memberIds)
    .not.toContain(boris.id);
});
