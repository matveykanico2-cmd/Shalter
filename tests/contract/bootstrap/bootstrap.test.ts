// GET /api/bootstrap — первый экран клиента одним запросом: настройки, чаты со
// сводками (как GET /api/chats), папки и id контактов.
import { describe, expect, test } from "vitest";
import { z } from "zod";
import { bootstrapBody, chatList, chatSummaryWithContacts } from "../../schemas/chats";
import { expectError, expectOk, expectShape } from "../../support/expect";
import { normalize } from "../../support/normalize";
import { createDm, createGroup, login, registerUser, sendText } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { Api } from "../../support/client";

const server = useServer();

describe("GET /api/bootstrap", () => {
  test("без сессии — 401", async () => {
    expectError(await new Api(server().baseUrl).get("/api/bootstrap"), 401, "unauthorized");
  });

  test("новый пользователь: настройки по умолчанию, остальное пусто", async () => {
    const a = await registerUser(server().baseUrl);
    const body = expectOk(await a.api.get("/api/bootstrap"), bootstrapBody);
    expect(body).toMatchObject({ chats: [], folders: [], contactIds: [] });
    expect(body.settings).toMatchObject({
      theme: "system",
      fontSize: 15,
      notifications: { previewText: true, sound: true, mutedChats: {} },
      privacy: { lastSeen: "everyone", invites: "everyone" },
      drafts: {},
      chatClears: {},
      hiddenChats: {},
      chatWallpapers: {},
      uiLanguage: "ru",
    });
  });

  test("чаты совпадают с GET /api/chats, плюс черновики, папки и контакты", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl, { name: "Борис" });
    const dm = await createDm(a, b);
    const group = await createGroup(b, [a]);
    await sendText(b, dm.id, "привет");
    await a.api.post(`/api/chats/${group.id}/draft`, { text: "черновик" });
    await a.api.post(`/api/chats/${dm.id}/mute`, { forever: true });
    const folder = (await a.api.post("/api/folders", { name: "Работа", chatIds: [group.id] })).body.folder;

    const body = expectOk(await a.api.get("/api/bootstrap"), bootstrapBody);
    const list = expectOk(await a.api.get("/api/chats"), chatList);
    expect(normalize(body.chats)).toEqual(normalize(list.chats));
    expect(body.chats.find((c) => c.id === dm.id)).toMatchObject({ unreadCount: 1, muted: true, otherUser: { id: b.id, name: "Борис" }, draft: null });
    expect(body.chats.find((c) => c.id === group.id)).toMatchObject({ draft: "черновик" });
    expect(body.settings.drafts).toEqual({ [group.id]: "черновик" });
    expect(body.settings.notifications.mutedChats).toEqual({ [dm.id]: true });
    expect(body.folders).toEqual([{ id: folder.id, ownerId: a.id, name: "Работа", order: 0, chatIds: [group.id] }]);
    expect(body.contactIds).toEqual([]);
  });

  test("собеседник из контактов — с локальным именем и признаками контакта", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl, { name: "Борис" });
    const dm = await createDm(a, b);
    await a.api.post("/api/contacts", { userId: b.id, localName: "Боря с работы" });

    // Общая схема publicUser не знает полей контактов — используем расширенную.
    const body = expectOk(await a.api.get("/api/bootstrap"), bootstrapBody.extend({ chats: z.array(chatSummaryWithContacts) }));
    expect(body.contactIds).toEqual([b.id]);
    expect(body.chats.find((c) => c.id === dm.id)!.otherUser).toMatchObject({ id: b.id, name: "Боря с работы", profileName: "Борис", inContacts: true });
    expect(body.chats[0].otherUser).not.toHaveProperty("mutualContact");

    await b.api.post("/api/contacts", { userId: a.id });
    const again = expectOk(await a.api.get("/api/chats"), z.strictObject({ chats: z.array(chatSummaryWithContacts) }));
    expect(again.chats[0].otherUser).toMatchObject({ inContacts: true, mutualContact: true });
  });

  test("секретный чат не попадает в bootstrap чужого устройства", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const secret = (await a.api.post("/api/chats/secret", { userId: b.id })).body.chat;
    const aOther = await login(baseUrl, a);
    // Вход с нового устройства сам по себе добавляет служебный чат (уведомление о входе),
    // поэтому сверяем только наличие секретного.
    expect(expectOk(await a.api.get("/api/bootstrap"), bootstrapBody).chats.map((c) => c.id)).toContain(secret.id);
    expect(expectOk(await aOther.get("/api/bootstrap"), bootstrapBody).chats.map((c) => c.id)).not.toContain(secret.id);
    expectShape(z.literal(true), secret.secret);
  });
});
