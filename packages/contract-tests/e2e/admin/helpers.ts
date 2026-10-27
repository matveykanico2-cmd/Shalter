// Помощники папки admin: модератор с разделом «Модерация», служебный чат
// «Shalter» (туда приходят жалобы и уведомления) и ответы в окне askText.
import { expect, type Page } from "@playwright/test";
import { registerUser, type TestUser } from "../../support/seed";

export const SYSTEM_BOT_ID = "bot_shalter";

/** Новый пользователь, которому главный админ выдал разделы администрирования. */
export async function moderator(baseUrl: string, admin: TestUser, name: string, sections = ["moderation"]): Promise<TestUser> {
  const user = await registerUser(baseUrl, { name });
  const res = await admin.api.post(`/api/admin/users/${user.id}/admin-sections`, { sections });
  expect(res.status, res.text).toBe(200);
  return user;
}

/** id лички пользователя с ботом (служебный «Shalter» или Hugo); ждёт, пока чат появится. */
export async function dmWithBot(user: TestUser, botId = SYSTEM_BOT_ID): Promise<string> {
  let id: string | undefined;
  await expect
    .poll(async () => {
      const res = await user.api.get("/api/chats");
      id = res.body.chats?.find((c: any) => c.type === "dm" && c.memberIds.includes(botId))?.id;
      return id;
    })
    .toBeTruthy();
  return id!;
}

/** Окно с полем ввода (askText): окно и поле названы вопросом; вводим ответ и жмём «OK». */
export async function answerPrompt(page: Page, question: string | RegExp, answer: string) {
  const dialog = page.getByRole("dialog", { name: question });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox", { name: question }).fill(answer);
  await dialog.getByRole("button", { name: "OK", exact: true }).click();
  await expect(dialog).toHaveCount(0);
}
