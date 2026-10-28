// Ветки отправки и действий над сообщениями, которых нет в остальных файлах:
// приватность «кто может писать», список реакций канала, секретный чат, ответ на историю.
import { describe, expect, test } from "vitest";
import { sendResult } from "../../schemas/messages";
import { expectError, expectOk } from "../../support/expect";
import { createChannel, createDm, registerUsers, sendText } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { msgs } from "./helpers";

const server = useServer();

describe("приватность «Кто может мне писать»", () => {
  test("nobody — 403 privacyBlocked; contacts — пускает, если собеседник уже писал", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const dm = await createDm(a, b);
    const privacy = (await b.api.get("/api/settings")).body.settings.privacy;

    expect((await b.api.patch("/api/settings", { privacy: { ...privacy, messages: "nobody" } })).status).toBe(200);
    const nobody = await a.api.post(msgs(dm.id), { text: "привет" });
    expect(nobody.status).toBe(403);
    expect(nobody.body).toEqual({ error: "Этот пользователь никому не разрешает писать первым", privacyBlocked: true });

    expect((await b.api.patch("/api/settings", { privacy: { ...privacy, messages: "contacts" } })).status).toBe(200);
    const contacts = await a.api.post(msgs(dm.id), { text: "привет" });
    expect(contacts.status).toBe(403);
    expect(contacts.body).toEqual({
      error: "Этот пользователь принимает сообщения только от своих контактов. С Premium писать можно",
      privacyBlocked: true,
    });

    // Собеседник написал сам — ему можно отвечать.
    await sendText(b, dm.id, "пиши");
    expectOk(await a.api.post(msgs(dm.id), { text: "привет" }), sendResult);

    // Запрет по имени сильнее: и переписка не спасает.
    const denied = { ...privacy, messages: "contacts", exceptions: { messages: { allow: [], deny: [a.id] } } };
    expect((await b.api.patch("/api/settings", { privacy: denied })).status).toBe(200);
    expect((await a.api.post(msgs(dm.id), { text: "ещё" })).body.privacyBlocked).toBe(true);
  });
});

describe("POST /:messageId/react — список реакций канала", () => {
  test("недоступную реакцию не поставить, а уже стоящую — снять можно", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const channel = await createChannel(a, [b]);
    const post = await sendText(a, channel.id, "пост");
    expect((await b.api.post(msgs(channel.id, `/${post.id}/react`), { emoji: "🔥" })).status).toBe(200);

    expect((await a.api.post(`/api/chats/${channel.id}/reactions`, { reactions: ["👍"] })).status).toBe(200);
    expectError(await b.api.post(msgs(channel.id, `/${post.id}/react`), { emoji: "🎉" }), 400, "Эта реакция недоступна в этом канале");
    const removed = await b.api.post(msgs(channel.id, `/${post.id}/react`), { emoji: "🔥" });
    expect(removed.status).toBe(200);
    expect(removed.body.message.reactions).toEqual([]);
    const liked = await b.api.post(msgs(channel.id, `/${post.id}/react`), { emoji: "👍" });
    expect(liked.body.message.reactions).toEqual([{ emoji: "👍", userIds: [b.id] }]);
  });
});

describe("секретный чат", () => {
  test("пересылка в него и из него запрещена, сводки недоступны", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const secret = (await a.api.post("/api/chats/secret", { userId: b.id })).body.chat;
    const dm = await createDm(a, b);
    const plain = await sendText(a, dm.id, "обычное");
    const hidden = await sendText(a, secret.id, "секрет ".repeat(80));

    expectError(await a.api.post(msgs(secret.id), { forwardedFrom: { messageId: plain.id } }), 403, "В секретный чат нельзя пересылать");
    expectError(await a.api.post(msgs(dm.id), { forwardedFrom: { messageId: hidden.id } }), 403, "В этом чате запрещена пересылка");
    expectError(await a.api.get(msgs(secret.id, `/${hidden.id}/summary`)), 403, "В секретном чате сводки недоступны");
  });
});

describe("ответ на историю", () => {
  test("storyReply очищается: небезопасная ссылка отбрасывается, имя — до 100 символов, kind — image или video", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const dm = await createDm(a, b);
    const send = async (storyReply: unknown) => expectOk(await a.api.post(msgs(dm.id), { text: "ответ", storyReply }), sendResult).message;

    expect((await send({ url: "javascript:alert(1)", kind: "gif", authorName: "Б".repeat(150) })).storyReply).toEqual({
      kind: "image",
      authorName: "Б".repeat(100),
    });
    expect((await send({ url: "https://example.com/s.mp4", kind: "video" })).storyReply).toEqual({ url: "https://example.com/s.mp4", kind: "video" });
    expect(await send({ kind: "video" })).not.toHaveProperty("storyReply");
    expect(await send("строка")).not.toHaveProperty("storyReply");
  });

  test("storyReply хранит автора и время публикации истории; мусор в них отбрасывается", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const dm = await createDm(a, b);
    const send = async (storyReply: unknown) => expectOk(await a.api.post(msgs(dm.id), { text: "ответ", storyReply }), sendResult).message;
    const createdAt = new Date(Date.now() - 30 * 3600_000).toISOString();

    expect((await send({ url: "/uploads/st_0123456789abcdef.jpg", kind: "image", authorName: "Б", authorId: b.id, createdAt })).storyReply).toEqual({
      url: "/uploads/st_0123456789abcdef.jpg",
      kind: "image",
      authorName: "Б",
      authorId: b.id,
      createdAt,
    });
    const future = new Date(Date.now() + 3600_000).toISOString();
    expect((await send({ url: "/uploads/st_0123456789abcdef.jpg", authorId: "<script>", createdAt: future })).storyReply).toEqual({ url: "/uploads/st_0123456789abcdef.jpg", kind: "image" });
    expect((await send({ url: "/uploads/st_0123456789abcdef.jpg", authorId: 5, createdAt: "вчера" })).storyReply).toEqual({ url: "/uploads/st_0123456789abcdef.jpg", kind: "image" });
  });
});
