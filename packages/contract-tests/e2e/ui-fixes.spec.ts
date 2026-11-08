import { test, expect } from "./support/fixtures";
import { createDm, createGroup, sendText } from "../support/seed";
import { messageText } from "./support/ui";
import { openInfo } from "./groups/helpers";

test("плашка даты обновляется после полуночи без новых сообщений", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const chat = await createDm(alice, boris);
  const message = await sendText(alice, chat.id, "Перед полуночью");
  const { page } = await openAs(alice.api, `/chat/${chat.id}`);
  const late = new Date(message.createdAt);
  // Браузер работает в Europe/Moscow, независимо от часового пояса процесса тестов.
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit" }).format(late);
  await page.clock.install({ time: new Date(`${date}T23:59:59+03:00`) });
  await page.reload();
  await expect(messageText(page, "Перед полуночью")).toBeVisible();
  const feed = page.getByRole("log", { name: "Сообщения" });
  await expect(feed.getByText("Сегодня", { exact: true })).toBeVisible();
  await page.clock.fastForward(3000);
  await expect(feed.getByText("Вчера", { exact: true })).toBeVisible();
});

test("блокировка показывает срок, обратный отсчёт и адрес апелляции", async ({ newUser, openAs }, testInfo) => {
  const user = await newUser();
  const { page } = await openAs(user.api);
  const now = Date.now();
  await page.route("**/api/bootstrap", (route) => route.fulfill({ status: 403, json: {
    error: "banned", banReason: "Проверка блокировки", bannedAt: new Date(now).toISOString(), bannedUntil: new Date(now + 3600_000).toISOString(),
  } }));
  await page.reload();
  const dialog = page.getByRole("alertdialog", { name: "Аккаунт заблокирован" });
  await expect(dialog.getByRole("button", { name: "Назад" })).toBeVisible();
  await expect(dialog.getByText("Проверка блокировки")).toBeVisible();
  await expect(dialog.getByText(/Срок блокировки: 1 час/)).toBeVisible();
  await expect(dialog.getByText(/^Осталось /)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("ban-screen.png"), animations: "disabled" });
  await expect(dialog.getByRole("link", { name: "Подать апелляцию" })).toHaveAttribute("href", /^mailto:shalter\.support@gmail\.com/);
});

test("администратор группы выбирает разрешённые эмодзи и стикерные реакции", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const chat = await createGroup(alice, [boris], { title: "Реакции клуба" });
  const { page } = await openAs(alice.api, `/chat/${chat.id}`);
  const info = await openInfo(page, "Группа");
  await info.getByRole("button", { name: "Редактировать группу" }).click();
  await page.getByRole("button", { name: /^Реакции/ }).click();
  await page.getByRole("radio", { name: "Только выбранные" }).click();
  await expect.poll(async () => (await alice.api.get(`/api/chats/${chat.id}`)).body.chat.allowedReactions).toEqual([]);
  await page.getByRole("button", { name: "👍", exact: true }).click();
  await expect.poll(async () => (await alice.api.get(`/api/chats/${chat.id}`)).body.chat.allowedReactions).toEqual(["👍"]);
  await page.getByRole("button", { name: /^Стикер / }).first().click();
  await expect.poll(async () => (await alice.api.get(`/api/chats/${chat.id}`)).body.chat.allowedReactions).toEqual(["👍", expect.stringMatching(/^sticker:/)]);
  const message = await sendText(alice, chat.id, "Разрешены только выбранные реакции");
  expect((await boris.api.post(`/api/chats/${chat.id}/messages/${message.id}/react`, { emoji: "🔥" })).status).toBe(400);
  expect((await boris.api.post(`/api/chats/${chat.id}/messages/${message.id}/react`, { emoji: "👍" })).status).toBe(200);
});
