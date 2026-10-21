// Сообщество целиком: создание, карточка, правка, удаление, списки (mine/joined/by-chat),
// участие (join/leave), личные настройки (prefs/mute/read) и список участников.
import { describe, expect, test } from "vitest";
import { chatCard } from "../../schemas/chats";
import { okBody } from "../../schemas/common";
import { banResultBody, byChatBody, communityBody, joinedBody, membersBody, mineBody } from "../../schemas/communities";
import { expectError, expectOk, expectShape } from "../../support/expect";
import { createChannel, createDm, createGroup, registerUser, sendText } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { download } from "../uploads/helpers";
import { fakeUploadUrl, uploadedUrl } from "../users/helpers";
import {
  aboutCommunity,
  anonymous,
  BANNED,
  createCommunity,
  NO_RIGHTS,
  NO_RIGHTS_SET,
  NOT_FOUND,
  NOT_MEMBER,
  OWNER_RIGHTS,
  admit,
  wsPool,
} from "./helpers";

const CLOSED = "Сообщество закрытое — вступить можно только по приглашению в один из его чатов";

const server = useServer();
const ws = wsPool();

describe("без сессии", () => {
  test("все маршруты /api/communities — 401", async () => {
    const api = anonymous(server().baseUrl);
    const id = "cm_whatever00";
    const u = "u_whatever00";
    for (const res of await Promise.all([
      api.get("/api/communities/mine"),
      api.get("/api/communities/joined"),
      api.get("/api/communities/by-chat/c_whatever00"),
      api.post("/api/communities", { title: "x" }),
      api.get(`/api/communities/${id}`),
      api.patch(`/api/communities/${id}`, {}),
      api.delete(`/api/communities/${id}`),
      api.post(`/api/communities/${id}/join`),
      api.post(`/api/communities/${id}/leave`),
      api.post(`/api/communities/${id}/prefs`, {}),
      api.post(`/api/communities/${id}/mute`, {}),
      api.post(`/api/communities/${id}/read`),
      api.get(`/api/communities/${id}/members`),
      api.post(`/api/communities/${id}/chats`, {}),
      api.patch(`/api/communities/${id}/chats/c_x0000000`, {}),
      api.delete(`/api/communities/${id}/chats/c_x0000000`),
      api.get(`/api/communities/${id}/requests`),
      api.post(`/api/communities/${id}/requests/all`, {}),
      api.get(`/api/communities/${id}/admins`),
      api.request("PUT", `/api/communities/${id}/admins/${u}`, { json: {} }),
      api.delete(`/api/communities/${id}/admins/${u}`),
      api.get(`/api/communities/${id}/bans`),
      api.get(`/api/communities/${id}/bans/${u}/preview`),
      api.request("PUT", `/api/communities/${id}/bans/${u}`, { json: {} }),
      api.delete(`/api/communities/${id}/bans/${u}`),
    ])) expectError(res, 401, "unauthorized");
  });

  test("несуществующее сообщество — 404 на всех маршрутах с :id", async () => {
    const a = await registerUser(server().baseUrl);
    const api = a.api;
    const id = "cm_nonexistent0";
    for (const res of await Promise.all([
      api.get(`/api/communities/${id}`),
      api.patch(`/api/communities/${id}`, { title: "x" }),
      api.delete(`/api/communities/${id}`),
      api.post(`/api/communities/${id}/join`),
      api.post(`/api/communities/${id}/leave`),
      api.post(`/api/communities/${id}/prefs`, {}),
      api.post(`/api/communities/${id}/mute`, { forever: true }),
      api.post(`/api/communities/${id}/read`),
      api.get(`/api/communities/${id}/members`),
      api.post(`/api/communities/${id}/chats`, {}),
      api.patch(`/api/communities/${id}/chats/c_x0000000`, { visible: true }),
      api.delete(`/api/communities/${id}/chats/c_x0000000`),
      api.get(`/api/communities/${id}/requests`),
      api.post(`/api/communities/${id}/requests/all`, {}),
      api.get(`/api/communities/${id}/admins`),
      api.request("PUT", `/api/communities/${id}/admins/${a.id}`, { json: {} }),
      api.delete(`/api/communities/${id}/admins/${a.id}`),
      api.get(`/api/communities/${id}/bans`),
      api.get(`/api/communities/${id}/bans/${a.id}/preview`),
      api.request("PUT", `/api/communities/${id}/bans/${a.id}`, { json: {} }),
      api.delete(`/api/communities/${id}/bans/${a.id}`),
    ])) expectError(res, 404, NOT_FOUND);
  });
});

describe("POST /api/communities", () => {
  test("создание без чата: владелец, права, значения по умолчанию", async () => {
    const a = await registerUser(server().baseUrl);
    const res = await a.api.post("/api/communities", {
      title: "  Клуб  ",
      description: "  О нас  ",
      avatarColor: "#0123456789abcdefghijklmn",
      addMode: "nonsense",
    });
    const c = expectOk(res, communityBody).community;
    expect(c).toEqual({
      id: c.id,
      title: "Клуб",
      description: "О нас",
      avatarColor: "#0123456789abcdefghi",
      avatarImage: null,
      addMode: "all",
      role: "owner",
      isOwner: true,
      isMember: true,
      isBanned: false,
      rights: OWNER_RIGHTS,
      addPolicy: "add",
      pinned: false,
      collapsed: true,
      chats: [],
      isClosed: true,
      membersCount: 1,
      adminsCount: 1,
      bannedCount: 0,
      requestsCount: 0,
    });
    // Название обрезается до 128, описание — до 255 символов.
    const long = expectOk(await a.api.post("/api/communities", { title: "x".repeat(200), description: "y".repeat(300), addMode: "admins" }), communityBody).community;
    expect(long.title).toHaveLength(128);
    expect(long.description).toHaveLength(255);
    expect(long.addMode).toBe("admins");
    expect(long.description).not.toBeNull();
    // Пустое описание хранится как null.
    expect(expectOk(await a.api.post("/api/communities", { title: "z", description: "   " }), communityBody).community.description).toBeNull();
  });

  test("ошибки валидации", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const notMine = await createGroup(b, []);
    const asMember = await createGroup(b, [a]);
    const dm = await createDm(a, b);
    const mine = await createGroup(a, []);

    expectError(await a.api.post("/api/communities", {}), 400, "Введите название сообщества");
    expectError(await a.api.post("/api/communities", { title: "   " }), 400, "Введите название сообщества");
    expectError(await a.api.post("/api/communities", { title: "x", avatarImage: "javascript:alert(1)" }), 400, "Некорректное изображение");
    expectError(await a.api.post("/api/communities", { title: "x", avatarImage: 42 }), 400, "Некорректное изображение");
    expectError(await a.api.post("/api/communities", { title: "x", chatId: "c_nonexistent00" }), 404, "Чат не найден");
    expectError(await a.api.post("/api/communities", { title: "x", chatId: notMine.id }), 404, "Чат не найден");
    expectError(await a.api.post("/api/communities", { title: "x", chatId: dm.id }), 400, "В сообщество добавляются группы и каналы");
    expectError(
      await a.api.post("/api/communities", { title: "x", chatId: asMember.id }),
      403,
      "Добавить чат может только его владелец или администратор"
    );
    // Чат проверяется раньше аватара.
    expectError(await a.api.post("/api/communities", { title: "x", chatId: dm.id, avatarImage: "bad" }), 400, "В сообщество добавляются группы и каналы");

    await createCommunity(a, { chatId: mine.id });
    expectError(await a.api.post("/api/communities", { title: "x", chatId: mine.id }), 409, "Этот чат уже входит в сообщество");
  });

  test("создание с первым чатом: служебная строка, community:updated участникам чата", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const outsider = await registerUser(baseUrl);
    const group = await createGroup(a, [b]);
    const [bWs, outWs] = await Promise.all([ws(b), ws(outsider)]);

    const c = expectOk(
      await a.api.post("/api/communities", { title: "Клуб", chatId: group.id, avatarImage: "https://example.invalid/a.png" }),
      communityBody
    ).community;
    expect(c.avatarImage).toBe("https://example.invalid/a.png");
    expect(c.chats).toEqual([
      {
        id: group.id,
        type: "group",
        title: "Группа",
        username: null,
        avatarColor: group.avatarColor,
        avatarImage: null,
        isPublic: false,
        approveJoins: false,
        members: 2,
        isMember: true,
        isChatAdmin: true,
        visible: true,
        addedBy: a.id,
      },
    ]);
    // Участник чата сообщества — участник и самого сообщества.
    expect(c.membersCount).toBe(2);

    await bWs.waitFor("community:updated", aboutCommunity(c.id));
    const line = await bWs.waitFor("message:new", (e) => e.chatId === group.id && e.message?.type === "system");
    expect(line.message).toMatchObject({ senderId: "bot_shalter", text: "Группа добавлена в сообщество «Клуб»" });
    await outWs.expectNone("community:updated");

    const asB = expectOk(await b.api.get(`/api/communities/${c.id}`), communityBody).community;
    expect(asB).toMatchObject({ role: "member", isOwner: false, isMember: true, rights: NO_RIGHTS_SET, addPolicy: "add" });
    expect(asB.chats[0]).toMatchObject({ isMember: true, isChatAdmin: false });
  });

  test("канал при создании: «Канал добавлен …»; chatVisible:false прячет чат от посторонних", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const sub = await registerUser(baseUrl);
    const outsider = await registerUser(baseUrl);
    const channel = await createChannel(a, [sub]);
    const subWs = await ws(sub);

    const c = expectOk(await a.api.post("/api/communities", { title: "Медиа", chatId: channel.id, chatVisible: "0" }), communityBody).community;
    expect(c.chats).toHaveLength(1);
    expect(c.chats[0]).toMatchObject({ id: channel.id, type: "channel", visible: false });
    await subWs.waitFor("message:new", (e) => e.chatId === channel.id && e.message?.text === "Канал добавлен в сообщество «Медиа»");

    // Подписчик скрытого чата видит его, посторонний — нет.
    expect(expectOk(await sub.api.get(`/api/communities/${c.id}`), communityBody).community.chats.map((x) => x.id)).toEqual([channel.id]);
    const outView = expectOk(await outsider.api.get(`/api/communities/${c.id}`), communityBody).community;
    expect(outView).toMatchObject({ role: null, isMember: false, isBanned: false, addPolicy: null, chats: [], rights: NO_RIGHTS_SET });
    // Закрытое сообщество постороннему — только название и аватар, без описания и состава.
    expect(outView).toMatchObject({ title: "Медиа", isClosed: true, description: null, membersCount: null, adminsCount: null });
    expect(expectOk(await sub.api.get(`/api/communities/${c.id}`), communityBody).community).toMatchObject({ isClosed: true, membersCount: 2 });
  });
});

describe("GET /mine, /joined, /by-chat/:chatId", () => {
  test("списки сообществ пользователя", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const outsider = await registerUser(baseUrl);
    const shown = await createGroup(a, [b]);
    const hidden = await createGroup(a, []);
    const c = await createCommunity(a, { title: "Открытое", chatId: shown.id, addMode: "admins" });
    expectOk(await a.api.post(`/api/communities/${c.id}/chats`, { chatId: hidden.id, visible: false }), communityBody);

    const mineA = expectOk(await a.api.get("/api/communities/mine"), mineBody).communities;
    expect(mineA).toContainEqual({ id: c.id, title: "Открытое", avatarColor: null, avatarImage: null, chatCount: 2, addPolicy: "add" });
    // Обычный участник при «только админы» может лишь предложить чат.
    const mineB = expectOk(await b.api.get("/api/communities/mine"), mineBody).communities;
    expect(mineB).toEqual([{ id: c.id, title: "Открытое", avatarColor: null, avatarImage: null, chatCount: 2, addPolicy: "suggest" }]);
    expect(expectOk(await outsider.api.get("/api/communities/mine"), mineBody).communities).toEqual([]);

    const joinedA = expectOk(await a.api.get("/api/communities/joined"), joinedBody).communities.find((x) => x.id === c.id)!;
    expect(joinedA).toEqual({
      id: c.id,
      title: "Открытое",
      description: null,
      avatarColor: null,
      avatarImage: null,
      role: "owner",
      isOwner: true,
      rights: OWNER_RIGHTS,
      addMode: "admins",
      pinned: false,
      collapsed: true,
      chatIds: [shown.id, hidden.id],
      requestsCount: 0,
    });
    const joinedB = expectOk(await b.api.get("/api/communities/joined"), joinedBody).communities;
    expect(joinedB).toHaveLength(1);
    // Скрытый чат, где B не состоит, в его список не попадает.
    expect(joinedB[0]).toMatchObject({ id: c.id, role: "member", isOwner: false, chatIds: [shown.id] });
    expect(expectOk(await outsider.api.get("/api/communities/joined"), joinedBody).communities).toEqual([]);
  });

  test("by-chat: сообщество чата и право убрать чат", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const outsider = await registerUser(baseUrl);
    const group = await createGroup(a, [b]);
    const lonely = await createGroup(a, [b]);
    const c = await createCommunity(a, { title: "Клуб", chatId: group.id });

    expect(expectOk(await a.api.get(`/api/communities/by-chat/${group.id}`), byChatBody)).toEqual({
      community: { id: c.id, title: "Клуб", avatarColor: null, avatarImage: null, isOwner: true, isMember: true, canRemoveChat: true },
    });
    expect(expectOk(await b.api.get(`/api/communities/by-chat/${group.id}`), byChatBody).community).toMatchObject({
      isOwner: false,
      isMember: true,
      canRemoveChat: false,
    });
    expect(expectOk(await a.api.get(`/api/communities/by-chat/${lonely.id}`), byChatBody)).toEqual({ community: null });
    expectError(await outsider.api.get(`/api/communities/by-chat/${group.id}`), 404, "not found");
    expectError(await a.api.get("/api/communities/by-chat/c_nonexistent00"), 404, "not found");

    // Публичный чат виден и не участнику.
    const pub = await createChannel(a, [], { isPublic: true, username: `club${Date.now().toString(36)}` });
    expect(pub.isPublic).toBe(true);
    expectOk(await a.api.post(`/api/communities/${c.id}/chats`, { chatId: pub.id }), communityBody);
    expect(expectOk(await outsider.api.get(`/api/communities/by-chat/${pub.id}`), byChatBody).community).toEqual({
      id: c.id,
      title: "Клуб",
      avatarColor: null,
      avatarImage: null,
      isOwner: false,
      isMember: false,
      canRemoveChat: false,
    });
    // С публичным чатом сообщество открытое: посторонний видит описание и число участников.
    expect(expectOk(await outsider.api.get(`/api/communities/${c.id}`), communityBody).community).toMatchObject({
      isClosed: false,
      membersCount: expect.any(Number),
    });
  });
});

describe("PATCH /api/communities/:id", () => {
  test("владелец меняет информацию и режим; участникам — community:updated", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const outsider = await registerUser(baseUrl);
    const group = await createGroup(a, [b]);
    const c = await createCommunity(a, { chatId: group.id, description: "было" });
    const [bWs, outWs] = await Promise.all([ws(b), ws(outsider)]);
    const avatar = await uploadedUrl(a);

    const updated = expectOk(
      await a.api.patch(`/api/communities/${c.id}`, {
        title: " Новое ",
        description: "стало",
        avatarImage: avatar,
        addMode: "admins",
      }),
      communityBody
    ).community;
    expect(updated).toMatchObject({ title: "Новое", description: "стало", avatarImage: avatar, addMode: "admins" });
    await bWs.waitFor("community:updated", aboutCommunity(c.id));
    await outWs.expectNone("community:updated");
    // Повторное сохранение того же аватара — без ошибок.
    expect(expectOk(await a.api.patch(`/api/communities/${c.id}`, { avatarImage: avatar }), communityBody).community.avatarImage).toBe(avatar);

    // Пустые значения стирают описание и аватар.
    const cleared = expectOk(await a.api.patch(`/api/communities/${c.id}`, { description: "", avatarImage: null }), communityBody).community;
    expect(cleared).toMatchObject({ title: "Новое", description: null, avatarImage: null, addMode: "admins" });
    expect(expectOk(await b.api.get(`/api/communities/${c.id}`), communityBody).community.title).toBe("Новое");
  });

  test("ошибки и права", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const outsider = await registerUser(baseUrl);
    const group = await createGroup(a, [b]);
    const c = await createCommunity(a, { chatId: group.id });

    expectError(await a.api.patch(`/api/communities/${c.id}`, { title: "  " }), 400, "Введите название сообщества");
    expectError(await a.api.patch(`/api/communities/${c.id}`, { avatarImage: "ftp://x" }), 400, "Некорректное изображение");
    // Чужая неприкреплённая загрузка и выдуманная ссылка — тоже (иначе файл открылся бы всем).
    const theirs = await uploadedUrl(b);
    for (const avatarImage of [theirs, fakeUploadUrl()]) {
      expectError(await a.api.patch(`/api/communities/${c.id}`, { avatarImage }), 400, "Некорректное изображение");
      expectError(await a.api.post("/api/communities", { title: "Чужое", avatarImage }), 400, "Некорректное изображение");
    }
    expect((await download(a.api, theirs)).status).toBe(404);
    expectError(await a.api.patch(`/api/communities/${c.id}`, { addMode: "everyone" }), 400, "Некорректный режим добавления чатов");
    for (const body of [{ title: "x" }, { description: "x" }, { avatarImage: null }]) {
      expectError(await b.api.patch(`/api/communities/${c.id}`, body), 403, "Нет права менять информацию о сообществе");
      expectError(await outsider.api.patch(`/api/communities/${c.id}`, body), 403, "Нет права менять информацию о сообществе");
    }
    expectError(await b.api.patch(`/api/communities/${c.id}`, { addMode: "admins" }), 403, "Нет права менять список чатов");

    // Пустой PATCH: постороннему и участнику без прав — 403; владельцу — сообщество как есть, без рассылки.
    const bWs = await ws(b);
    expectError(await outsider.api.patch(`/api/communities/${c.id}`, {}), 403, NO_RIGHTS);
    expectError(await b.api.patch(`/api/communities/${c.id}`, {}), 403, NO_RIGHTS);
    expect(expectOk(await a.api.patch(`/api/communities/${c.id}`, {}), communityBody).community).toMatchObject({ title: "Сообщество", role: "owner" });
    await bWs.expectNone("community:updated", aboutCommunity(c.id), 300);
  });
});

describe("DELETE /api/communities/:id", () => {
  test("удаляет только владелец; чаты остаются и свободны для другого сообщества", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const outsider = await registerUser(baseUrl);
    const group = await createGroup(a, [b]);
    const c = await createCommunity(a, { chatId: group.id });
    const [bWs, outWs] = await Promise.all([ws(b), ws(outsider)]);

    expectError(await b.api.delete(`/api/communities/${c.id}`), 403, NO_RIGHTS);
    expectError(await outsider.api.delete(`/api/communities/${c.id}`), 403, NO_RIGHTS);

    expect(expectOk(await a.api.delete(`/api/communities/${c.id}`), okBody)).toEqual({ ok: true });
    const ev = await bWs.waitFor("community:updated", aboutCommunity(c.id));
    expect(ev).toEqual({ type: "community:updated", communityId: c.id });
    await outWs.expectNone("community:updated");

    expectError(await a.api.get(`/api/communities/${c.id}`), 404, NOT_FOUND);
    expect(expectOk(await b.api.get("/api/communities/joined"), joinedBody).communities).toEqual([]);
    expect(expectOk(await a.api.get(`/api/communities/by-chat/${group.id}`), byChatBody)).toEqual({ community: null });
    expectOk(await b.api.get(`/api/chats/${group.id}`), chatCard);
    await createCommunity(a, { chatId: group.id });
  });
});

describe("участие: join / leave", () => {
  test("закрытое — посторонний не вступает; открытое — вступает, участник выходит, владелец выйти не может", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const outsider = await registerUser(baseUrl);
    const group = await createGroup(a, [b]);
    const c = await createCommunity(a, { chatId: group.id });

    expectError(await outsider.api.post(`/api/communities/${c.id}/leave`), 403, NOT_MEMBER);
    // Только приватная группа — сообщество закрытое: знать id недостаточно.
    expectError(await outsider.api.post(`/api/communities/${c.id}/join`), 403, CLOSED);
    expect(expectOk(await outsider.api.get(`/api/communities/${c.id}`), communityBody).community).toMatchObject({ isMember: false, isClosed: true, membersCount: null });

    // Видимый публичный канал делает сообщество открытым.
    const pub = await createChannel(a, [], { isPublic: true, username: `door${Date.now().toString(36)}` });
    expectOk(await a.api.post(`/api/communities/${c.id}/chats`, { chatId: pub.id }), communityBody);
    const joined = expectOk(await outsider.api.post(`/api/communities/${c.id}/join`), communityBody).community;
    expect(joined).toMatchObject({ role: "member", isMember: true, membersCount: 3, rights: NO_RIGHTS_SET, addPolicy: "add" });
    expectOk(await a.api.delete(`/api/communities/${c.id}/chats/${pub.id}`), communityBody);
    // Повторное вступление ничего не ломает.
    expect(expectOk(await outsider.api.post(`/api/communities/${c.id}/join`), communityBody).community.membersCount).toBe(3);
    expect(expectOk(await outsider.api.get("/api/communities/joined"), joinedBody).communities.map((x) => x.id)).toEqual([c.id]);

    expectError(await a.api.post(`/api/communities/${c.id}/leave`), 400, "Владелец не может покинуть сообщество — его можно только удалить");

    // Выход — только из сообщества: чат остаётся.
    expect(expectOk(await b.api.post(`/api/communities/${c.id}/leave`), okBody)).toEqual({ ok: true });
    const asB = expectOk(await b.api.get(`/api/communities/${c.id}`), communityBody).community;
    expect(asB).toMatchObject({ role: null, isMember: false, isBanned: false, addPolicy: null });
    expect(asB.chats.map((x) => x.id)).toEqual([group.id]);
    expect(expectOk(await b.api.get("/api/communities/joined"), joinedBody).communities).toEqual([]);
    expect(expectOk(await b.api.get(`/api/communities/by-chat/${group.id}`), byChatBody).community?.isMember).toBe(false);
    expectOk(await b.api.get(`/api/chats/${group.id}`), chatCard);
    expectError(await b.api.post(`/api/communities/${c.id}/leave`), 403, NOT_MEMBER);
    expect(expectOk(await a.api.get(`/api/communities/${c.id}`), communityBody).community.membersCount).toBe(2);

    // Вернуться можно через join.
    expect(expectOk(await b.api.post(`/api/communities/${c.id}/join`), communityBody).community.role).toBe("member");
  });

  test("удалённому из сообщества: GET и join — 403", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const c = await createCommunity(a);
    await admit(a, c.id, [b]);
    expectOk(await a.api.request("PUT", `/api/communities/${c.id}/bans/${b.id}`, { json: {} }), banResultBody);
    expectError(await b.api.get(`/api/communities/${c.id}`), 403, BANNED);
    expectError(await b.api.post(`/api/communities/${c.id}/join`), 403, BANNED);
    expectError(await b.api.post(`/api/communities/${c.id}/leave`), 403, NOT_MEMBER);
  });
});

describe("личные настройки: prefs / mute / read", () => {
  test("prefs: закрепить и развернуть", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const outsider = await registerUser(baseUrl);
    const group = await createGroup(a, [b]);
    const c = await createCommunity(a, { chatId: group.id });

    expectError(await outsider.api.post(`/api/communities/${c.id}/prefs`, { pinned: true }), 403, NOT_MEMBER);

    const p = expectOk(await b.api.post(`/api/communities/${c.id}/prefs`, { pinned: true, collapsed: "false" }), communityBody).community;
    expect(p).toMatchObject({ pinned: true, collapsed: false });
    // Непонятные значения игнорируются, остальное не трогается.
    const p2 = expectOk(await b.api.post(`/api/communities/${c.id}/prefs`, { pinned: "maybe", collapsed: 1 }), communityBody).community;
    expect(p2).toMatchObject({ pinned: true, collapsed: true });
    expect(expectOk(await b.api.get("/api/communities/joined"), joinedBody).communities[0]).toMatchObject({ pinned: true, collapsed: true });
    // Настройки личные — у владельца свои.
    expect(expectOk(await a.api.get(`/api/communities/${c.id}`), communityBody).community).toMatchObject({ pinned: false, collapsed: true });

    // Выход снимает закрепление.
    expectOk(await b.api.post(`/api/communities/${c.id}/leave`), okBody);
    expect(expectOk(await b.api.post(`/api/communities/${c.id}/join`), communityBody).community.pinned).toBe(false);
  });

  test("mute: все мои чаты сообщества разом", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const outsider = await registerUser(baseUrl);
    const g1 = await createGroup(a, [b]);
    const g2 = await createGroup(a, []);
    const c = await createCommunity(a, { chatId: g1.id });
    expectOk(await a.api.post(`/api/communities/${c.id}/chats`, { chatId: g2.id }), communityBody);
    const mutedOf = async () => (await b.api.get("/api/settings")).body.settings.notifications?.mutedChats ?? {};

    expectError(await outsider.api.post(`/api/communities/${c.id}/mute`, { forever: true }), 403, NOT_MEMBER);
    for (const body of [{}, { hours: 0 }, { hours: -3 }, { hours: "abc" }, { forever: "yes" }]) {
      expectError(await b.api.post(`/api/communities/${c.id}/mute`, body), 400, "Укажите срок");
    }

    expect(expectOk(await b.api.post(`/api/communities/${c.id}/mute`, { hours: 2 }), okBody)).toEqual({ ok: true });
    const timed = await mutedOf();
    // Только чаты, где B состоит: g2 он не видит.
    expect(Object.keys(timed)).toEqual([g1.id]);
    const until = Date.parse(timed[g1.id]);
    expect(until).toBeGreaterThan(Date.now() + 3600_000);
    expect(until).toBeLessThan(Date.now() + 3 * 3600_000);

    expectOk(await b.api.post(`/api/communities/${c.id}/mute`, { forever: true }), okBody);
    expect(await mutedOf()).toEqual({ [g1.id]: true });

    expectOk(await b.api.post(`/api/communities/${c.id}/mute`, { off: true }), okBody);
    expect(await mutedOf()).toEqual({});
  });

  test("read: прочитать всё — message:read авторам, не посторонним", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const outsider = await registerUser(baseUrl);
    const g1 = await createGroup(a, [b]);
    const c = await createCommunity(a, { chatId: g1.id });
    const m1 = await sendText(a, g1.id, "раз");
    const m2 = await sendText(a, g1.id, "два");
    expect(expectOk(await b.api.get(`/api/chats/${g1.id}`), chatCard).chat.unreadCount).toBeGreaterThan(0);
    const [aWs, outWs] = await Promise.all([ws(a), ws(outsider)]);

    expectError(await outsider.api.post(`/api/communities/${c.id}/read`), 403, NOT_MEMBER);
    expect(expectOk(await b.api.post(`/api/communities/${c.id}/read`), okBody)).toEqual({ ok: true });
    const ev = await aWs.waitFor("message:read", (e) => e.chatId === g1.id);
    expect(ev).toMatchObject({ type: "message:read", chatId: g1.id, readerId: b.id });
    expect(ev.messageIds).toEqual(expect.arrayContaining([m1.id, m2.id]));
    await outWs.expectNone("message:read");
    expect(expectOk(await b.api.get(`/api/chats/${g1.id}`), chatCard).chat.unreadCount).toBe(0);

    // Повтор: читать нечего — события нет.
    aWs.clear();
    expectOk(await b.api.post(`/api/communities/${c.id}/read`), okBody);
    await aWs.expectNone("message:read");
  });
});

describe("GET /:id/members", () => {
  test("участники с ролями и поиск", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl, { name: "Алиса" });
    const b = await registerUser(baseUrl, { name: "Борис" });
    const d = await registerUser(baseUrl, { name: "Дарья" });
    const outsider = await registerUser(baseUrl);
    const group = await createGroup(a, [b]);
    const c = await createCommunity(a, { chatId: group.id });
    await admit(a, c.id, [d]);
    expectOk(await a.api.request("PUT", `/api/communities/${c.id}/admins/${d.id}`, { json: {} }), okBody);

    expectError(await outsider.api.get(`/api/communities/${c.id}/members`), 403, NOT_MEMBER);
    const all = expectOk(await b.api.get(`/api/communities/${c.id}/members`), membersBody).users;
    expect(Object.fromEntries(all.map((u) => [u.id, u.role]))).toEqual({ [a.id]: "owner", [b.id]: "member", [d.id]: "admin" });
    expectShape(membersBody, { users: all });

    const found = expectOk(await b.api.get(`/api/communities/${c.id}/members`, { query: { q: "  дАР " } }), membersBody).users;
    expect(found.map((u) => u.id)).toEqual([d.id]);
    const byNick = expectOk(await b.api.get(`/api/communities/${c.id}/members`, { query: { q: b.username.toUpperCase() } }), membersBody).users;
    expect(byNick.map((u) => u.id)).toEqual([b.id]);
    expect(expectOk(await b.api.get(`/api/communities/${c.id}/members`, { query: { q: "никого" } }), membersBody).users).toEqual([]);
  });
});
