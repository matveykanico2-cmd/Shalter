// Юридический отдел (раздел «legal»): выгрузка данных пользователя по адресному
// запросу (POST /export), скачивание его медиа в обход членства в чате
// (GET /export/media/:filename) и журнал выгрузок (GET /exports).
import { randomBytes } from "node:crypto";
import { describe, expect, test } from "vitest";
import { exportBody, exportsBody } from "../../schemas/admin";
import { uploadResult } from "../../schemas/uploads";
import type { Api } from "../../support/client";
import { expectError, expectOk } from "../../support/expect";
import { createDm, createGroup, registerUser, sendText, type TestUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { ADMIN_ENV, admins, NO_RIGHTS, sectionAdmin, USER_NOT_FOUND } from "./helpers";

const server = useServer({ env: ADMIN_ENV });
const { primary } = admins(() => server().baseUrl);

let legalUser: TestUser | undefined;
async function legal(): Promise<TestUser> {
  legalUser ??= await sectionAdmin(server().baseUrl, await primary(), ["legal"], { name: "Юрист" });
  return legalUser;
}

const NEED_REASON = "Укажите основание (номер дела / реквизиты постановления) — оно записывается в журнал";

async function uploadText(api: Api, bytes: Buffer, name: string) {
  const res = await api.request("POST", "/api/uploads", {
    query: { kind: "file", name, mimeType: "text/plain" },
    headers: { "content-type": "application/octet-stream" },
    body: new Blob([new Uint8Array(bytes)]),
  });
  return expectOk(res, uploadResult);
}

async function fetchBytes(api: Api | null, path: string, baseUrl: string) {
  const headers: Record<string, string> = {};
  if (api) headers.cookie = api.cookieHeader();
  const res = await fetch(new URL(path, baseUrl), { headers });
  return { status: res.status, bytes: Buffer.from(await res.arrayBuffer()) };
}

describe("POST /api/admin/export", () => {
  test("выгрузка: чаты пользователя, сообщения с пометками, медиа и счётчики; запись в журнал", async () => {
    const { baseUrl } = server();
    const l = await legal();
    const target = await registerUser(baseUrl, { name: "Фигурант" });
    const friend = await registerUser(baseUrl, { name: "Друг" });
    const dm = await createDm(target, friend);
    const group = await createGroup(friend, [target], { title: "Общая группа" });

    const first = await sendText(target, dm.id, "привет");
    const reply = await sendText(friend, dm.id, "ответ", { replyToId: first.id });
    const edit = await target.api.patch(`/api/chats/${dm.id}/messages/${first.id}`, { text: "привет!" });
    expect(edit.status, edit.text).toBe(200);
    const bytes = Buffer.from(`документ ${randomBytes(8).toString("hex")}`);
    const file = await uploadText(target.api, bytes, "doc.txt");
    const withFile = await sendText(target, group.id, "файл", { attachments: [{ kind: "file", url: file.url, name: "doc.txt", size: file.size, mimeType: "text/plain" }] });

    const res = await l.api.post("/api/admin/export", { userId: target.id, reason: "  Дело №1/2026  " });
    const { exportId, data } = expectOk(res, exportBody);
    expect(data.target).toMatchObject({ id: target.id, name: "Фигурант", username: target.username, phone: target.phone, email: target.email });
    // В группе есть и служебная строка о создании — её отправитель системный бот.
    expect(data.stats).toEqual({ chatCount: 2, messageCount: 4, sentMessageCount: 2, mediaCount: 1, byKind: { file: 1 } });

    const byId = new Map(data.chats.map((c) => [c.chatId, c]));
    const dmOut = byId.get(dm.id)!;
    expect(dmOut).toMatchObject({ type: "dm", messageCount: 2 });
    expect(dmOut).not.toHaveProperty("title");
    expect(dmOut.members.map((m) => m.id).sort()).toEqual([target.id, friend.id].sort());
    expect(dmOut.messages[0]).toMatchObject({ id: first.id, from: { id: target.id, name: "Фигурант" }, sentByTarget: true, type: "text", text: "привет!" });
    expect(dmOut.messages[0].editedAt).toBeDefined();
    expect(dmOut.messages[1]).toMatchObject({ id: reply.id, from: { id: friend.id, name: "Друг" }, replyToId: first.id, text: "ответ" });
    expect(dmOut.messages[1]).not.toHaveProperty("sentByTarget");

    const groupOut = byId.get(group.id)!;
    expect(groupOut).toMatchObject({ type: "group", title: "Общая группа", messageCount: 2 });
    expect(groupOut.messages[0]).toMatchObject({ type: "system", from: { id: "bot_shalter" } });
    expect(groupOut.messages[1]).toMatchObject({ id: withFile.id, attachments: [{ kind: "file", name: "doc.txt", url: file.url, size: file.size }] });

    const filename = file.url.slice("/uploads/".length);
    expect(data.media).toEqual([
      expect.objectContaining({
        chatId: group.id,
        chatType: "group",
        chatTitle: "Общая группа",
        messageId: withFile.id,
        from: expect.objectContaining({ id: target.id }),
        sentByTarget: true,
        kind: "file",
        url: file.url,
        downloadUrl: `/api/admin/export/media/${filename}`,
      }),
    ]);

    const { exports } = expectOk(await l.api.get("/api/admin/exports"), exportsBody);
    expect(exports.find((e) => e.id === exportId)).toMatchObject({
      reason: "Дело №1/2026",
      messageCount: 4,
      admin: { id: l.id, name: "Юрист" },
      target: { id: target.id, name: "Фигурант", username: target.username },
    });

    // Медиа юрист скачивает, не будучи участником чата; обычный путь /uploads ему закрыт.
    const viaAdmin = await fetchBytes(l.api, data.media[0].downloadUrl, baseUrl);
    expect(viaAdmin.status).toBe(200);
    expect(viaAdmin.bytes.equals(bytes)).toBe(true);
    expect((await fetchBytes(l.api, file.url, baseUrl)).status).toBe(404);
  });

  test("пользователь без чатов — пустая выгрузка", async () => {
    const target = await registerUser(server().baseUrl);
    const { data } = expectOk(await (await legal()).api.post("/api/admin/export", { userId: target.id, reason: "запрос" }), exportBody);
    expect(data).toMatchObject({ chats: [], media: [], stats: { chatCount: 0, messageCount: 0, sentMessageCount: 0, mediaCount: 0, byKind: {} } });
    expect(data.export).toMatchObject({ kind: "lawful-request-user-export" });
  });

  test("ошибки: основание проверяется раньше пользователя", async () => {
    const l = await legal();
    const target = await registerUser(server().baseUrl);
    expectError(await l.api.post("/api/admin/export", { userId: target.id }), 400, NEED_REASON);
    expectError(await l.api.post("/api/admin/export", { userId: target.id, reason: "  " }), 400, NEED_REASON);
    expectError(await l.api.post("/api/admin/export", { userId: "u_nonexistent00" }), 400, NEED_REASON);
    expectError(await l.api.post("/api/admin/export", { userId: "u_nonexistent00", reason: "x" }), 404, USER_NOT_FOUND);
    expectError(await l.api.post("/api/admin/export", { reason: "x" }), 404, USER_NOT_FOUND);
  });
});

describe("GET /api/admin/export/media/:filename", () => {
  test("неверное или несуществующее имя — 404 без тела; без раздела — 403 JSON", async () => {
    const { baseUrl } = server();
    const l = await legal();
    for (const name of ["sha_0000000000000000.txt", "BAD_NAME.png", "sha_xyz"]) {
      const res = await fetchBytes(l.api, `/api/admin/export/media/${encodeURIComponent(name)}`, baseUrl);
      expect(res.status, name).toBe(404);
      expect(res.bytes.length, name).toBe(0);
    }
    const owner = await registerUser(baseUrl);
    const file = await uploadText(owner.api, Buffer.from(`секрет ${randomBytes(8).toString("hex")}`), "s.txt");
    const filename = file.url.slice("/uploads/".length);
    // Файл, ещё не отправленный ни в один чат, юрист тоже скачивает.
    expect((await fetchBytes(l.api, `/api/admin/export/media/${filename}`, baseUrl)).status).toBe(200);
    const res = await owner.api.get(`/api/admin/export/media/${filename}`);
    expectError(res, 403, NO_RIGHTS);
    expectError(await (await registerUser(baseUrl)).api.get(`/api/admin/export/media/${filename}`), 403, NO_RIGHTS);
  });
});

describe("GET /api/admin/exports", () => {
  test("журнал от новых к старым; удалённые пользователи — только id", async () => {
    const { baseUrl } = server();
    const l = await legal();
    const p = await primary();
    const m = await sectionAdmin(baseUrl, p, ["moderation"]);
    const target = await registerUser(baseUrl);
    const a = expectOk(await l.api.post("/api/admin/export", { userId: target.id, reason: "первый" }), exportBody).exportId;
    await new Promise((r) => setTimeout(r, 5));
    const b = expectOk(await l.api.post("/api/admin/export", { userId: target.id, reason: "второй" }), exportBody).exportId;

    let { exports } = expectOk(await l.api.get("/api/admin/exports"), exportsBody);
    const ids = exports.map((e) => e.id);
    expect(ids.indexOf(b)).toBeLessThan(ids.indexOf(a));

    const del = await m.api.delete(`/api/admin/users/${target.id}`, { confirm: target.username, reason: "закрытие" });
    expect(del.status, del.text).toBe(200);
    ({ exports } = expectOk(await l.api.get("/api/admin/exports"), exportsBody));
    const own = exports.filter((e) => e.target.id === target.id);
    expect(own.map((e) => e.reason)).toEqual([`УДАЛЕНИЕ АККАУНТА @${target.username} (${target.name}): закрытие`, "второй", "первый"]);
    for (const e of own) expect(e.target).toEqual({ id: target.id });
    expect(own[0].admin).toEqual({ id: m.id, name: m.name });
  });
});
