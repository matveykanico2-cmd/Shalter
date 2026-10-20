// Папки чатов: CRUD, ссылка-приглашение в папку, просмотр и импорт по ссылке
// (server/routes/folders.js).
import { describe, expect, test } from "vitest";
import { z } from "zod";
import { Api } from "../../support/client";
import { expectError, expectOk, expectShape } from "../../support/expect";
import { createChannel, createDm, createGroup, registerUser, registerUsers, uniq, type TestUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { okBody } from "../../schemas/common";
import { folder, folderBody, folderInvite } from "../../schemas/folders";
import { chatAdded, chatUpdated } from "../../schemas/ws";
import { socketPool } from "../ws/helpers";

const server = useServer();
const open = socketPool();
const listBody = z.strictObject({ folders: z.array(folder) });

async function createFolder(user: TestUser, body: Record<string, unknown>) {
  return expectOk(await user.api.post("/api/folders", body), folderBody).folder;
}

async function publicGroup(owner: TestUser, members: TestUser[] = [], extra: Record<string, unknown> = {}) {
  return createGroup(owner, members, { isPublic: true, username: uniq("grp"), ...extra });
}

describe("без сессии", () => {
  const routes: Array<[string, string]> = [
    ["GET", "/api/folders"],
    ["POST", "/api/folders"],
    ["PATCH", "/api/folders/f_x"],
    ["DELETE", "/api/folders/f_x"],
    ["POST", "/api/folders/f_x/invite-link"],
    ["DELETE", "/api/folders/f_x/invite-link"],
    ["GET", "/api/folders/invite/abc"],
    ["POST", "/api/folders/invite/abc/import"],
  ];
  test.each(routes)("%s %s → 401 unauthorized", async (method, path) => {
    const api = new Api(server().baseUrl);
    expectError(await api.request(method, path, method === "GET" ? {} : { json: {} }), 401, "unauthorized");
  });
});

describe("CRUD", () => {
  test("создание: имя обрезается до 32, дубли chatIds убираются, order растёт", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const dm = await createDm(a, b);
    expect(expectOk(await a.api.get("/api/folders"), listBody)).toEqual({ folders: [] });

    const f1 = await createFolder(a, { name: "  Работа  ", chatIds: [dm.id, dm.id] });
    expect(f1).toEqual({ id: f1.id, ownerId: a.id, name: "Работа", order: 0, chatIds: [dm.id] });
    const f2 = await createFolder(a, { name: "п".repeat(40) });
    expect(f2).toMatchObject({ name: "п".repeat(32), order: 1, chatIds: [] });
    // chatIds не проверяются на существование и членство.
    const f3 = await createFolder(a, { name: "Любые id", chatIds: ["c_whatever", "x"] });
    expect(f3).toMatchObject({ order: 2, chatIds: ["c_whatever", "x"] });

    expect(expectOk(await a.api.get("/api/folders"), listBody).folders.map((f) => f.id)).toEqual([f1.id, f2.id, f3.id]);
    // Чужие папки не видны.
    expect((await b.api.get("/api/folders")).body).toEqual({ folders: [] });
  });

  test("создание: ошибки валидации", async () => {
    const a = await registerUser(server().baseUrl);
    for (const body of [{}, { name: "" }, { name: "   " }, { name: 42 }]) {
      expectError(await a.api.post("/api/folders", body), 400, "Введите название папки");
    }
    for (const chatIds of ["c_1", [1, 2], ["ok", null], { a: 1 }]) {
      expectError(await a.api.post("/api/folders", { name: "x", chatIds }), 400, "Некорректный список чатов");
    }
    // null — как пустой список.
    expect((await createFolder(a, { name: "x", chatIds: null })).chatIds).toEqual([]);
  });

  test("PATCH: имя, состав, порядок; список сортируется по order", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const dm = await createDm(a, b);
    const f1 = await createFolder(a, { name: "Один" });
    const f2 = await createFolder(a, { name: "Два" });

    const patched = expectOk(await a.api.patch(`/api/folders/${f1.id}`, { name: " Первая ", chatIds: [dm.id], order: 10 }), folderBody).folder;
    expect(patched).toEqual({ ...f1, name: "Первая", chatIds: [dm.id], order: 10 });
    expect((await a.api.get("/api/folders")).body.folders.map((f: any) => f.id)).toEqual([f2.id, f1.id]);
    // Пустой патч — папка как есть.
    expect(expectOk(await a.api.patch(`/api/folders/${f1.id}`, {}), folderBody).folder).toEqual(patched);
    // Новая папка встаёт после максимального order.
    expect((await createFolder(a, { name: "Три" })).order).toBe(11);
  });

  test("PATCH: ошибки валидации и чужая/несуществующая папка — 404", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const f = await createFolder(a, { name: "Моя" });
    expectError(await a.api.patch(`/api/folders/${f.id}`, { name: "" }), 400, "Введите название папки");
    expectError(await a.api.patch(`/api/folders/${f.id}`, { name: null }), 400, "Введите название папки");
    expectError(await a.api.patch(`/api/folders/${f.id}`, { chatIds: "x" }), 400, "Некорректный список чатов");
    expectError(await a.api.patch(`/api/folders/${f.id}`, { order: 1.5 }), 400, "Некорректный порядок");
    expectError(await a.api.patch(`/api/folders/${f.id}`, { order: "1" }), 400, "Некорректный порядок");
    // chatIds: null в PATCH — очистка.
    expect(expectOk(await a.api.patch(`/api/folders/${f.id}`, { chatIds: null }), folderBody).folder.chatIds).toEqual([]);

    expectError(await b.api.patch(`/api/folders/${f.id}`, { name: "Чужая" }), 404, "not found");
    expectError(await a.api.patch(`/api/folders/f_nonexistent00`, { name: "x" }), 404, "not found");
    expect((await a.api.get("/api/folders")).body.folders[0].name).toBe("Моя");
  });

  test("DELETE: удаляет; чужая и несуществующая — 404", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const f = await createFolder(a, { name: "Удалить" });
    expectError(await b.api.delete(`/api/folders/${f.id}`), 404, "not found");
    expectOk(await a.api.delete(`/api/folders/${f.id}`), okBody);
    expect((await a.api.get("/api/folders")).body).toEqual({ folders: [] });
    expectError(await a.api.delete(`/api/folders/${f.id}`), 404, "not found");
  });
});

describe("ссылка-приглашение в папку", () => {
  test("создание, просмотр (только публичные чаты), пересоздание и отзыв", async () => {
    const { baseUrl } = server();
    const [a, b, viewer] = await registerUsers(baseUrl, 3);
    const pub = await publicGroup(a, [b]);
    const pubChannel = await createChannel(a, [], { isPublic: true, username: uniq("chn") });
    const priv = await createGroup(a, [b]);
    const dm = await createDm(a, b);
    const f = await createFolder(a, { name: "Подборка", chatIds: [pub.id, priv.id, dm.id, pubChannel.id, "c_missing"] });

    const withLink = expectOk(await a.api.post(`/api/folders/${f.id}/invite-link`), folderBody).folder;
    expect(withLink).toEqual({ ...f, inviteCode: expect.any(String) });
    const code = withLink.inviteCode!;
    // Код виден в списке папок владельца.
    expect((await a.api.get("/api/folders")).body.folders[0].inviteCode).toBe(code);

    const preview = expectShape(folderInvite, (await viewer.api.get(`/api/folders/invite/${code}`)).body, "приглашение");
    expect(preview.name).toBe("Подборка");
    // Только публичные, в порядке папки; без участников и прочих полей чата.
    expect(preview.chats.map((c) => c.id)).toEqual([pub.id, pubChannel.id]);
    expect(preview.chats[0]).toMatchObject({ id: pub.id, type: "group", title: "Группа", username: pub.username });

    // Повторное создание — новый код, старый перестаёт работать.
    const renewed = expectOk(await a.api.post(`/api/folders/${f.id}/invite-link`), folderBody).folder;
    expect(renewed.inviteCode).not.toBe(code);
    expectError(await viewer.api.get(`/api/folders/invite/${code}`), 404, "Ссылка недействительна или отозвана");

    const revoked = expectOk(await a.api.delete(`/api/folders/${f.id}/invite-link`), folderBody).folder;
    expect(revoked).not.toHaveProperty("inviteCode");
    expectError(await viewer.api.get(`/api/folders/invite/${renewed.inviteCode}`), 404, "Ссылка недействительна или отозвана");
  });

  test("invite-link чужой/несуществующей папки — 404", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const f = await createFolder(a, { name: "Моя" });
    expectError(await b.api.post(`/api/folders/${f.id}/invite-link`), 404, "not found");
    expectError(await b.api.delete(`/api/folders/${f.id}/invite-link`), 404, "not found");
    expectError(await a.api.post(`/api/folders/f_nonexistent00/invite-link`), 404, "not found");
    expectError(await a.api.delete(`/api/folders/f_nonexistent00/invite-link`), 404, "not found");
    expectError(await a.api.get(`/api/folders/invite/0000000000000000`), 404, "Ссылка недействительна или отозвана");
    expectError(await a.api.post(`/api/folders/invite/0000000000000000/import`), 404, "Ссылка недействительна или отозвана");
  });

  test("импорт: вступает в публичные чаты (кроме заявок), копирует папку; события chat:added/chat:updated", async () => {
    const { baseUrl } = server();
    const [owner, member, importer, outsider] = await registerUsers(baseUrl, 4);
    const open1 = await publicGroup(owner, [member]);
    const already = await publicGroup(owner, [importer]);
    const withApproval = await publicGroup(owner, []);
    expect((await owner.api.post(`/api/chats/${withApproval.id}/settings`, { approveJoins: true })).status).toBe(200);
    const priv = await createGroup(owner, [member]);
    const f = await createFolder(owner, { name: "Сообщества", chatIds: [open1.id, already.id, withApproval.id, priv.id] });
    const code = (await owner.api.post(`/api/folders/${f.id}/invite-link`)).body.folder.inviteCode;
    await createFolder(importer, { name: "Своя" });

    const [ownerWs, memberWs, importerWs, outsiderWs] = await Promise.all([open(owner.api), open(member.api), open(importer.api), open(outsider.api)]);

    const created = expectOk(await importer.api.post(`/api/folders/invite/${code}/import`), folderBody).folder;
    // Публичные чаты попадают в папку, даже если вступить не удалось (заявки); приватные — нет.
    expect(created).toEqual({ id: created.id, ownerId: importer.id, name: "Сообщества", order: 1, chatIds: [open1.id, already.id, withApproval.id] });
    expect(created.id).not.toBe(f.id);
    expect(created).not.toHaveProperty("inviteCode");

    const added = expectShape(chatAdded, await importerWs.waitFor("chat:added", (e) => e.chat?.id === open1.id), "chat:added");
    expect(added.chat.memberIds).toEqual([...open1.memberIds, importer.id]);
    for (const ws of [ownerWs, memberWs]) {
      const e = expectShape(chatUpdated, await ws.waitFor("chat:updated", (e) => e.chat?.id === open1.id), "chat:updated");
      expect(e.chat.memberIds).toContain(importer.id);
    }
    // Уже участник и группа с заявками — без событий; вступивший не получает chat:updated о себе.
    await importerWs.expectNone("chat:added", (e) => e.chat?.id === already.id || e.chat?.id === withApproval.id, 300);
    await importerWs.expectNone("chat:updated", (e) => e.chat?.id === open1.id, 0);
    await outsiderWs.expectNone("chat:updated", () => true, 0);

    const chats = (await importer.api.get("/api/chats")).body.chats.map((c: any) => c.id);
    expect(chats).toEqual(expect.arrayContaining([open1.id, already.id]));
    expect(chats).not.toContain(withApproval.id);
    expect(chats).not.toContain(priv.id);
    // Оригинальная папка не изменилась.
    expect((await owner.api.get("/api/folders")).body.folders[0]).toMatchObject({ id: f.id, chatIds: f.chatIds });
  });

  test("импорт владельцем своей же папки — создаёт копию", async () => {
    const { baseUrl } = server();
    const owner = await registerUser(baseUrl);
    const pub = await publicGroup(owner);
    const f = await createFolder(owner, { name: "Своё", chatIds: [pub.id] });
    const code = (await owner.api.post(`/api/folders/${f.id}/invite-link`)).body.folder.inviteCode;
    const copy = expectOk(await owner.api.post(`/api/folders/invite/${code}/import`), folderBody).folder;
    expect(copy).toMatchObject({ name: "Своё", chatIds: [pub.id], order: 1 });
    expect((await owner.api.get("/api/folders")).body.folders).toHaveLength(2);
  });
});
