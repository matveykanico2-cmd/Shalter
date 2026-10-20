// Список чатов, сводки и создание чатов: личка (в том числе «Избранное»),
// секретный чат с привязкой к устройству, группа, канал с обсуждением, карточка чата.
import { describe, expect, test } from "vitest";
import { chat, chatSummary } from "../../schemas/chat";
import { chatBody, chatCard, chatList } from "../../schemas/chats";
import { expectError, expectOk, expectShape, expectStatus } from "../../support/expect";
import { createChannel, createDm, createGroup, login, registerUser, sendText, uniq } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { anonymous, NOT_FOUND, wsPool } from "./helpers";

const server = useServer();
const ws = wsPool();

describe("без сессии", () => {
  test("все маршруты чатов отвечают 401 unauthorized", async () => {
    const api = anonymous(server().baseUrl);
    const calls = [
      api.get("/api/chats"),
      api.post("/api/chats", { userId: "u_x" }),
      api.post("/api/chats/secret", { userId: "u_x" }),
      api.post("/api/chats/groups", { title: "x" }),
      api.post("/api/chats/channels", { title: "x" }),
      api.get("/api/chats/c_whatever"),
      api.patch("/api/chats/c_whatever", { title: "x" }),
      api.delete("/api/chats/c_whatever"),
      api.get("/api/chats/by-username/someone"),
      api.get("/api/chats/invite/abc"),
      api.post("/api/chats/pinned-order", { chatIds: [] }),
    ];
    for (const res of await Promise.all(calls)) expectError(res, 401, "unauthorized");
  });
});

describe("список чатов", () => {
  test("у нового пользователя список пуст", async () => {
    const a = await registerUser(server().baseUrl);
    const body = expectOk(await a.api.get("/api/chats"), chatList);
    expect(body.chats).toEqual([]);
  });

  test("сводка: последнее сообщение, непрочитанные, собеседник, флаги по умолчанию", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl, { name: "Алиса" });
    const b = await registerUser(baseUrl, { name: "Боб" });
    const dm = await createDm(a, b);
    await sendText(a, dm.id, "раз");
    const last = await sendText(a, dm.id, "два");

    const forB = expectOk(await b.api.get("/api/chats"), chatList).chats;
    expect(forB).toHaveLength(1);
    expect(forB[0]).toMatchObject({
      id: dm.id,
      type: "dm",
      unreadCount: 2,
      hasUnreadMention: false,
      lastMessage: { id: last.id, text: "два", senderId: a.id },
      otherUser: { id: a.id, name: "Алиса" },
      draft: null,
      pinOrder: null,
      pinned: false,
      archived: false,
      muted: false,
      mutedUntil: null,
    });
    expect(forB[0]).not.toHaveProperty("isSaved");
    expect(forB[0]).not.toHaveProperty("unread");

    // Свои сообщения непрочитанными не считаются.
    const forA = expectOk(await a.api.get("/api/chats"), chatList).chats;
    expect(forA[0]).toMatchObject({ unreadCount: 0, otherUser: { id: b.id } });
  });

  test("упоминание в группе поднимает hasUnreadMention", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const group = await createGroup(a, [b]);
    await sendText(a, group.id, `привет @${b.username}`);
    const row = expectOk(await b.api.get("/api/chats"), chatList).chats.find((c) => c.id === group.id)!;
    expect(row.hasUnreadMention).toBe(true);
    expect(row.otherUser).toBeNull();
  });
});

describe("личка", () => {
  test("создание идемпотентно: повтор и встречный запрос возвращают тот же чат", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const bWs = await ws(b.api);

    const first = expectOk(await a.api.post("/api/chats", { userId: b.id }), chatBody).chat;
    expect(first).toMatchObject({
      type: "dm",
      title: "",
      memberIds: [a.id, b.id],
      adminIds: [],
      ownerIds: [],
      moderatorIds: [],
      commentsOff: false,
      commentPriceStars: 0,
      points: 0,
      bannedIds: [],
      protectedBy: [],
      permissions: null,
      wallpaper: null,
      allowedReactions: null,
    });
    expect(first).not.toHaveProperty("secret");

    const again = expectOk(await a.api.post("/api/chats", { userId: b.id }), chatBody).chat;
    const reverse = expectOk(await b.api.post("/api/chats", { userId: a.id }), chatBody).chat;
    expect(again.id).toBe(first.id);
    expect(reverse.id).toBe(first.id);

    // Пустая личка собеседнику не анонсируется.
    await bWs.expectNone("chat:added");
    // ...но в списке у обоих она уже есть, даже без сообщений.
    const listA = expectOk(await a.api.get("/api/chats"), chatList).chats;
    expect(listA.map((c) => c.id)).toEqual([first.id]);
    expect(listA[0].lastMessage).toBeNull();
  });

  test("неизвестный или пропущенный собеседник — 404", async () => {
    const a = await registerUser(server().baseUrl);
    expectError(await a.api.post("/api/chats", { userId: "u_nonexistent00" }), 404, "Пользователь не найден");
    expectError(await a.api.post("/api/chats", {}), 404, "Пользователь не найден");
  });

  test("личка с самим собой — «Избранное»", async () => {
    const a = await registerUser(server().baseUrl);
    const saved = expectOk(await a.api.post("/api/chats", { userId: a.id }), chatBody).chat;
    expect(saved).toMatchObject({ type: "dm", memberIds: [a.id] });
    const again = expectOk(await a.api.post("/api/chats", { userId: a.id }), chatBody).chat;
    expect(again.id).toBe(saved.id);

    await sendText(a, saved.id, "заметка");
    const row = expectOk(await a.api.get("/api/chats"), chatList).chats.find((c) => c.id === saved.id)!;
    expect(row).toMatchObject({ title: "Избранное", isSaved: true, otherUser: null, unreadCount: 0 });

    const card = expectOk(await a.api.get(`/api/chats/${saved.id}`), chatCard);
    expect(card.chat).toMatchObject({ title: "Избранное", isSaved: true });
    expect(card.members.map((m) => m.id)).toEqual([a.id]);
  });
});

describe("секретный чат", () => {
  test("ошибки создания", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    expectError(await a.api.post("/api/chats/secret", {}), 400, "Выберите собеседника");
    expectError(await a.api.post("/api/chats/secret", { userId: a.id }), 400, "Выберите собеседника");
    expectError(await a.api.post("/api/chats/secret", { userId: "u_nonexistent00" }), 404, "Пользователь не найден");

    expectStatus(await b.api.post(`/api/users/${a.id}/block`, { blocked: true }), 200);
    expectError(await a.api.post("/api/chats/secret", { userId: b.id }), 403, "Пользователь заблокировал вас");
  });

  test("привязан к устройству: на других устройствах участников чата нет", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl, { name: "Алиса" });
    const b = await registerUser(baseUrl, { name: "Боб" });
    const aOther = await login(baseUrl, a);
    const bPhone = await login(baseUrl, b);
    const bLaptop = await login(baseUrl, b);

    const secret = expectOk(await a.api.post("/api/chats/secret", { userId: b.id }), chatBody).chat;
    expect(secret).toMatchObject({ type: "dm", secret: true, title: "", memberIds: [a.id, b.id] });

    // Это не обычная личка: её создание по-прежнему даёт отдельный чат, а второй секретный — третий.
    const plain = await createDm(a, b);
    const secret2 = expectOk(await a.api.post("/api/chats/secret", { userId: b.id }), chatBody).chat;
    expect(new Set([secret.id, plain.id, secret2.id]).size).toBe(3);

    // У создателя — только на устройстве создания.
    const card = expectOk(await a.api.get(`/api/chats/${secret.id}`), chatCard);
    expect(card.chat.lastMessage).toMatchObject({ type: "system" });
    expect(card.chat.lastMessage?.text).toContain("Алиса начал(а) секретный чат");
    expectError(await aOther.get(`/api/chats/${secret.id}`), 404, NOT_FOUND);
    expectError(await aOther.get(`/api/chats/${secret.id}/messages`), 404, NOT_FOUND);
    const otherList = expectOk(await aOther.get("/api/chats"), chatList).chats.map((c) => c.id);
    expect(otherList).toContain(plain.id);
    expect(otherList).not.toContain(secret.id);

    // Собеседник: пока не открыл — виден везде; первое открытие привязывает устройство.
    const phoneWs = await ws(bPhone);
    const laptopWs = await ws(bLaptop);
    expect(expectOk(await bLaptop.get("/api/chats"), chatList).chats.map((c) => c.id)).toContain(secret.id);
    expectOk(await bPhone.get(`/api/chats/${secret.id}`), chatCard);
    expectError(await bLaptop.get(`/api/chats/${secret.id}`), 404, NOT_FOUND);
    expect(expectOk(await bLaptop.get("/api/chats"), chatList).chats.map((c) => c.id)).not.toContain(secret.id);

    // События секретного чата приходят только на привязанное устройство.
    const sent = await sendText(a, secret.id, "тсс");
    await phoneWs.waitFor("message:new", (e) => e.message?.id === sent.id);
    await laptopWs.expectNone("message:new", (e) => e.message?.id === sent.id);
  });
});

describe("группа", () => {
  test("без названия — 400", async () => {
    const a = await registerUser(server().baseUrl);
    expectError(await a.api.post("/api/chats/groups", { title: "  " }), 400, "Введите название группы");
    expectError(await a.api.post("/api/chats/groups", {}), 400, "Введите название группы");
  });

  test("создание: роли, служебная строка, chat:added участникам и только им", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl, { name: "Алиса" });
    const b = await registerUser(baseUrl);
    const c = await registerUser(baseUrl);
    const outsider = await registerUser(baseUrl);
    const [aWs, bWs, outWs] = await Promise.all([ws(a.api), ws(b.api), ws(outsider.api)]);

    const res = await a.api.post("/api/chats/groups", {
      title: "  Друзья  ",
      memberIds: [b.id, c.id, a.id, "u_nonexistent00", b.id],
      adminIds: [c.id, outsider.id],
    });
    const group = expectOk(res, chatBody).chat;
    expect(group).toMatchObject({
      type: "group",
      title: "Друзья",
      ownerId: a.id,
      ownerIds: [a.id],
      avatarColor: "#2E56D9",
    });
    expect([...group.memberIds].sort()).toEqual([a.id, b.id, c.id].sort());
    // Админом может стать только участник; посторонний из adminIds отброшен.
    expect([...group.adminIds].sort()).toEqual([a.id, c.id].sort());
    expect(group).not.toHaveProperty("isPublic");
    expect(group).not.toHaveProperty("username");

    const added = await bWs.waitFor("chat:added", (e) => e.chat?.id === group.id);
    expectShape(chat, added.chat, "chat:added");
    await aWs.expectNone("chat:added", (e) => e.chat?.id === group.id);
    await outWs.expectNone("chat:added", (e) => e.chat?.id === group.id);

    const row = expectOk(await b.api.get("/api/chats"), chatList).chats.find((x) => x.id === group.id)!;
    expect(row.lastMessage).toMatchObject({ type: "system", text: "Алиса создал(а) группу «Друзья»" });
  });

  test("публичная группа с юзернеймом и ошибки юзернейма", async () => {
    const a = await registerUser(server().baseUrl);
    const handle = uniq("grp");
    const group = expectOk(
      await a.api.post("/api/chats/groups", { title: "Клуб", isPublic: true, username: `@${handle}`, description: "  о нас  " }),
      chatBody
    ).chat;
    expect(group).toMatchObject({ isPublic: true, username: handle, description: "о нас" });

    expectError(await a.api.post("/api/chats/groups", { title: "x", isPublic: true, username: handle }), 409, "Этот юзернейм уже занят каналом");
    expectError(await a.api.post("/api/chats/groups", { title: "x", isPublic: true, username: "ab" }), 400, "Юзернейм: 3–32 символа, латинские буквы, цифры и _");
    expectError(await a.api.post("/api/chats/groups", { title: "x", isPublic: true, username: "admin" }), 409, "Этот юзернейм зарезервирован — выберите другой");
    expectError(await a.api.post("/api/chats/groups", { title: "x", isPublic: true, username: a.username }), 409, "Этот юзернейм уже занят");

    // Без isPublic юзернейм игнорируется.
    const priv = expectOk(await a.api.post("/api/chats/groups", { title: "x", username: uniq("grp") }), chatBody).chat;
    expect(priv).not.toHaveProperty("username");
  });
});

describe("канал", () => {
  test("без названия — 400", async () => {
    const a = await registerUser(server().baseUrl);
    expectError(await a.api.post("/api/chats/channels", { title: "" }), 400, "Введите название канала");
  });

  test("создание вместе с группой обсуждения", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const outsider = await registerUser(baseUrl);
    const [bWs, outWs] = await Promise.all([ws(b.api), ws(outsider.api)]);

    const channel = expectOk(await a.api.post("/api/chats/channels", { title: "Новости", memberIds: [b.id] }), chatBody).chat;
    expect(channel).toMatchObject({ type: "channel", title: "Новости", ownerId: a.id, adminIds: [a.id], avatarColor: "#D9822E", commentsOff: false });
    expect([...channel.memberIds].sort()).toEqual([a.id, b.id].sort());

    const added = await bWs.waitFor("chat:added", (e) => e.chat?.id === channel.id);
    expect(added.chat.linkedDiscussionChatId).toBe(channel.linkedDiscussionChatId);
    await outWs.expectNone("chat:added");

    // Обсуждение: группа владельца, подписчики в неё не попадают.
    const discussion = expectOk(await a.api.get(`/api/chats/${channel.linkedDiscussionChatId}`), chatCard).chat;
    expect(discussion).toMatchObject({ type: "group", title: "Новости · Обсуждение", memberIds: [a.id], ownerId: a.id, avatarColor: "#5C6473" });
    expect(discussion.lastMessage).toMatchObject({ type: "system", text: "Группа обсуждения канала «Новости» создана" });
    expectError(await b.api.get(`/api/chats/${channel.linkedDiscussionChatId}`), 404, NOT_FOUND);

    const listA = expectOk(await a.api.get("/api/chats"), chatList).chats.map((c) => c.id);
    expect(listA.sort()).toEqual([channel.id, channel.linkedDiscussionChatId].sort());
    const rowB = expectOk(await b.api.get("/api/chats"), chatList).chats.find((c) => c.id === channel.id)!;
    expect(rowB.lastMessage).toMatchObject({ type: "system", text: "Канал «Новости» создан" });
  });
});

describe("карточка чата GET /:id", () => {
  test("участнику — сводка и участники, постороннему и для несуществующего — 404", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const outsider = await registerUser(baseUrl);
    const group = await createGroup(a, [b]);

    const card = expectOk(await b.api.get(`/api/chats/${group.id}`), chatCard);
    expectShape(chatSummary, card.chat);
    expect(card.members.map((m) => m.id)).toEqual(group.memberIds);
    expect(card).toMatchObject({ commands: null, paidMessages: null });

    expectError(await outsider.api.get(`/api/chats/${group.id}`), 404, NOT_FOUND);
    expectError(await a.api.get("/api/chats/c_nonexistent00"), 404, NOT_FOUND);
  });

  test("канал с платными комментариями: обсуждение показывает цену", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const channel = await createChannel(a);
    expectStatus(await a.api.post(`/api/chats/${channel.id}/comment-price`, { stars: 5 }), 200);
    const card = expectOk(await a.api.get(`/api/chats/${channel.linkedDiscussionChatId}`), chatCard);
    // Владелец канала не платит.
    expect(card.paidMessages).toEqual({ stars: 5, youPay: false, kind: "comment" });
  });
});
