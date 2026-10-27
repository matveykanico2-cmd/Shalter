// Bot API: доступ по токену и отправка — текст с клавиатурой и скрытыми
// ответами, медиа, геопозиция, контакт, стикер, опрос, реакция, альбом,
// копирование и пересылка, первое сообщение человеку.
import { describe, expect, test } from "vitest";
import { messageEnvelope, wsMessageNew, wsMessageUpdated } from "../../schemas/messages";
import { sendToUserBody } from "../../schemas/bots";
import { Api } from "../../support/client";
import { expectError, expectOk, expectShape } from "../../support/expect";
import { createDm, createGroup, registerUser, registerUsers, sendText, type TestUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { BotClient, channelWithBot, createBot, groupWithBot, NOT_MEMBER, registerPremiumUser, startBot, wsPool } from "./helpers";

const server = useServer();
const ws = wsPool();

const ALL_METHODS: Array<["GET" | "POST", string]> = [
  ["GET", "me"], ["GET", "updates"], ["POST", "sendMessage"], ["POST", "editMessageText"], ["POST", "deleteMessage"],
  ["POST", "pinChatMessage"], ["POST", "sendChatAction"], ["POST", "sendPhoto"], ["POST", "sendDocument"], ["GET", "getChats"],
  ["GET", "getChat"], ["GET", "getUser"], ["GET", "getMyCommands"], ["POST", "setMyCommands"], ["GET", "resolveUsername"],
  ["GET", "getMessages"], ["POST", "sendSticker"], ["POST", "sendPoll"], ["POST", "sendReaction"], ["POST", "sendGame"],
  ["POST", "getChatJoinRequests"], ["POST", "approveChatJoinRequest"], ["POST", "declineChatJoinRequest"], ["POST", "deleteAnyMessage"],
  ["POST", "banChatMember"], ["POST", "unbanChatMember"], ["POST", "restrictChatMember"], ["POST", "setChatTitle"],
  ["POST", "setChatDescription"], ["POST", "leaveChat"], ["POST", "setMyProfile"], ["POST", "setWebApp"], ["POST", "setWebAppCode"],
  ["POST", "checkWebAppData"], ["POST", "sendVideo"], ["POST", "sendVoice"], ["POST", "sendVideoNote"], ["POST", "sendLocation"],
  ["POST", "sendContact"], ["POST", "forwardMessage"], ["GET", "getMessage"], ["GET", "searchMessages"], ["GET", "getPinnedMessages"],
  ["POST", "unpinChatMessage"], ["POST", "editMessageKeyboard"], ["POST", "scheduleMessage"], ["GET", "getScheduled"],
  ["POST", "cancelScheduled"], ["POST", "createGroup"], ["POST", "addChatMember"], ["POST", "promoteChatMember"],
  ["GET", "getChatAdmins"], ["GET", "getChatMemberCount"], ["GET", "getChatMember"], ["POST", "setChatPermissions"],
  ["POST", "exportChatInviteLink"], ["GET", "getUserStatus"], ["GET", "getCommonChats"], ["POST", "publishPost"],
  ["GET", "getChannelStats"], ["GET", "getMyStats"], ["POST", "sendMediaGroup"], ["POST", "copyMessage"], ["POST", "setMyAvatar"],
  ["POST", "sendMessageToUser"], ["POST", "createChannel"], ["POST", "setChatDiscussion"], ["GET", "getChatDiscussion"],
];

describe("доступ по токену", () => {
  test("без заголовка, с чужим токеном и с сессией человека — 401 на всех методах", async () => {
    const { baseUrl } = server();
    const human = await registerUser(baseUrl);
    const anon = new Api(baseUrl);
    const wrong = new BotClient(baseUrl, "0".repeat(48));
    for (const [method, name] of ALL_METHODS) {
      const path = `/api/bot-api/${name}`;
      expectError(await anon.request(method, path, method === "POST" ? { json: {} } : {}), 401, "Missing Authorization: Bearer <token>");
      // Cookie-сессия человека Bot API не открывает.
      expectError(await human.api.request(method, path, method === "POST" ? { json: {} } : {}), 401, "Missing Authorization: Bearer <token>");
      expectError(method === "GET" ? await wrong.get(name) : await wrong.post(name), 401, "Invalid bot token");
    }
    expectError(await anon.get("/api/bot-api/me", { headers: { authorization: "Token abc" } }), 401, "Missing Authorization: Bearer <token>");
  });
});

describe("sendMessage", () => {
  test("в личку: WS собеседнику, не посторонним; ответ, обрезка, клавиатура", async () => {
    const { baseUrl } = server();
    const [owner, user, outsider] = await registerUsers(baseUrl, 3);
    const b = await createBot(owner, "Отправщик");
    const dm = await startBot(user, b);
    const other = await createDm(user, outsider);
    const foreign = await sendText(user, other.id, "чужое");
    const own = await sendText(user, dm.id, "привет");
    const [userWs, outWs] = await Promise.all([ws(user), ws(outsider)]);

    expectError(await b.client.post("sendMessage", { chatId: dm.id }), 400, "text is required");
    expectError(await b.client.post("sendMessage", { chatId: dm.id, text: "   " }), 400, "text is required");
    expectError(await b.client.post("sendMessage", { chatId: other.id, text: "x" }), 404, NOT_MEMBER);
    expectError(await b.client.post("sendMessage", { chatId: "c_nope0000", text: "x" }), 404, NOT_MEMBER);

    const m = expectOk(
      await b.client.post("sendMessage", {
        chatId: dm.id,
        text: "x".repeat(5000),
        replyToId: own.id,
        keyboard: [
          [
            { text: " Да ", action: "yes" },
            { text: "Сайт", url: "https://example.com/a" },
            { text: "Плохая", url: "javascript:alert(1)" },
            { text: "" },
            { text: "Без действия" },
            { text: "Апп", app: "shop", style: "primary" },
            { text: "Data", data: 7, style: "danger" },
            { text: "Cb", callback_data: "cb", style: "rainbow" },
          ],
          "не ряд",
          [],
          [{ text: "" }],
        ],
      }),
      messageEnvelope,
    ).message;
    expect(m).toMatchObject({ chatId: dm.id, senderId: b.id, type: "text", replyToId: own.id, readByIds: [] });
    expect(m.text).toHaveLength(4096);
    expect(m.keyboard).toEqual([
      [
        { text: "Да", action: "yes" },
        { text: "Сайт", url: "https://example.com/a" },
        { text: "Апп", app: "shop", style: "primary" },
        { text: "Data", action: "7", style: "danger" },
        { text: "Cb", action: "cb" },
      ],
    ]);
    const ev = expectShape(wsMessageNew, await userWs.waitFor("message:new", (e) => e.message?.id === m.id));
    expect(ev.message).toEqual(m);
    await outWs.expectNone("message:new");

    // Ответ на сообщение из другого чата не привязывается; клавиатура без кнопок — нет поля.
    const m2 = expectOk(await b.client.post("sendMessage", { chatId: dm.id, text: "ok", replyToId: foreign.id, keyboard: [[{ text: "" }]] }), messageEnvelope).message;
    expect(m2.replyToId).toBeNull();
    expect(m2).not.toHaveProperty("keyboard");

    const history = (await user.api.get(`/api/chats/${dm.id}/messages`)).body.messages.map((x: any) => x.id);
    expect(history).toEqual([own.id, m.id, m2.id]);
  });

  test("заблокировавшему — нельзя; канал — только админом", async () => {
    const { baseUrl } = server();
    const [owner, user, sub] = await registerUsers(baseUrl, 3);
    const b = await createBot(owner, "Ограничения");
    const dm = await startBot(user, b);
    await user.api.post(`/api/users/${b.id}/block`, { blocked: true });
    // Отказ в отправке — 403, как у sendSticker и forwardMessage; 404 — только «нет такого чата».
    expectError(await b.client.post("sendMessage", { chatId: dm.id, text: "x" }), 403, "User has blocked the bot");
    expectError(await b.client.post("sendPhoto", { chatId: dm.id, url: "https://img.example/p.jpg" }), 403, "User has blocked the bot");

    const channel = await channelWithBot(owner, [sub], b, { admin: false });
    expectError(await b.client.post("sendMessage", { chatId: channel.id, text: "x" }), 403, "Bot must be an admin to post in a channel");
    expectError(await b.client.post("sendPoll", { chatId: channel.id, question: "?", options: ["a", "b"] }), 403, "Bot must be an admin to post in a channel");
    const adminChannel = await channelWithBot(owner, [sub], b);
    expect(expectOk(await b.client.post("sendMessage", { chatId: adminChannel.id, text: "пост" }), messageEnvelope).message.chatId).toBe(adminChannel.id);
  });

  test("visibleTo: скрытый ответ одному участнику группы", async () => {
    const { baseUrl } = server();
    const [owner, target, other, outsider] = await registerUsers(baseUrl, 4);
    const b = await createBot(owner, "Шёпот");
    const group = await groupWithBot(owner, [target, other], b);
    const dm = await startBot(target, b);
    const [ownerWs, targetWs, otherWs] = await Promise.all([ws(owner), ws(target), ws(other)]);

    expectError(await b.client.post("sendMessage", { chatId: dm.id, text: "x", visibleTo: target.id }), 400, "visibleTo must be a member of this group");
    expectError(await b.client.post("sendMessage", { chatId: group.id, text: "x", visibleTo: outsider.id }), 400, "visibleTo must be a member of this group");
    expectError(await b.client.post("sendMessage", { chatId: group.id, text: "x", visibleTo: 5 }), 400, "visibleTo must be a member of this group");

    const m = expectOk(await b.client.post("sendMessage", { chatId: group.id, text: "только тебе", visibleTo: target.id }), messageEnvelope).message;
    expect(m.visibleToId).toBe(target.id);
    // Кому скрыто, сервер держит у себя: наружу deletedForIds всегда пуст.
    expect(m.deletedForIds).toEqual([]);
    await targetWs.waitFor("message:new", (e) => e.message?.id === m.id);
    await Promise.all([ownerWs.expectNone("message:new", (e) => e.message?.id === m.id), otherWs.expectNone("message:new", (e) => e.message?.id === m.id)]);

    const seen = (u: TestUser) => u.api.get(`/api/chats/${group.id}/messages`).then((r) => r.body.messages.map((x: any) => x.id));
    expect(await seen(target)).toContain(m.id);
    expect(await seen(other)).not.toContain(m.id);

    // Правка скрытого ответа уходит только адресату — остальным текст не утекает.
    await b.client.post("editMessageText", { messageId: m.id, text: "правка" });
    const edited = await targetWs.waitFor("message:updated", (e) => e.message?.id === m.id);
    expect(edited.message.text).toBe("правка");
    await Promise.all([ownerWs.expectNone("message:updated", (e) => e.message?.id === m.id), otherWs.expectNone("message:updated", (e) => e.message?.id === m.id)]);
  });
});

describe("медиа", () => {
  test("sendPhoto / sendDocument: url обязателен, подпись по умолчанию", async () => {
    const { baseUrl } = server();
    const [owner, user, outsider] = await registerUsers(baseUrl, 3);
    const b = await createBot(owner, "Медиа");
    const dm = await startBot(user, b);
    const foreign = await createDm(user, outsider);
    const userWs = await ws(user);

    for (const method of ["sendPhoto", "sendDocument", "sendVideo", "sendVoice", "sendVideoNote"]) {
      expectError(await b.client.post(method, { chatId: dm.id }), 400, "url is required");
      expectError(await b.client.post(method, { chatId: foreign.id, url: "https://x.example/a" }), 404, NOT_MEMBER);
    }

    const photo = expectOk(await b.client.post("sendPhoto", { chatId: dm.id, url: "https://img.example/p.jpg" }), messageEnvelope).message;
    expect(photo).toMatchObject({ text: "🖼", attachments: [{ kind: "image", url: "https://img.example/p.jpg", name: "photo" }] });
    await userWs.waitFor("message:new", (e) => e.message?.id === photo.id);
    const captioned = expectOk(await b.client.post("sendPhoto", { chatId: dm.id, url: "https://img.example/p.jpg", caption: "Кот" }), messageEnvelope).message;
    expect(captioned.text).toBe("Кот");

    const doc = expectOk(await b.client.post("sendDocument", { chatId: dm.id, url: "https://f.example/r.pdf", name: "отчёт.pdf" }), messageEnvelope).message;
    expect(doc).toMatchObject({ text: "📎 отчёт.pdf", attachments: [{ kind: "file", url: "https://f.example/r.pdf", name: "отчёт.pdf" }] });
    const docDefault = expectOk(await b.client.post("sendDocument", { chatId: dm.id, url: "https://f.example/r.pdf" }), messageEnvelope).message;
    expect(docDefault).toMatchObject({ text: "📎 file", attachments: [{ kind: "file", name: "file" }] });

    // Небезопасный адрес — 400, сообщение не уходит.
    for (const method of ["sendPhoto", "sendDocument", "sendVideo", "sendVoice", "sendVideoNote"]) {
      expectError(await b.client.post(method, { chatId: dm.id, url: "javascript:alert(1)" }), 400, "Некорректная ссылка на файл");
    }
    expectError(await b.client.post("sendMediaGroup", { chatId: dm.id, items: [{ url: "https://a.example/1" }, { url: "javascript:alert(1)" }] }), 400, "Некорректная ссылка на файл");
    expect((await user.api.get(`/api/chats/${dm.id}/messages`)).body.messages.map((x: any) => x.id)).toEqual([photo.id, captioned.id, doc.id, docDefault.id]);
  });

  test("sendVideo / sendVoice / sendVideoNote", async () => {
    const { baseUrl } = server();
    const [owner, user] = await registerUsers(baseUrl, 2);
    const b = await createBot(owner, "Видео");
    const dm = await startBot(user, b);
    const send = (method: string, body: object) => b.client.post(method, { chatId: dm.id, url: "https://v.example/x", ...body });

    // Подписи по умолчанию «🎬 Видео / 🎤 Голосовое / ⭕ Кружок», имени по умолчанию нет;
    // durationSec (как в документации) сохраняется у голосового и кружка, у видео — нет.
    const video = expectOk(await send("sendVideo", { durationSec: 12 }), messageEnvelope).message;
    expect(video).toMatchObject({ text: "🎬 Видео" });
    expect(video.attachments).toEqual([{ kind: "video", url: "https://v.example/x" }]);
    const voice = expectOk(await send("sendVoice", { durationSec: 3 }), messageEnvelope).message;
    expect(voice).toMatchObject({ text: "🎤 Голосовое" });
    expect(voice.attachments).toEqual([{ kind: "voice", url: "https://v.example/x", durationSec: 3 }]);
    const note = expectOk(await send("sendVideoNote", { caption: "Смотри", name: "n".repeat(250) }), messageEnvelope).message;
    expect(note).toMatchObject({ text: "Смотри" });
    expect(note.attachments).toEqual([{ kind: "video-note", url: "https://v.example/x", name: "n".repeat(200) }]);
  });

  test("sendLocation / sendContact", async () => {
    const { baseUrl } = server();
    const [owner, user, outsider] = await registerUsers(baseUrl, 3);
    const b = await createBot(owner, "Место");
    const dm = await startBot(user, b);
    const foreign = await createDm(user, outsider);

    for (const body of [{}, { lat: 55 }, { lat: "abc", lng: 37 }, { lat: 55, lng: "1e999" }]) {
      expectError(await b.client.post("sendLocation", { chatId: dm.id, ...body }), 400, "lat and lng are required");
    }
    expectError(await b.client.post("sendLocation", { chatId: foreign.id, lat: 1, lng: 2 }), 404, NOT_MEMBER);
    const loc = expectOk(await b.client.post("sendLocation", { chatId: dm.id, lat: "55.75", lng: 37.61 }), messageEnvelope).message;
    expect(loc).toMatchObject({ text: "📍 Место", attachments: [{ kind: "location", meta: { lat: 55.75, lng: 37.61 } }] });
    // lat: null превращается в 0 — Number(null) конечно.
    const zero = expectOk(await b.client.post("sendLocation", { chatId: dm.id, lat: null, lng: 0, caption: "Ноль" }), messageEnvelope).message;
    expect(zero).toMatchObject({ text: "Ноль", attachments: [{ kind: "location", meta: { lat: 0, lng: 0 } }] });

    expectError(await b.client.post("sendContact", { chatId: dm.id }), 400, "name or phone is required");
    expectError(await b.client.post("sendContact", { chatId: foreign.id, name: "x" }), 404, NOT_MEMBER);
    const contact = expectOk(await b.client.post("sendContact", { chatId: dm.id, name: "Иван", phone: "+79990000000", userId: user.id }), messageEnvelope).message;
    expect(contact).toMatchObject({ text: "👤 Иван", attachments: [{ kind: "contact", meta: { name: "Иван", phone: "+79990000000", userId: user.id } }] });
    const phoneOnly = expectOk(await b.client.post("sendContact", { chatId: dm.id, phone: "+70000000000" }), messageEnvelope).message;
    expect(phoneOnly.text).toBe("👤 +70000000000");
    expect(phoneOnly.attachments).toEqual([{ kind: "contact", meta: { phone: "+70000000000" } }]);
  });

  test("sendMediaGroup: до 10 элементов, вид по умолчанию image", async () => {
    const { baseUrl } = server();
    const [owner, user, outsider] = await registerUsers(baseUrl, 3);
    const b = await createBot(owner, "Альбом");
    const dm = await startBot(user, b);
    const foreign = await createDm(user, outsider);

    for (const items of [undefined, [], [{ kind: "image" }, null, { url: 5 }]]) {
      expectError(await b.client.post("sendMediaGroup", { chatId: dm.id, items }), 400, "items is required");
    }
    expectError(await b.client.post("sendMediaGroup", { chatId: foreign.id, items: [{ url: "https://a.example/1" }] }), 404, NOT_MEMBER);

    const items = [
      { url: "https://a.example/1", kind: "video", name: "клип" },
      { url: "https://a.example/2", kind: "sticker" },
      { url: "https://a.example/3" },
      ...Array.from({ length: 10 }, (_, i) => ({ url: `https://a.example/x${i}`, kind: "file" })),
    ];
    const m = expectOk(await b.client.post("sendMediaGroup", { chatId: dm.id, items, caption: "Альбом" }), messageEnvelope).message;
    expect(m.text).toBe("Альбом");
    expect(m.attachments).toHaveLength(10);
    expect(m.attachments?.slice(0, 3)).toEqual([
      { kind: "video", url: "https://a.example/1", name: "клип" },
      { kind: "image", url: "https://a.example/2", name: "sticker" },
      { kind: "image", url: "https://a.example/3", name: "file" },
    ]);
    expect(expectOk(await b.client.post("sendMediaGroup", { chatId: dm.id, items: [{ url: "https://a.example/1" }] }), messageEnvelope).message.text).toBe("🖼");
  });
});

describe("стикер, опрос, реакция", () => {
  test("sendSticker", async () => {
    const { baseUrl } = server();
    const [owner, user, outsider] = await registerUsers(baseUrl, 3);
    const b = await createBot(owner, "Стикеры");
    const dm = await startBot(user, b);
    const foreign = await createDm(user, outsider);
    const [userWs, outWs] = await Promise.all([ws(user), ws(outsider)]);

    expectError(await b.client.post("sendSticker", { chatId: dm.id }), 400, "emoji is required");
    expectError(await b.client.post("sendSticker", { chatId: foreign.id, emoji: "😀" }), 404, NOT_MEMBER);

    const m = expectOk(await b.client.post("sendSticker", { chatId: dm.id, emoji: "😀😀😀😀😀", name: "n".repeat(80), scene: "s".repeat(50) }), messageEnvelope).message;
    // id не через genId — m_<время>_<5 символов>.
    expect(m.id).toMatch(/^m_\d+_[a-z0-9]{1,5}$/);
    expect(m).toMatchObject({ type: "sticker", text: "", senderId: b.id, replyToId: null });
    expect(m.sticker).toEqual({ emoji: "😀😀😀😀", name: "n".repeat(60), scene: "s".repeat(40) });
    await userWs.waitFor("message:new", (e) => e.message?.id === m.id);
    await outWs.expectNone("message:new");
    const bare = expectOk(await b.client.post("sendSticker", { chatId: dm.id, emoji: "🔥", replyToId: m.id }), messageEnvelope).message;
    expect(bare.sticker).toEqual({ emoji: "🔥" });
    expect(bare.replyToId).toBe(m.id);
  });

  test("sendSticker — те же проверки отправки, что у sendMessage", async () => {
    const { baseUrl } = server();
    const [owner, user, sub] = await registerUsers(baseUrl, 3);
    const b = await createBot(owner, "Обход");
    const dm = await startBot(user, b);
    await user.api.post(`/api/users/${b.id}/block`, { blocked: true });
    const channel = await channelWithBot(owner, [sub], b, { admin: false });
    const subWs = await ws(sub);
    // Заблокировавшему бота стикер не доходит, в канал без админки — не публикуется.
    expectError(await b.client.post("sendSticker", { chatId: dm.id, emoji: "😈" }), 403, "User has blocked the bot");
    expectError(await b.client.post("sendSticker", { chatId: channel.id, emoji: "😈" }), 403, "Bot must be an admin to post in a channel");
    await subWs.expectNone("message:new");
    expect((await user.api.get(`/api/chats/${dm.id}/messages`)).body.messages.some((x: any) => x.type === "sticker")).toBe(false);
  });

  test("sendPoll: проверки, опрос как у людей, голосовать можно", async () => {
    const { baseUrl } = server();
    const [owner, user, outsider] = await registerUsers(baseUrl, 3);
    const b = await createBot(owner, "Опросник");
    const group = await groupWithBot(owner, [user], b);
    const foreign = await createDm(user, outsider);

    expectError(await b.client.post("sendPoll", { chatId: group.id, options: ["a", "b"] }), 400, "question is required");
    expectError(await b.client.post("sendPoll", { chatId: group.id, question: "?", options: ["a", ""] }), 400, "at least two options are required");
    expectError(await b.client.post("sendPoll", { chatId: group.id, question: "?", options: "a,b" }), 400, "at least two options are required");
    expectError(await b.client.post("sendPoll", { chatId: foreign.id, question: "?", options: ["a", "b"] }), 404, NOT_MEMBER);

    const options = ["o".repeat(150), ...Array.from({ length: 9 }, (_, i) => `v${i}`)];
    const m = expectOk(await b.client.post("sendPoll", { chatId: group.id, question: "Куда?", options }), messageEnvelope).message;
    expect(m.text).toBe("Куда?");
    expect(m.attachments).toEqual([
      {
        kind: "poll",
        meta: {
          options: ["o".repeat(120), ...Array.from({ length: 7 }, (_, i) => `v${i}`)],
          voterIds: Array(8).fill([]),
          votes: Array(8).fill(0),
          correctIndex: null,
          multiple: false,
          closed: false,
        },
      },
    ]);
    const voted = expectOk(await user.api.post(`/api/chats/${group.id}/messages/${m.id}/vote`, { optionIndex: 1 }), messageEnvelope).message;
    expect((voted.attachments?.[0] as any).meta.votes[1]).toBe(1);
  });

  test("sendReaction: переключает реакцию бота, WS участникам", async () => {
    const { baseUrl } = server();
    const [owner, user, outsider] = await registerUsers(baseUrl, 3);
    const b = await createBot(owner, "Реакции");
    const dm = await startBot(user, b);
    const msg = await sendText(user, dm.id, "оцени");
    const foreignDm = await createDm(user, outsider);
    const foreign = await sendText(user, foreignDm.id, "чужое");
    const [userWs, outWs] = await Promise.all([ws(user), ws(outsider)]);

    expectError(await b.client.post("sendReaction", { messageId: msg.id }), 400, "emoji is required");
    expectError(await b.client.post("sendReaction", { messageId: "m_nope0000", emoji: "👍" }), 404, "Message not found");
    expectError(await b.client.post("sendReaction", { messageId: foreign.id, emoji: "👍" }), 404, NOT_MEMBER);

    const on = expectOk(await b.client.post("sendReaction", { messageId: msg.id, emoji: "👍" }), messageEnvelope).message;
    expect(on.reactions).toEqual([{ emoji: "👍", userIds: [b.id] }]);
    expectShape(wsMessageUpdated, await userWs.waitFor("message:updated", (e) => e.message?.id === msg.id));
    await outWs.expectNone("message:updated");
    const off = expectOk(await b.client.post("sendReaction", { messageId: msg.id, emoji: "👍" }), messageEnvelope).message;
    expect(off.reactions).toEqual([]);
  });
});

describe("copyMessage / forwardMessage", () => {
  test("копия: без подписи пересылки; проверки источника", async () => {
    const { baseUrl } = server();
    const [owner, user, outsider] = await registerUsers(baseUrl, 3);
    const b = await createBot(owner, "Копир");
    const dm = await startBot(user, b);
    const group = await groupWithBot(owner, [user], b);
    const src = await sendText(user, group.id, "оригинал");
    const foreignDm = await createDm(user, outsider);
    const foreign = await sendText(user, foreignDm.id, "чужое");

    expectError(await b.client.post("copyMessage", { chatId: dm.id, messageId: "m_nope0000" }), 404, "Message not found");
    expectError(await b.client.post("copyMessage", { chatId: dm.id, messageId: foreign.id }), 404, "Bot is not a member of that chat");
    expectError(await b.client.post("copyMessage", { chatId: foreignDm.id, messageId: src.id }), 404, NOT_MEMBER);

    const copy = expectOk(await b.client.post("copyMessage", { chatId: dm.id, messageId: src.id }), messageEnvelope).message;
    expect(copy).toMatchObject({ chatId: dm.id, senderId: b.id, text: "оригинал" });
    expect(copy).not.toHaveProperty("forwardedFrom");
    const sticker = expectOk(await b.client.post("sendSticker", { chatId: group.id, emoji: "🙂" }), messageEnvelope).message;
    // Без текста — «📎»; тип стикера не переносится.
    const copied = expectOk(await b.client.post("copyMessage", { chatId: dm.id, messageId: sticker.id }), messageEnvelope).message;
    expect(copied).toMatchObject({ type: "text", text: "📎" });
    expect(copied).not.toHaveProperty("sticker");
  });

  test("пересылка: подпись источника, канал — только админом", async () => {
    const { baseUrl } = server();
    const [owner, user, sub] = await registerUsers(baseUrl, 3);
    const b = await createBot(owner, "Пересыльщик");
    const dm = await startBot(user, b);
    const group = await groupWithBot(owner, [user], b, { title: "Клуб" });
    const src = await sendText(user, group.id, "новость");
    const userWs = await ws(user);

    expectError(await b.client.post("forwardMessage", { messageId: "m_nope0000", toChatId: dm.id }), 404, "Message not found");
    expectError(await b.client.post("forwardMessage", { messageId: src.id, toChatId: "c_nope0000" }), 404, NOT_MEMBER);
    const channel = await channelWithBot(owner, [sub], b, { admin: false });
    expectError(await b.client.post("forwardMessage", { messageId: src.id, toChatId: channel.id }), 403, "Bot must be an admin to post in a channel");

    const fwd = expectOk(await b.client.post("forwardMessage", { messageId: src.id, toChatId: dm.id }), messageEnvelope).message;
    expect(fwd.forwardedFrom).toEqual({ chatId: group.id, chatTitle: "Клуб", senderId: user.id, senderName: user.name });
    expect(fwd).toMatchObject({ chatId: dm.id, senderId: b.id, text: "новость", type: "text" });
    expect(fwd.id).toMatch(/^m_\d+_[a-z0-9]{1,5}$/);
    await userWs.waitFor("message:new", (e) => e.message?.id === fwd.id);
    // Повторная пересылка сохраняет исходную подпись; из лички подпись — имя собеседника.
    const again = expectOk(await b.client.post("forwardMessage", { messageId: fwd.id, toChatId: group.id }), messageEnvelope).message;
    expect(again.forwardedFrom).toEqual(fwd.forwardedFrom);
    const mine = await sendText(user, dm.id, "в личку");
    const fromDm = expectOk(await b.client.post("forwardMessage", { messageId: mine.id, toChatId: group.id }), messageEnvelope).message;
    expect(fromDm.forwardedFrom).toEqual({ chatId: dm.id, chatTitle: user.name, senderId: user.id, senderName: user.name });

    // Пост канала подписывается названием канала.
    const adminChannel = await channelWithBot(owner, [sub], b, { title: "Вести" });
    const post = await sendText(owner, adminChannel.id, "пост");
    const fromChannel = expectOk(await b.client.post("forwardMessage", { messageId: post.id, toChatId: dm.id }), messageEnvelope).message;
    expect(fromChannel.forwardedFrom).toEqual({ chatId: adminChannel.id, chatTitle: "Вести", senderName: "Вести" });

    // Пересылка, как и sendMessage, не доходит заблокировавшему бота.
    await user.api.post(`/api/users/${b.id}/block`, { blocked: true });
    expectError(await b.client.post("sendMessage", { chatId: dm.id, text: "x" }), 403, "User has blocked the bot");
    expectError(await b.client.post("forwardMessage", { messageId: src.id, toChatId: dm.id }), 403, "User has blocked the bot");
  });

  test("защищённая личка: копировать и пересылать нельзя", async () => {
    const { baseUrl } = server();
    const owner = await registerUser(baseUrl);
    const p = await registerPremiumUser(baseUrl);
    const b = await createBot(owner, "Защита");
    const dm = await startBot(p, b);
    const group = await groupWithBot(owner, [p], b);
    const secret = await sendText(p, dm.id, "секрет");
    expect((await p.api.post(`/api/chats/${dm.id}/protect`, { enabled: true })).status).toBe(200);

    expectError(await b.client.post("forwardMessage", { messageId: secret.id, toChatId: group.id }), 403, "Forwarding is disabled in this chat");
    expectError(await b.client.post("copyMessage", { messageId: secret.id, chatId: group.id }), 403, "Copying is disabled in this chat");
  });
});

describe("sendMessageToUser — бот пишет первым", () => {
  test("по id и юзернейму; проверки получателя", async () => {
    const { baseUrl } = server();
    const [owner, user, blocker, shy, outsider] = await registerUsers(baseUrl, 5);
    const b = await createBot(owner, "Первый шаг");
    const otherBot = await createBot(owner, "Другой бот");
    await blocker.api.post(`/api/users/${b.id}/block`, { blocked: true });
    expect((await shy.api.patch("/api/settings", { privacy: { botMessages: "nobody" } })).status).toBe(200);
    const [userWs, outWs] = await Promise.all([ws(user), ws(outsider)]);

    expectError(await b.client.post("sendMessageToUser", { userId: user.id }), 400, "text is required");
    expectError(await b.client.post("sendMessageToUser", { userId: "u_nope0000", text: "x" }), 404, "Пользователь не найден");
    expectError(await b.client.post("sendMessageToUser", { username: "nobody_x_y", text: "x" }), 404, "Пользователь не найден");
    expectError(await b.client.post("sendMessageToUser", { userId: otherBot.id, text: "x" }), 403, "Ботам боты не пишут");
    expectError(await b.client.post("sendMessageToUser", { userId: blocker.id, text: "x" }), 403, "Пользователь заблокировал этого бота");
    expectError(await b.client.post("sendMessageToUser", { userId: shy.id, text: "x" }), 403, "Пользователь ограничил ботам возможность писать первыми");

    const res = expectOk(await b.client.post("sendMessageToUser", { username: `@${user.username}`, text: "Здравствуйте", keyboard: [[{ text: "Ок", action: "ok" }]] }), sendToUserBody);
    expect(res.user.id).toBe(user.id);
    expect(res.user).not.toHaveProperty("phone");
    expect(res.message).toMatchObject({ chatId: res.chatId, senderId: b.id, text: "Здравствуйте", keyboard: [[{ text: "Ок", action: "ok" }]] });
    await userWs.waitFor("message:new", (e) => e.message?.id === res.message.id);
    await outWs.expectNone("message:new");
    const chats = (await user.api.get("/api/chats")).body.chats;
    expect(chats.find((c: any) => c.id === res.chatId)).toMatchObject({ type: "dm" });

    // Повторно — в ту же личку.
    expect(expectOk(await b.client.post("sendMessageToUser", { userId: user.id, text: "ещё" }), sendToUserBody).chatId).toBe(res.chatId);
  });

  test("не больше 20 новых разговоров в час; в существующие — можно", async () => {
    const { baseUrl } = server();
    const owner = await registerUser(baseUrl);
    const b = await createBot(owner, "Спамер");
    const users = await registerUsers(baseUrl, 21);
    const first = expectOk(await b.client.post("sendMessageToUser", { userId: users[0].id, text: "1" }), sendToUserBody);
    for (const u of users.slice(1, 20)) expectOk(await b.client.post("sendMessageToUser", { userId: u.id, text: "x" }), sendToUserBody);
    expectError(await b.client.post("sendMessageToUser", { userId: users[20].id, text: "x" }), 429, "Не больше 20 новых разговоров в час");
    expect(expectOk(await b.client.post("sendMessageToUser", { userId: users[0].id, text: "2" }), sendToUserBody).chatId).toBe(first.chatId);
    // Если человек сам запустил бота — это уже не новый разговор.
    const late = await registerUser(baseUrl);
    await startBot(late, b);
    expectOk(await b.client.post("sendMessageToUser", { userId: late.id, text: "x" }), sendToUserBody);
    // Счётчик — на бота: у другого бота свой лимит.
    const other = await createBot(owner, "Другой");
    expectOk(await other.client.post("sendMessageToUser", { userId: users[20].id, text: "x" }), sendToUserBody);
  });
});

test("бот не в группе — 404 для отправки", async () => {
  const { baseUrl } = server();
  const [owner, user] = await registerUsers(baseUrl, 2);
  const b = await createBot(owner, "Чужак");
  const group = await createGroup(owner, [user]);
  expectError(await b.client.post("sendMessage", { chatId: group.id, text: "x" }), 404, NOT_MEMBER);
  expectError(await b.client.post("sendSticker", { chatId: group.id, emoji: "x" }), 404, NOT_MEMBER);
});
