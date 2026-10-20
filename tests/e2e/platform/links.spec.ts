// Ссылки, которые открывают экраны приложения: приглашение в папку /folder/:code и
// системное «Поделиться» /share/:token (окно «Поделиться в Shalter»).
import { randomInt } from "node:crypto";
import { test, expect } from "../support/fixtures";
import { Api } from "../../support/client";
import { createDm, createGroup } from "../../support/seed";
import { chatRow, composer, expectSignedIn, folderTab, messageText } from "../support/ui";
import { PUBLIC_HOST } from "../support/egress";
import { publicGroup } from "./helpers";

// ---------- папка по ссылке ----------

test("ссылка на папку: владелец создаёт её в настройках, другой человек добавляет папку себе", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const chess = await publicGroup(alice, [], "Шахматный клуб");
  const secret = await createGroup(alice, [], { title: "Тайный совет" });
  const folderRes = await alice.api.post("/api/folders", { name: "Хобби", chatIds: [chess.id, secret.id] });
  expect(folderRes.status).toBe(200);

  // Владелец: «Папки с чатами» → папка → «Создать ссылку».
  const { page: a } = await openAs(alice.api, "/settings/folders");
  await a.getByRole("button", { name: /Хобби\s*2 чата/ }).click();
  await expect(a.getByText("Поделиться папкой", { exact: true })).toBeVisible();
  await a.getByRole("button", { name: "Создать ссылку", exact: true }).click();
  await expect(a.getByText(/\/folder\/\S+$/)).toBeVisible();
  const code = (await alice.api.get("/api/folders")).body.folders.find((f: any) => f.name === "Хобби").inviteCode as string;
  await expect(a.getByText(new RegExp(`/folder/${code}$`))).toBeVisible();

  // Гость по ссылке: только публичные чаты папки.
  const { page: b } = await openAs(boris.api, `/folder/${code}`);
  await expect(b.getByRole("heading", { name: "Папка «Хобби»" })).toBeVisible();
  await expect(b.getByText("Шахматный клуб", { exact: true })).toBeVisible();
  await expect(b.getByText("Тайный совет", { exact: true })).toHaveCount(0);
  await b.getByRole("button", { name: "Добавить папку себе" }).click();
  await b.getByRole("button", { name: "Готово — открыть чаты" }).click();

  // Папка — вкладка в списке чатов, внутри вступленная группа.
  await expect(b).toHaveURL(/\/$/);
  await folderTab(b, "Хобби").click();
  await expect(chatRow(b, "Шахматный клуб")).toBeVisible();
  expect((await alice.api.get(`/api/chats/${chess.id}`)).body.chat.memberIds).toContain(boris.id);

  await b.reload();
  await folderTab(b, "Хобби").click();
  await chatRow(b, "Шахматный клуб").click();
  await expect(composer(b)).toBeVisible();
});

test("отозванная ссылка на папку не работает", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const club = await publicGroup(alice, [], "Клуб бегунов");
  const folder = (await alice.api.post("/api/folders", { name: "Спорт", chatIds: [club.id] })).body.folder;
  const code = (await alice.api.post(`/api/folders/${folder.id}/invite-link`)).body.folder.inviteCode as string;

  const { page: a } = await openAs(alice.api, "/settings/folders");
  await a.getByRole("button", { name: /Спорт\s*1 чат/ }).click();
  await expect(a.getByText(new RegExp(`/folder/${code}$`))).toBeVisible();
  await a.getByRole("button", { name: "Отозвать", exact: true }).click();
  await expect(a.getByRole("button", { name: "Создать ссылку", exact: true })).toBeVisible();

  const { page: b } = await openAs(boris.api, `/folder/${code}`);
  await expect(b.getByRole("heading", { name: "Ссылка не работает" })).toBeVisible();
  await expect(b.getByText("Ссылка недействительна или отозвана")).toBeVisible();
  await b.getByRole("button", { name: "К чатам", exact: true }).click();
  await expectSignedIn(b);
});

// ---------- «Поделиться» из системы ----------

/** Браузер отправляет форму Web Share Target; сервер отвечает 303 на /share/<токен>. */
async function shareTarget(baseUrl: string, fill: (form: FormData) => void): Promise<string> {
  const form = new FormData();
  fill(form);
  // Лимит отправок считается по адресу — у каждой отправки свой.
  const ip = `198.51.${randomInt(1, 255)}.${randomInt(1, 255)}`;
  const res = await new Api(baseUrl).request("POST", "/share-target", { form, headers: { "x-forwarded-for": ip } });
  expect(res.status).toBe(303);
  const location = res.headers.get("location") ?? "";
  expect(location).toMatch(/^\/share\/[0-9a-f]{32}$/);
  return location;
}

test("ссылка из «Поделиться» отправляется в выбранный чат и приходит собеседнику", async ({ newUser, openAs, baseUrl }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  await createDm(alice, boris);
  const family = await createGroup(alice, [boris], { title: "Семейный чат" });
  const b = (await openAs(boris.api, `/chat/${family.id}`)).page;
  await expect(composer(b)).toBeVisible();

  const path = await shareTarget(baseUrl, (f) => {
    f.set("text", "Смотри, какая статья");
    // IP из TEST-NET-3: сервер строит превью ссылки, и заглушка egress отвечает 404 без DNS-запроса.
    f.set("url", `http://${PUBLIC_HOST}/a/1`);
  });
  const { page: a } = await openAs(alice.api, path);
  const dialog = a.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Поделиться в Shalter" })).toBeVisible();
  await expect(dialog.getByText(/Смотри, какая статья/)).toBeVisible();
  // Маршрут одноразовый — сразу возвращаемся к чатам, окно поверх.
  await expect(a).toHaveURL(/\/$/);
  // Личка в списке тоже есть — с именем собеседника и подписью «Личный чат».
  await expect(dialog.getByRole("button", { name: /Борис\s*Личный чат/ })).toBeVisible();

  await dialog.getByRole("button", { name: /Семейный чат\s*Группа/ }).click();
  await expect(a).toHaveURL(new RegExp(`/chat/${family.id}$`));
  await expect(a.getByText("Отправлено в «Семейный чат»")).toBeVisible();
  await expect(messageText(a, /Смотри, какая статья/)).toBeVisible();
  // Собеседник получает вживую.
  await expect(messageText(b, /Смотри, какая статья/)).toBeVisible();

  // Повторно та же ссылка уже пуста.
  await a.goto(path);
  await expect(a.getByText("Ссылка устарела — поделитесь ещё раз")).toBeVisible();
  await expect(a.getByRole("heading", { name: "Поделиться в Shalter" })).toHaveCount(0);
});

// В окне «Поделиться в Shalter» личка подписана именем собеседника — и в строке, и в тосте.
test("личка в окне «Поделиться» подписана именем собеседника", async ({ newUser, openAs, baseUrl }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const dm = await createDm(alice, boris);
  const path = await shareTarget(baseUrl, (f) => f.set("text", "Лично тебе"));
  const { page } = await openAs(alice.api, path);
  await page.getByRole("dialog").getByRole("button", { name: /Борис\s*Личный чат/ }).click();
  await expect(page).toHaveURL(new RegExp(`/chat/${dm.id}$`));
  await expect(page.getByText("Отправлено в «Борис»")).toBeVisible();
});

test("файл из «Поделиться» отправляется фото в группу; «Отмена» ничего не отправляет", async ({ newUser, openAs, baseUrl }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const group = await createGroup(alice, [boris], { title: "Фотоклуб" });

  // 1×1 PNG.
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const first = await shareTarget(baseUrl, (f) => f.set("media", new Blob([png], { type: "image/png" }), "закат.png"));
  const { page: a } = await openAs(alice.api, first);
  const dialog = a.getByRole("dialog");
  await expect(dialog.getByText("закат.png", { exact: true })).toBeVisible();
  await expect(dialog.getByText(/^Фото · /)).toBeVisible();
  await dialog.getByRole("button", { name: /Фотоклуб\s*Группа/ }).click();
  await expect(a).toHaveURL(new RegExp(`/chat/${group.id}$`));
  await expect(a.getByText("Отправлено в «Фотоклуб»")).toBeVisible();
  await expect
    .poll(async () => (await boris.api.get(`/api/chats/${group.id}/messages`)).body.messages.flatMap((m: any) => (m.attachments ?? []).map((x: any) => x.kind)))
    .toContain("image");

  // Отмена — окно закрывается, в чатах ничего нового.
  const second = await shareTarget(baseUrl, (f) => f.set("text", "Не отправляй это"));
  await a.goto(second);
  await expect(a.getByRole("heading", { name: "Поделиться в Shalter" })).toBeVisible();
  await a.getByRole("button", { name: "Отмена", exact: true }).click();
  await expect(a.getByRole("heading", { name: "Поделиться в Shalter" })).toHaveCount(0);
  const texts = (await boris.api.get(`/api/chats/${group.id}/messages`)).body.messages.map((m: any) => m.text);
  expect(texts).not.toContain("Не отправляй это");
});

// Поле «Поиск чата» в окне «Поделиться в Shalter» оставляет только подходящие чаты.
test("поиск чата в окне «Поделиться» фильтрует список", async ({ newUser, openAs, baseUrl }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  await createGroup(alice, [boris], { title: "Рыбалка" });
  await createGroup(alice, [boris], { title: "Охота" });
  const path = await shareTarget(baseUrl, (f) => f.set("text", "Привет"));
  const { page } = await openAs(alice.api, path);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: /Охота/ })).toBeVisible();
  await dialog.getByRole("textbox", { name: "Поиск чата" }).fill("рыб");
  await expect(dialog.getByRole("button", { name: /Рыбалка/ })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Охота/ })).toHaveCount(0);
});
