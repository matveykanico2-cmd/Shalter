// «Недавние действия» группы: журнал администраторов в «Редактировать группу».
// Действия владельца видит назначенный им администратор на своём устройстве.
import { test, expect, person } from "./fixtures";
import { createGroup, sendText } from "../../support/seed";
import { messageText } from "../support/ui";
import type { Page } from "@playwright/test";

/** Шапка группы → панель информации → «Редактировать группу» → «Недавние действия». */
async function openAdminLog(page: Page, title: string) {
  await page.getByRole("banner").getByRole("button", { name: new RegExp(title) }).click();
  await page.getByRole("button", { name: "Редактировать группу" }).click();
  await expect(page.getByRole("heading", { name: "Изменить группу" })).toBeVisible();
  await page.getByRole("button", { name: "Недавние действия" }).click();
  await expect(page.getByRole("heading", { name: "Недавние действия" })).toBeVisible();
}

test("журнал пустой у новой группы и показывает переименование, назначение админа и удаление участника", async ({ newUser, openAs }) => {
  const aliceName = person("Алиса");
  const borisName = person("Борис");
  const vikaName = person("Вика");
  const alice = await newUser(aliceName);
  const boris = await newUser(borisName);
  const vika = await newUser(vikaName);
  const title = person("Клуб");
  const group = await createGroup(alice, [boris, vika], { title });
  await sendText(alice, group.id, "Добро пожаловать");

  // Новая группа: администраторы ещё ничего не меняли.
  const a = (await openAs(alice.api, `/chat/${group.id}`)).page;
  await expect(messageText(a, "Добро пожаловать")).toBeVisible();
  await openAdminLog(a, title);
  await expect(a.getByText("За последние 30 дней администраторы ничего не меняли")).toBeVisible();
  await a.getByRole("button", { name: "Закрыть", exact: true }).click();
  await expect(a.getByRole("heading", { name: "Недавние действия" })).toHaveCount(0);

  // Владелец назначает Бориса админом, переименовывает группу и удаляет Вику.
  const newTitle = person("Книжный клуб");
  for (const [path, body] of [
    [`/api/chats/${group.id}/members`, { userId: boris.id, role: "promote" }],
    [`/api/chats/${group.id}`, { title: newTitle }],
    [`/api/chats/${group.id}/members`, { userId: vika.id, role: "kick" }],
  ] as const) {
    const res = path.endsWith("/members") ? await alice.api.post(path, body) : await alice.api.patch(path, body);
    expect(res.status, res.text).toBe(200);
  }

  // Борис (теперь админ) открывает журнал на своём устройстве — новые записи сверху.
  const b = (await openAs(boris.api, `/chat/${group.id}`)).page;
  await openAdminLog(b, newTitle);
  const kicked = b.getByText(`${aliceName} удалил(а) ${vikaName}`, { exact: true });
  const renamed = b.getByText(`${aliceName} изменил(а) название на «${newTitle}»`, { exact: true });
  const promoted = b.getByText(`${aliceName} назначил(а) администратором ${borisName}`, { exact: true });
  await expect(kicked).toBeVisible();
  await expect(renamed).toBeVisible();
  await expect(promoted).toBeVisible();
  const y = async (l: typeof kicked) => (await l.boundingBox())!.y;
  expect(await y(kicked)).toBeLessThan(await y(renamed));
  expect(await y(renamed)).toBeLessThan(await y(promoted));
});
