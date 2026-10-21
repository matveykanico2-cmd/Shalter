// Список чатов: живое появление новой лички, счётчик непрочитанных, вкладки-фильтры и папки.
import { test, expect } from "./support/fixtures";
import { createDm, createGroup, sendText } from "../support/seed";
import { chatRow, expectSignedIn, folderTab, messageText } from "./support/ui";

test("новая личка приходит без перезагрузки со счётчиком, открытие чата его сбрасывает", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const { page } = await openAs(alice.api, "/");
  await expectSignedIn(page);
  await expect(chatRow(page, "Борис")).toHaveCount(0);

  // Борис пишет первым — чат появляется у Алисы сам, без перезагрузки.
  const chat = await createDm(boris, alice);
  await sendText(boris, chat.id, "Привет от Бориса");
  const row = chatRow(page, "Борис", "Привет от Бориса");
  await expect(row).toBeVisible();
  // Счётчик непрочитанных — в конце строки и на вкладке «Все».
  await expect(row).toHaveAccessibleName(/Привет от Бориса\s*1$/);
  await expect(folderTab(page, "Все")).toHaveAccessibleName(/^Все\s*1$/);

  await sendText(boris, chat.id, "Ещё одно");
  const row2 = chatRow(page, "Борис", "Ещё одно");
  await expect(row2).toHaveAccessibleName(/Ещё одно\s*2$/);

  // Открываем чат — сообщения видны, счётчик пропадает.
  await row2.click();
  await expect(page).toHaveURL(new RegExp(`/chat/${chat.id}$`));
  await expect(messageText(page, "Привет от Бориса")).toBeVisible();
  await expect(messageText(page, "Ещё одно")).toBeVisible();
  await expect(chatRow(page, "Борис", "Ещё одно")).not.toHaveAccessibleName(/\s2$/);
  await expect(folderTab(page, "Все")).toHaveAccessibleName(/^Все$/);

  // Сервер тоже считает чат прочитанным.
  await expect
    .poll(async () => (await alice.api.get("/api/chats")).body.chats.find((c: any) => c.id === chat.id)?.unreadCount)
    .toBe(0);
});

test("вкладки «Личные» / «Группы» и пользовательская папка фильтруют список", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const dm = await createDm(alice, boris);
  await sendText(boris, dm.id, "в личке");
  const group = await createGroup(alice, [boris], { title: "Клуб книголюбов" });
  await sendText(alice, group.id, "в группе");
  const folderRes = await alice.api.post("/api/folders", { name: "Работа", chatIds: [group.id] });
  expect(folderRes.status).toBe(200);

  const { page } = await openAs(alice.api, "/");
  await expectSignedIn(page);
  const dmRow = chatRow(page, "Борис", "в личке");
  const groupRow = chatRow(page, "Клуб книголюбов");
  await expect(dmRow).toBeVisible();
  await expect(groupRow).toBeVisible();

  await folderTab(page, "Личные").click();
  await expect(dmRow).toBeVisible();
  await expect(groupRow).toHaveCount(0);

  await folderTab(page, "Группы").click();
  await expect(groupRow).toBeVisible();
  await expect(dmRow).toHaveCount(0);

  // Папка пользователя — отдельная вкладка с выбранными чатами.
  await folderTab(page, "Работа").click();
  await expect(groupRow).toBeVisible();
  await expect(dmRow).toHaveCount(0);

  await folderTab(page, "Все").click();
  await expect(dmRow).toBeVisible();
  await expect(groupRow).toBeVisible();
});
