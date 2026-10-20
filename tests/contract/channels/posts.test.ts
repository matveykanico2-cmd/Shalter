// /api/posts: публикация поста с копией в группу обсуждения, просмотры, комментарии
// (в том числе платные).
import { describe, expect, test } from "vitest";
import { chatBody, chatCard, commentPriceBody, discussionBody } from "../../schemas/chats";
import { commentPaymentRequired, commentResultBody, commentsBody, postViewBody } from "../../schemas/channels";
import { historyPage, messageEnvelope } from "../../schemas/messages";
import { expectError, expectOk } from "../../support/expect";
import { createChannel, createGroup, registerUser, sendText } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { anonymous, handle, publish, registerPremiumUser, wsPool } from "./helpers";

const server = useServer();
const ws = wsPool();

const history = async (api: { get: (p: string) => Promise<any> }, chatId: string) =>
  expectOk(await api.get(`/api/chats/${chatId}/messages`), historyPage).messages;

describe("без сессии", () => {
  test("401", async () => {
    const api = anonymous(server().baseUrl);
    for (const res of await Promise.all([
      api.post("/api/posts/c_whatever00/publish", { text: "x" }),
      api.post("/api/posts/m_whatever00/view"),
      api.get("/api/posts/m_whatever00/comments"),
      api.post("/api/posts/m_whatever00/comments", { text: "x" }),
    ])) expectError(res, 401, "unauthorized");
  });
});

describe("POST /api/posts/:channelId/publish", () => {
  test("пост: message:new подписчикам, якорь в группе обсуждения", async () => {
    const { baseUrl } = server();
    const owner = await registerUser(baseUrl, { name: "Автор" });
    const reader = await registerUser(baseUrl);
    const outsider = await registerUser(baseUrl);
    const channel = await createChannel(owner, [reader], { title: "Вестник" });
    const [ownerWs, readerWs, outWs] = await Promise.all([ws(owner), ws(reader), ws(outsider)]);

    const post = expectOk(await publish(owner, channel.id, { text: "Первый пост" }), messageEnvelope).message;
    expect(post).toMatchObject({ chatId: channel.id, senderId: owner.id, type: "text", text: "Первый пост", views: 0, readByIds: [owner.id] });
    expect(post).not.toHaveProperty("signedBy");
    expect(post).not.toHaveProperty("commentCount");
    expect(post.discussionAnchorId).toEqual(expect.any(String));

    const ev = await readerWs.waitFor("message:new", (e) => e.message?.id === post.id);
    expect(ev).toEqual({ type: "message:new", chatId: channel.id, message: post });
    await ownerWs.expectNone("message:new", (e) => e.message?.id === post.id);
    await outWs.expectNone("message:new");

    // Якорь — пересланная копия поста в группе обсуждения, без WS-события.
    const discussionId = channel.linkedDiscussionChatId!;
    const anchor = (await history(owner.api, discussionId)).find((m) => m.id === post.discussionAnchorId)!;
    expect(anchor).toMatchObject({
      chatId: discussionId,
      senderId: owner.id,
      text: "Первый пост",
      anchorForPostId: post.id,
      forwardedFrom: { chatId: channel.id, chatTitle: "Вестник", senderId: owner.id, senderName: "Автор" },
    });
    await ownerWs.expectNone("message:new", (e) => e.chatId === discussionId && e.message?.type !== "system");
    expect((await history(reader.api, channel.id)).at(-1)).toEqual(post);
  });

  test("ошибки и права", async () => {
    const { baseUrl } = server();
    const owner = await registerUser(baseUrl);
    const admin = await registerUser(baseUrl);
    const reader = await registerUser(baseUrl);
    const channel = await createChannel(owner, [admin, reader], { adminIds: [admin.id] });
    const group = await createGroup(owner, []);

    expectError(await publish(owner, "c_nonexistent00", { text: "x" }), 404, "not found");
    expectError(await publish(owner, group.id, { text: "x" }), 404, "not found");
    expectError(await publish(reader, channel.id, { text: "x" }), 403, "Публиковать могут только администраторы канала");
    expectError(await publish(owner, channel.id, {}), 400, "empty post");
    expectError(await publish(owner, channel.id, { text: "   ", attachments: [] }), 400, "empty post");
    expectError(await publish(owner, channel.id, { text: "x".repeat(4097) }), 400, "Пост длиннее 4096 символов");
    expectOk(await publish(owner, channel.id, { text: "x".repeat(4096) }), messageEnvelope);
    // Админ (не владелец) публикует.
    expectOk(await publish(admin, channel.id, { text: "от админа" }), messageEnvelope);
    // ПОВЕДЕНИЕ-ВОПРОС: проверяются только права админа, а не членство в канале — посторонний получает 403, а не 404.
    const outsider = await registerUser(baseUrl);
    expectError(await publish(outsider, channel.id, { text: "x" }), 403, "Публиковать могут только администраторы канала");
  });

  test("подпись, clientId, выключенные комментарии, платный пост", async () => {
    const { baseUrl } = server();
    const owner = await registerUser(baseUrl, { name: "Подписант" });
    const reader = await registerUser(baseUrl);
    const channel = await createChannel(owner, [reader]);

    expectOk(await owner.api.post(`/api/chats/${channel.id}/settings`, { signMessages: true }), chatBody);
    const signed = expectOk(await publish(owner, channel.id, { text: "с подписью" }), messageEnvelope).message;
    expect(signed.signedBy).toBe("Подписант");

    // Повтор с тем же clientId — тот же пост, без дубля.
    const p1 = expectOk(await publish(owner, channel.id, { text: "раз", clientId: "client-1" }), messageEnvelope).message;
    const p2 = expectOk(await publish(owner, channel.id, { text: "раз", clientId: "client-1" }), messageEnvelope).message;
    expect(p2.id).toBe(p1.id);
    expect((await history(owner.api, channel.id)).filter((m) => m.text === "раз")).toHaveLength(1);

    expectOk(await owner.api.post(`/api/chats/${channel.id}/settings`, { commentsOff: true }), chatBody);
    const quiet = expectOk(await publish(owner, channel.id, { text: "без комментариев" }), messageEnvelope).message;
    expect(quiet).not.toHaveProperty("discussionAnchorId");

    const att = { kind: "image", url: "https://example.invalid/p.png", name: "p.png" };
    expectError(await publish(owner, channel.id, { text: "x", paidMedia: { stars: 3 } }), 400, "Платным можно сделать только фото или видео");
    expectError(await publish(owner, channel.id, { text: "x", attachments: [att], paidMedia: { stars: 0 } }), 400, "Цена — от 1 до 10000 ⭐");
    const paid = expectOk(await publish(owner, channel.id, { text: "", attachments: [att], paidMedia: { stars: 3 } }), messageEnvelope).message;
    expect(paid.attachments).toEqual([{ kind: "paid", meta: { stars: 3, count: 1, photos: 1, videos: 0, blur: null } }]);
    // Подписчик видит только заглушку.
    const seen = (await history(reader.api, channel.id)).find((m) => m.id === paid.id)!;
    expect(seen.attachments).toEqual(paid.attachments);
  });
});

describe("POST /api/posts/:postId/view", () => {
  test("ошибки и публичный канал", async () => {
    const { baseUrl } = server();
    const owner = await registerUser(baseUrl);
    const reader = await registerUser(baseUrl);
    const outsider = await registerUser(baseUrl);
    const priv = await createChannel(owner, [reader]);
    const pub = await createChannel(owner, [], { isPublic: true, username: handle() });
    const group = await createGroup(owner, [reader]);
    const privPost = expectOk(await publish(owner, priv.id, { text: "закрытый" }), messageEnvelope).message;
    const pubPost = expectOk(await publish(owner, pub.id, { text: "открытый" }), messageEnvelope).message;
    const groupMsg = await sendText(owner, group.id, "в группе");

    expectError(await reader.api.post("/api/posts/m_nonexistent00/view"), 404, "Пост не найден");
    expectError(await reader.api.post(`/api/posts/${groupMsg.id}/view`), 400, "Просмотры считаются только у постов канала");
    expectError(await outsider.api.post(`/api/posts/${privPost.id}/view`), 403, "Пост недоступен");
    // Публичный канал (с ником) считает и не подписчиков.
    expect(expectOk(await outsider.api.post(`/api/posts/${pubPost.id}/view`), postViewBody)).toEqual({ views: 1, counted: true });
    expect(expectOk(await reader.api.post(`/api/posts/${pubPost.id}/view`), postViewBody)).toEqual({ views: 2, counted: true });
    expect(expectOk(await outsider.api.post(`/api/posts/${pubPost.id}/view`), postViewBody)).toEqual({ views: 2, counted: false });
  });
});

describe("комментарии: GET/POST /api/posts/:postId/comments", () => {
  test("ветка под постом: подписчик комментирует и попадает в обсуждение; события", async () => {
    const { baseUrl } = server();
    const owner = await registerUser(baseUrl);
    const reader = await registerUser(baseUrl, { name: "Читатель" });
    const other = await registerUser(baseUrl);
    const outsider = await registerUser(baseUrl);
    const channel = await createChannel(owner, [reader, other], { title: "Вестник" });
    const discussionId = channel.linkedDiscussionChatId!;
    const post = expectOk(await publish(owner, channel.id, { text: "обсудим" }), messageEnvelope).message;

    const before = expectOk(await reader.api.get(`/api/posts/${post.id}/comments`), commentsBody);
    expect(before.post).toEqual(post);
    expect(before.anchor).toMatchObject({ id: post.discussionAnchorId, anchorForPostId: post.id });
    expect(before.chat).toEqual({ id: discussionId, title: "Вестник · Обсуждение" });
    expect(before.members.map((u) => u.id)).toEqual([owner.id]);
    expect(before.replies).toEqual([]);
    // ПОВЕДЕНИЕ-ВОПРОС: canComment=false для подписчика закрытого канала, хотя POST комментария у него проходит.
    expect(before).toMatchObject({ canComment: false, commentPriceStars: 0, commentPriceFree: true });
    expect(expectOk(await owner.api.get(`/api/posts/${post.id}/comments`), commentsBody).canComment).toBe(true);

    const [ownerWs, otherWs, outWs] = await Promise.all([ws(owner), ws(other), ws(outsider)]);
    expectError(await reader.api.post(`/api/posts/${post.id}/comments`, { text: "  " }), 400, "Напишите комментарий");
    const res = expectOk(await reader.api.post(`/api/posts/${post.id}/comments`, { text: "Первый!" }), commentResultBody);
    expect(res).not.toHaveProperty("chargedStars");
    expect(res.message).toMatchObject({ chatId: discussionId, senderId: reader.id, text: "Первый!", threadRootId: post.discussionAnchorId });

    const thread = await ownerWs.waitFor("thread:message", (e) => e.message?.id === res.message.id);
    expect(thread).toMatchObject({ chatId: discussionId, rootId: post.discussionAnchorId });
    await ownerWs.waitFor("message:updated", (e) => e.message?.id === post.discussionAnchorId && e.message.commentCount === 1);
    // Подписчики канала узнают о новом счётчике комментариев поста.
    const counted = await otherWs.waitFor("message:updated", (e) => e.message?.id === post.id);
    expect(counted).toMatchObject({ chatId: channel.id, message: { id: post.id, commentCount: 1 } });
    await otherWs.expectNone("thread:message");
    await outWs.expectNone("message:updated");
    await outWs.expectNone("thread:message");

    const after = expectOk(await other.api.get(`/api/posts/${post.id}/comments`), commentsBody);
    expect(after.replies.map((m) => m.id)).toEqual([res.message.id]);
    expect(after.post.commentCount).toBe(1);
    // ПОВЕДЕНИЕ-ВОПРОС: members = участники обсуждения + авторы ответов без дедупликации — один человек приходит дважды.
    expect(after.members.map((u) => u.id)).toEqual([owner.id, reader.id, reader.id]);
    // Комментатор стал участником группы обсуждения.
    expect(expectOk(await reader.api.get(`/api/chats/${discussionId}`), chatCard).chat.memberIds).toContain(reader.id);
  });

  test("доступ: посторонний, выключенные комментарии, пост без обсуждения, бан в обсуждении", async () => {
    const { baseUrl } = server();
    const owner = await registerUser(baseUrl);
    const reader = await registerUser(baseUrl);
    const outsider = await registerUser(baseUrl);
    const channel = await createChannel(owner, [reader]);
    const post = expectOk(await publish(owner, channel.id, { text: "пост" }), messageEnvelope).message;
    const plain = await sendText(owner, channel.id, "без якоря");

    for (const call of [
      (u: typeof owner, id: string) => u.api.get(`/api/posts/${id}/comments`),
      (u: typeof owner, id: string) => u.api.post(`/api/posts/${id}/comments`, { text: "x" }),
    ]) {
      expectError(await call(reader, "m_nonexistent00"), 404, "Пост не найден");
      expectError(await call(outsider, post.id), 403, "Комментарии доступны подписчикам канала");
      // Сообщение, отправленное обычной отправкой, якоря не имеет.
      expectError(await call(reader, plain.id), 404, "У канала нет группы обсуждения — комментарии выключены");
    }

    expectOk(await reader.api.post(`/api/posts/${post.id}/comments`, { text: "до бана" }), commentResultBody);
    const discussionId = channel.linkedDiscussionChatId!;
    expectOk(await owner.api.post(`/api/chats/${discussionId}/members`, { userId: reader.id, role: "ban" }), chatBody);
    expectError(await reader.api.post(`/api/posts/${post.id}/comments`, { text: "после" }), 403, "Вас заблокировали в обсуждении");

    expectOk(await owner.api.post(`/api/chats/${channel.id}/settings`, { commentsOff: true }), chatBody);
    expectError(await owner.api.get(`/api/posts/${post.id}/comments`), 403, "В этом канале комментарии отключены");
    expectError(await owner.api.post(`/api/posts/${post.id}/comments`, { text: "x" }), 403, "В этом канале комментарии отключены");
    expectOk(await owner.api.post(`/api/chats/${channel.id}/settings`, { commentsOff: false }), chatBody);

    // Отвязанное обсуждение — комментарии недоступны.
    expectOk(await owner.api.post(`/api/chats/${channel.id}/discussion`, { action: "unlink" }), discussionBody);
    expectError(await owner.api.get(`/api/posts/${post.id}/comments`), 404, "У канала нет группы обсуждения — комментарии выключены");
  });

  test("публичный канал: комментировать может и не подписчик", async () => {
    const { baseUrl } = server();
    const owner = await registerUser(baseUrl);
    const guest = await registerUser(baseUrl);
    const channel = await createChannel(owner, [], { isPublic: true, username: handle() });
    const post = expectOk(await publish(owner, channel.id, { text: "для всех" }), messageEnvelope).message;
    expect(expectOk(await guest.api.get(`/api/posts/${post.id}/comments`), commentsBody).canComment).toBe(true);
    expectOk(await guest.api.post(`/api/posts/${post.id}/comments`, { text: "гость" }), commentResultBody);
    // В канал гостя не добавляют — только в обсуждение.
    expectError(await guest.api.get(`/api/chats/${channel.id}`), 404, "not found");
    expectOk(await guest.api.get(`/api/chats/${channel.linkedDiscussionChatId}`), chatCard);
  });

  test("платные комментарии: 402 без звёзд, бесплатно Premium и админам", async () => {
    const { baseUrl } = server();
    const owner = await registerUser(baseUrl);
    const reader = await registerUser(baseUrl);
    const premium = await registerPremiumUser(baseUrl);
    const channel = await createChannel(owner, [reader, premium]);
    const post = expectOk(await publish(owner, channel.id, { text: "платно" }), messageEnvelope).message;
    expect(expectOk(await owner.api.post(`/api/chats/${channel.id}/comment-price`, { stars: 5 }), commentPriceBody).commentPriceStars).toBe(5);

    expect(expectOk(await reader.api.get(`/api/posts/${post.id}/comments`), commentsBody)).toMatchObject({ commentPriceStars: 5, commentPriceFree: false });
    expect(expectOk(await premium.api.get(`/api/posts/${post.id}/comments`), commentsBody).commentPriceFree).toBe(true);
    expect(expectOk(await owner.api.get(`/api/posts/${post.id}/comments`), commentsBody).commentPriceFree).toBe(true);

    const denied = expectOk(await reader.api.post(`/api/posts/${post.id}/comments`, { text: "дёшево?" }), commentPaymentRequired, 402);
    expect(denied).toEqual({
      error: "Комментарии в этом канале стоят 5 ⭐. Не хватает звёзд. С Premium — бесплатно",
      needStars: 5,
      balance: 0,
      premiumHelps: true,
    });
    // ПОВЕДЕНИЕ-ВОПРОС: в группу обсуждения добавляют до проверки оплаты — после 402 человек уже её участник.
    expectOk(await reader.api.get(`/api/chats/${channel.linkedDiscussionChatId}`), chatCard);

    const free = expectOk(await premium.api.post(`/api/posts/${post.id}/comments`, { text: "с Premium" }), commentResultBody);
    expect(free).not.toHaveProperty("chargedStars");
    expectOk(await owner.api.post(`/api/posts/${post.id}/comments`, { text: "от автора" }), commentResultBody);
    expect(expectOk(await owner.api.get(`/api/posts/${post.id}/comments`), commentsBody).replies.map((m) => m.text)).toEqual(["с Premium", "от автора"]);
  });
});
