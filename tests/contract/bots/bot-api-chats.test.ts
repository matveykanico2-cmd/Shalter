// Bot API: чаты и люди глазами бота (getChats, getChat, getUser,
// getUserStatus, getCommonChats, resolveUsername), профиль и команды бота,
// статистика, выход из чата, создание группы ботом.
import { describe, expect, test } from "vitest";
import {
  botUserBody,
  commandsBody,
  createdGroupBody,
  commonChatsBody,
  getChatBody,
  getChatsBody,
  getUserBody,
  myStatsBody,
  resolveChatBody,
  resolveUserBody,
  userStatusBody,
} from "../../schemas/bots";
import { okBody } from "../../schemas/common";
import { chatAdded, chatUpdated } from "../../schemas/ws";
import { expectError, expectOk, expectShape } from "../../support/expect";
import { createChannel, createDm, createGroup, registerUser, registerUsers, sendText, uniq } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { createBot, groupWithBot, NOT_MEMBER, startBot, wsPool } from "./helpers";

const server = useServer();
const ws = wsPool();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("getChats / getChat", () => {
  test("чаты бота и карточка чата с участниками", async () => {
    const { baseUrl } = server();
    const [owner, user, outsider] = await registerUsers(baseUrl, 3);
    const b = await createBot(owner, "Обзор");
    const dm = await startBot(user, b);
    const group = await groupWithBot(owner, [user], b, { title: "Команда" });
    const plain = await groupWithBot(owner, [], b, { admin: false, title: "Без прав" });
    const foreign = await createDm(user, outsider);

    const chats = expectOk(await b.client.get("getChats"), getChatsBody).chats;
    expect(chats.map((c) => c.id).sort()).toEqual([dm.id, group.id, plain.id].sort());
    expect(chats.find((c) => c.id === group.id)).toEqual({ id: group.id, type: "group", title: "Команда", username: null, memberCount: 3, isAdmin: true });
    expect(chats.find((c) => c.id === plain.id)).toMatchObject({ isAdmin: false, memberCount: 2 });
    expect(chats.find((c) => c.id === dm.id)).toMatchObject({ type: "dm", memberCount: 2, isAdmin: false });

    const card = expectOk(await b.client.get("getChat", { chatId: group.id }), getChatBody);
    expect(card.chat).toEqual({ id: group.id, type: "group", title: "Команда", username: null, description: null, memberCount: 3, isAdmin: true });
    expect(card.members.map((m) => m.id).sort()).toEqual([owner.id, user.id, b.id].sort());
    for (const m of card.members) expect(m).not.toHaveProperty("phone");

    expectError(await b.client.get("getChat", { chatId: foreign.id }), 404, NOT_MEMBER);
    expectError(await b.client.get("getChat"), 404, NOT_MEMBER);
  });
});

describe("getUser / getUserStatus / getCommonChats / resolveUsername", () => {
  test("профиль, статус и поиск по юзернейму — с учётом приватности", async () => {
    const { baseUrl } = server();
    const [owner, user] = await registerUsers(baseUrl, 2);
    const b = await createBot(owner, "Справочник");
    await startBot(user, b);
    expect((await user.api.patch(`/api/users/${user.id}`, { bio: "Обо мне" })).status).toBe(200);
    expect((await user.api.patch("/api/settings", { privacy: { bio: "nobody", lastSeen: "nobody" } })).status).toBe(200);
    const userWs = await ws(user);

    expectError(await b.client.get("getUser", { userId: "u_nope0000" }), 404, "User not found");
    const viewed = expectOk(await b.client.get("getUser", { userId: user.id }), getUserBody).user;
    expect(viewed).toMatchObject({ id: user.id, name: user.name, online: false });
    expect(viewed).not.toHaveProperty("bio");
    expect(viewed).not.toHaveProperty("lastSeen");
    expect(viewed).not.toHaveProperty("phone");

    expectError(await b.client.get("getUserStatus", { userId: "u_nope0000" }), 404, "User not found");
    // Статус — с учётом настройки приватности lastSeen: пока открыт, бот видит «в сети»…
    expect((await user.api.patch("/api/settings", { privacy: { bio: "nobody", lastSeen: "everyone" } })).status).toBe(200);
    let status = expectOk(await b.client.get("getUserStatus", { userId: user.id }), userStatusBody);
    for (let i = 0; i < 40 && !status.online; i++) {
      await sleep(100);
      status = expectOk(await b.client.get("getUserStatus", { userId: user.id }), userStatusBody);
    }
    expect(status.online).toBe(true);
    // …а со скрытым lastSeen — ни «в сети», ни времени визита, хотя он всё ещё подключён.
    expect((await user.api.patch("/api/settings", { privacy: { bio: "nobody", lastSeen: "nobody" } })).status).toBe(200);
    expect(expectOk(await b.client.get("getUserStatus", { userId: user.id }), userStatusBody)).toEqual({ online: false, lastSeen: null });
    await userWs.close();
    // Бот, как и в профиле (publicUser), всегда online: false.
    expect(expectOk(await b.client.get("getUserStatus", { userId: b.id }), userStatusBody).online).toBe(false);

    expectError(await b.client.get("resolveUsername"), 400, "username is required");
    expectError(await b.client.get("resolveUsername", { username: " @ " }), 400, "username is required");
    const resolved = expectOk(await b.client.get("resolveUsername", { username: `@${user.username}` }), resolveUserBody);
    expect(resolved.user.id).toBe(user.id);
    // bio и lastSeen скрыты настройкой приватности — как в getUser.
    expect(resolved.user).not.toHaveProperty("bio");
    expect(resolved.user).not.toHaveProperty("lastSeen");
    expect(resolved.user).not.toHaveProperty("phone");

    const handle = uniq("pubch");
    const channel = await createChannel(owner, [user], { isPublic: true, username: handle, title: "Публичный" });
    expect(expectOk(await b.client.get("resolveUsername", { username: handle }), resolveChatBody)).toEqual({
      kind: "channel",
      chat: { id: channel.id, type: "channel", title: "Публичный", username: handle, memberCount: 2 },
    });
    expectError(await b.client.get("resolveUsername", { username: "nobody_here_zz" }), 404, "Not found");
  });

  test("getCommonChats — только чаты бота, где есть человек", async () => {
    const { baseUrl } = server();
    const [owner, user, other] = await registerUsers(baseUrl, 3);
    const b = await createBot(owner, "Общие");
    const dm = await startBot(user, b);
    const group = await groupWithBot(owner, [user], b, { title: "Вместе" });
    await groupWithBot(owner, [other], b);
    await createGroup(owner, [user]);

    expectError(await b.client.get("getCommonChats", { userId: "u_nope0000" }), 404, "User not found");
    const common = expectOk(await b.client.get("getCommonChats", { userId: user.id }), commonChatsBody).chats;
    expect(common.map((c) => c.id).sort()).toEqual([dm.id, group.id].sort());
    expect(common.find((c) => c.id === group.id)).toEqual({ id: group.id, type: "group", title: "Вместе" });
  });
});

describe("команды и профиль бота", () => {
  test("setMyCommands / getMyCommands", async () => {
    const owner = await registerUser(server().baseUrl);
    const b = await createBot(owner, "Команды");
    expect(expectOk(await b.client.get("getMyCommands"), commandsBody).commands).toEqual([]);

    const set = expectOk(
      await b.client.post("setMyCommands", {
        commands: [{ command: " /Help ", description: " помощь " }, { command: 5 }, { command: "  " }, null, { command: "x".repeat(40), description: "d".repeat(200) }],
      }),
      commandsBody,
    ).commands;
    // В отличие от PUT /api/bots/:id/commands: регистр и символы не чистятся, описание не обрезается по краям.
    expect(set).toEqual([
      { command: "Help", description: " помощь " },
      { command: "x".repeat(32), description: "d".repeat(120) },
    ]);
    expect(expectOk(await b.client.get("getMyCommands"), commandsBody).commands).toEqual(set);
    expect((await owner.api.get(`/api/bots/${b.id}`)).body.bot.commands).toEqual(set);

    const many = Array.from({ length: 60 }, (_, i) => ({ command: `c${i}` }));
    expect(expectOk(await b.client.post("setMyCommands", { commands: many }), commandsBody).commands).toHaveLength(50);
    expect(expectOk(await b.client.post("setMyCommands", {}), commandsBody).commands).toEqual([]);
  });

  test("setMyProfile / setMyAvatar", async () => {
    const owner = await registerUser(server().baseUrl);
    const b = await createBot(owner, "Профиль");

    let me = expectOk(await b.client.post("setMyProfile", { name: `  ${"Я".repeat(100)}  `, description: "о".repeat(600) }), botUserBody).bot;
    expect(me.name).toBe("Я".repeat(80));
    expect((await owner.api.get(`/api/bots/${b.id}`)).body.bot.description).toBe("о".repeat(500));
    // Пустое имя не меняет, отсутствие описания — тоже.
    me = expectOk(await b.client.post("setMyProfile", { name: "  " }), botUserBody).bot;
    expect(me.name).toBe("Я".repeat(80));
    expect((await owner.api.get(`/api/bots/${b.id}`)).body.bot.description).toBe("о".repeat(500));

    for (const image of [undefined, 5, null]) {
      expectError(await b.client.post("setMyAvatar", { image }), 400, "image is required (URL или data:-строка)");
    }
    // ПОВЕДЕНИЕ-ВОПРОС: адрес аватара не проверяется — принимается любая строка.
    expect(expectOk(await b.client.post("setMyAvatar", { image: "javascript:alert(1)" }), botUserBody).bot.avatarImage).toBe("javascript:alert(1)");
    expect(expectOk(await b.client.post("setMyAvatar", { image: "" }), botUserBody).bot).not.toHaveProperty("avatarImage");
  });
});

describe("getMyStats", () => {
  test("чаты, отправленные сообщения и люди", async () => {
    const { baseUrl } = server();
    const [owner, a, c] = await registerUsers(baseUrl, 3);
    const b = await createBot(owner, "Статист");
    expect(expectOk(await b.client.get("getMyStats"), myStatsBody)).toEqual({ chats: 0, messagesSent: 0, people: 0 });
    const dm = await startBot(a, b);
    await groupWithBot(owner, [a, c], b);
    await b.client.post("sendMessage", { chatId: dm.id, text: "1" });
    await b.client.post("sendSticker", { chatId: dm.id, emoji: "🙂" });
    await sendText(a, dm.id, "не считается");
    expect(expectOk(await b.client.get("getMyStats"), myStatsBody)).toEqual({ chats: 2, messagesSent: 2, people: 3 });
  });
});

describe("leaveChat", () => {
  test("бот выходит; оставшимся — chat:updated", async () => {
    const { baseUrl } = server();
    const [owner, user, outsider] = await registerUsers(baseUrl, 3);
    const b = await createBot(owner, "Уходящий");
    const group = await groupWithBot(owner, [user], b);
    const foreign = await createDm(user, outsider);
    const [userWs, outWs] = await Promise.all([ws(user), ws(outsider)]);

    expectError(await b.client.post("leaveChat", { chatId: foreign.id }), 404, NOT_MEMBER);
    expectOk(await b.client.post("leaveChat", { chatId: group.id }), okBody);
    const ev = expectShape(chatUpdated, await userWs.waitFor("chat:updated", (e) => e.chat?.id === group.id));
    expect(ev.chat.memberIds).not.toContain(b.id);
    await outWs.expectNone("chat:updated");
    expect(expectOk(await b.client.get("getChats"), getChatsBody).chats).toEqual([]);
    expectError(await b.client.post("leaveChat", { chatId: group.id }), 404, NOT_MEMBER);
    expect((await owner.api.get(`/api/chats/${group.id}`)).body.chat.memberIds).not.toContain(b.id);
  });
});

describe("createGroup", () => {
  test("в группу попадают только знакомые боту и разрешившие приглашения", async () => {
    const { baseUrl } = server();
    const [owner, known, shy, stranger] = await registerUsers(baseUrl, 4);
    const b = await createBot(owner, "Основатель");
    await startBot(known, b);
    await startBot(shy, b);
    expect((await shy.api.patch("/api/settings", { privacy: { invites: "nobody" } })).status).toBe(200);
    const [knownWs, strangerWs] = await Promise.all([ws(known), ws(stranger)]);

    expectError(await b.client.post("createGroup", { title: "  " }), 400, "title is required");
    const res = expectOk(
      await b.client.post("createGroup", { title: `  ${"Г".repeat(130)} `, memberIds: [known.id, known.id, shy.id, stranger.id, b.id, "u_nope0000"] }),
      createdGroupBody,
    );
    expect(res.chat).toMatchObject({ title: "Г".repeat(120), memberCount: 2 });

    const ev = expectShape(chatAdded, await knownWs.waitFor("chat:added", (e) => e.chat?.id === res.chat.id));
    expect(ev.chat).toMatchObject({ type: "group", ownerId: b.id, adminIds: [b.id] });
    expect(ev.chat.memberIds.sort()).toEqual([b.id, known.id].sort());
    await strangerWs.expectNone("chat:added");
    const list = (await known.api.get("/api/chats")).body.chats;
    expect(list.some((c: any) => c.id === res.chat.id)).toBe(true);

    // Без участников — группа из одного бота.
    expect(expectOk(await b.client.post("createGroup", { title: "Один" }), createdGroupBody).chat.memberCount).toBe(1);
  });
});
