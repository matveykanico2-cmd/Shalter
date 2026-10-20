// «Экспорт данных» GET /api/export: пользователь выгружает свою переписку и
// манифест вложений (тот же построитель, что у юридического отдела).
import { describe, expect, test } from "vitest";
import { selfExportBody } from "../../schemas/misc";
import { uploadResult } from "../../schemas/uploads";
import { Api } from "../../support/client";
import { expectError, expectOk } from "../../support/expect";
import { createDm, createGroup, registerUser, sendText } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { download, upload, uniquePng } from "../uploads/helpers";

const server = useServer();

describe("GET /api/export", () => {
  test("без сессии — 401", async () => {
    expectError(await new Api(server().baseUrl).get("/api/export"), 401, "unauthorized");
  });

  test("новый пользователь — пустая выгрузка с данными аккаунта", async () => {
    const me = await registerUser(server().baseUrl, { name: "Новичок" });
    const { data } = expectOk(await me.api.get("/api/export"), selfExportBody);
    expect(data.target).toEqual({ id: me.id, name: "Новичок", username: me.username, phone: me.phone, email: me.email, createdAtFirstSeen: expect.any(String) });
    expect(data).toMatchObject({ chats: [], media: [], stats: { chatCount: 0, messageCount: 0, sentMessageCount: 0, mediaCount: 0, byKind: {} } });
    // ПОВЕДЕНИЕ-ВОПРОС: собственный экспорт помечен как выгрузка по запросу органов
    // (kind "lawful-request-user-export" и соответствующая note) — общий построитель с /api/admin/export.
    expect(data.export.kind).toBe("lawful-request-user-export");
  });

  test("только свои чаты: сообщения с пометками, вложения в манифесте; секретный чат и чужие чаты не попадают", async () => {
    const { baseUrl } = server();
    const me = await registerUser(baseUrl, { name: "Я" });
    const friend = await registerUser(baseUrl, { name: "Друг" });
    const stranger = await registerUser(baseUrl);
    const dm = await createDm(me, friend);
    expect((await friend.api.patch("/api/settings", { privacy: { phone: "everyone" } })).status).toBe(200);
    const hello = await sendText(me, dm.id, "привет");
    const answer = await sendText(friend, dm.id, "и тебе", { replyToId: hello.id });

    const file = expectOk(await upload(me.api, uniquePng(), { kind: "image", name: "p.png" }), uploadResult);
    const group = await createGroup(friend, [me], { title: "Компания" });
    const withPhoto = await sendText(me, group.id, "фото", { attachments: [{ kind: "image", url: file.url, name: "p.png" }] });

    // Чужая переписка, в которой меня нет.
    const foreign = await createDm(friend, stranger);
    await sendText(friend, foreign.id, "не для тебя");
    // Секретный чат.
    const secret = await me.api.post("/api/chats/secret", { userId: friend.id });
    expect(secret.status, secret.text).toBe(200);

    const { data } = expectOk(await me.api.get("/api/export"), selfExportBody);
    expect(data.chats.map((c) => c.chatId).sort()).toEqual([dm.id, group.id].sort());
    // В группе — служебная строка о создании + фото.
    expect(data.stats).toEqual({ chatCount: 2, messageCount: 4, sentMessageCount: 2, mediaCount: 1, byKind: { image: 1 } });

    const dmOut = data.chats.find((c) => c.chatId === dm.id)!;
    expect(dmOut.messages).toEqual([
      { id: hello.id, at: hello.createdAt, from: { id: me.id, name: "Я", username: me.username, phone: me.phone }, sentByTarget: true, type: "text", text: "привет" },
      { id: answer.id, at: answer.createdAt, from: { id: friend.id, name: "Друг", username: friend.username, phone: friend.phone }, type: "text", text: "и тебе", replyToId: hello.id },
    ]);
    expect(dmOut.members).toEqual(expect.arrayContaining([{ id: friend.id, name: "Друг", username: friend.username, phone: friend.phone }]));

    const filename = file.url.slice("/uploads/".length);
    expect(data.media).toEqual([
      expect.objectContaining({ chatId: group.id, chatType: "group", chatTitle: "Компания", messageId: withPhoto.id, sentByTarget: true, kind: "image", url: file.url, downloadUrl: `/api/admin/export/media/${filename}` }),
    ]);
    // ПОВЕДЕНИЕ-ВОПРОС: downloadUrl в собственной выгрузке ведёт на админский маршрут,
    // обычному пользователю он закрыт; скачивать приходится по url (/uploads/…).
    expectError(await me.api.get(data.media[0].downloadUrl), 403, "Недостаточно прав");
    expect((await download(me.api, file.url)).status).toBe(200);
  });
  test("телефоны собеседников — с учётом их приватности и блокировки", async () => {
    const { baseUrl } = server();
    const me = await registerUser(baseUrl, { name: "Я" });
    const hidden = await registerUser(baseUrl, { name: "Скрытный" });
    const open = await registerUser(baseUrl, { name: "Открытый" });
    expect((await hidden.api.patch("/api/settings", { privacy: { phone: "nobody" } })).status).toBe(200);
    expect((await open.api.patch("/api/settings", { privacy: { phone: "everyone" } })).status).toBe(200);
    const group = await createGroup(me, [hidden, open], { title: "Все" });
    await sendText(hidden, group.id, "я тут");

    const labelOf = (data: any, id: string) => data.chats[0].members.find((m: any) => m.id === id);
    let { data } = expectOk(await me.api.get("/api/export"), selfExportBody);
    expect(labelOf(data, me.id).phone).toBe(me.phone);
    expect(labelOf(data, open.id).phone).toBe(open.phone);
    expect(labelOf(data, hidden.id)).not.toHaveProperty("phone");
    expect(data.chats[0].messages.find((m: any) => m.from.id === hidden.id)?.from).not.toHaveProperty("phone");

    // Заблокировавший меня номер не показывает, даже открытый всем.
    expect((await open.api.post(`/api/users/${me.id}/block`, { blocked: true })).status).toBe(200);
    ({ data } = expectOk(await me.api.get("/api/export"), selfExportBody));
    expect(labelOf(data, open.id)).not.toHaveProperty("phone");
  });
});
