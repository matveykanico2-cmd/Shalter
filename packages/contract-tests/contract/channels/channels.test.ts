// /api/channels: каталог публичных каналов, похожие каналы, подписка, статистика.
import { describe, expect, test } from "vitest";
import { chat } from "../../schemas/chat";
import { chatBody, chatCard, chatList } from "../../schemas/chats";
import { channelSearchBody, channelStatsBody, commentResultBody, postViewBody, similarChannelsBody } from "../../schemas/channels";
import { messageEnvelope } from "../../schemas/messages";
import { expectError, expectOk, expectShape } from "../../support/expect";
import { createChannel, createGroup, registerUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { anonymous, handle, publish, wsPool } from "./helpers";

const server = useServer();
const ws = wsPool();

describe("без сессии", () => {
  test("401", async () => {
    const api = anonymous(server().baseUrl);
    for (const res of await Promise.all([
      api.get("/api/channels"),
      api.get("/api/channels/c_whatever00/similar"),
      api.post("/api/channels/c_whatever00/subscribe"),
      api.get("/api/channels/c_whatever00/stats"),
    ])) expectError(res, 401, "unauthorized");
  });
});

describe("GET /api/channels — каталог", () => {
  test("публичные каналы (и группы), поиск по названию и @нику", async () => {
    const { baseUrl } = server();
    const owner = await registerUser(baseUrl);
    const viewer = await registerUser(baseUrl);
    const tag = handle("zq");
    const pub = await createChannel(owner, [], { title: `Новости ${tag}`, isPublic: true, username: `${tag}news`, description: "Про всё" });
    const pubGroup = await createGroup(owner, [viewer], { title: `Болталка ${tag}`, isPublic: true, username: `${tag}chat` });
    const priv = await createChannel(owner, [], { title: `Тайный ${tag}` });

    const found = expectOk(await viewer.api.get("/api/channels", { query: { q: tag } }), channelSearchBody).channels;
    // Каталог — только каналы: публичная группа сюда не попадает (подписаться на неё нельзя).
    expect(found.map((c) => c.id)).toEqual([pub.id]);
    expect(found[0]).toEqual({
      id: pub.id,
      title: `Новости ${tag}`,
      username: `${tag}news`,
      description: "Про всё",
      avatarColor: pub.avatarColor,
      subscriberCount: 1,
      isMember: false,
    });
    expect(found.map((c) => c.id)).not.toContain(priv.id);

    const byHandle = expectOk(await viewer.api.get("/api/channels", { query: { q: `@${tag.toUpperCase()}NEWS` } }), channelSearchBody).channels;
    expect(byHandle.map((c) => c.id)).toEqual([pub.id]);
    const all = expectOk(await viewer.api.get("/api/channels"), channelSearchBody).channels;
    expect(all.map((c) => c.id)).toContain(pub.id);
    expect(all.map((c) => c.id)).not.toContain(pubGroup.id);
    expect(expectOk(await viewer.api.get("/api/channels", { query: { q: "нет-такого-канала-точно" } }), channelSearchBody).channels).toEqual([]);
  });
});

describe("POST /api/channels/:id/subscribe", () => {
  test("подписка на публичный канал: chat:added себе; повтор — без события", async () => {
    const { baseUrl } = server();
    const owner = await registerUser(baseUrl);
    const reader = await registerUser(baseUrl);
    const pub = await createChannel(owner, [], { isPublic: true, username: handle() });
    const priv = await createChannel(owner, []);
    const group = await createGroup(owner, [], { isPublic: true, username: handle("gr") });
    const [ownerWs, readerWs] = await Promise.all([ws(owner), ws(reader)]);

    expectError(await reader.api.post(`/api/channels/${priv.id}/subscribe`), 404, "not found");
    expectError(await reader.api.post(`/api/channels/${group.id}/subscribe`), 404, "not found");
    expectError(await reader.api.post("/api/channels/c_nonexistent00/subscribe"), 404, "not found");

    const sub = expectOk(await reader.api.post(`/api/channels/${pub.id}/subscribe`), chatBody).chat;
    // Список подписчиков видят только админы: подписчику — он сам и число.
    expect(sub).toMatchObject({ memberIds: [reader.id], membersCount: 2 });
    const ev = await readerWs.waitFor("chat:added", (e) => e.chat?.id === pub.id);
    expectShape(chat, ev.chat);
    // Владельцу о подписчике не сообщается.
    await ownerWs.expectNone("chat:added");
    await ownerWs.expectNone("chat:updated");
    expectOk(await reader.api.get(`/api/chats/${pub.id}`), chatCard);

    readerWs.clear();
    expect(expectOk(await reader.api.post(`/api/channels/${pub.id}/subscribe`), chatBody).chat).toMatchObject({ memberIds: [reader.id], membersCount: 2 });
    await readerWs.expectNone("chat:added");
  });

  test("заблокированному — 403", async () => {
    const { baseUrl } = server();
    const owner = await registerUser(baseUrl);
    const reader = await registerUser(baseUrl);
    const pub = await createChannel(owner, [reader], { isPublic: true, username: handle() });
    expectOk(await owner.api.post(`/api/chats/${pub.id}/members`, { userId: reader.id, role: "ban" }), chatBody);
    expectError(await reader.api.post(`/api/channels/${pub.id}/subscribe`), 403, "Вас заблокировали в этом канале");
  });
});

describe("подписчики канала", () => {
  test("список подписчиков — только админам; подписчику — он сам, число и админы", async () => {
    const { baseUrl } = server();
    const owner = await registerUser(baseUrl);
    const admin = await registerUser(baseUrl);
    const reader = await registerUser(baseUrl);
    const other = await registerUser(baseUrl);
    const ch = await createChannel(owner, [admin, reader, other], { adminIds: [admin.id] });
    const all = [owner.id, admin.id, reader.id, other.id].sort();

    const listed = expectOk(await reader.api.get("/api/chats"), chatList).chats.find((c) => c.id === ch.id)!;
    expect(listed).toMatchObject({ memberIds: [reader.id], membersCount: 4, ownerIds: [owner.id] });
    expect([...listed.adminIds].sort()).toEqual([owner.id, admin.id].sort());
    const boot = (await reader.api.get("/api/bootstrap")).body.chats.find((c: { id: string }) => c.id === ch.id);
    expect(boot).toMatchObject({ memberIds: [reader.id], membersCount: 4 });
    const card = expectOk(await reader.api.get(`/api/chats/${ch.id}`), chatCard);
    expect(card.chat).toMatchObject({ memberIds: [reader.id], membersCount: 4 });
    expect(card.members.map((u) => u.id).sort()).toEqual([owner.id, admin.id, reader.id].sort());

    for (const staff of [owner, admin]) {
      const full = expectOk(await staff.api.get(`/api/chats/${ch.id}`), chatCard);
      expect([...full.chat.memberIds].sort()).toEqual(all);
      expect(full.chat.membersCount).toBe(4);
      expect(full.members.map((u) => u.id).sort()).toEqual(all);
    }

    // WS: подписчику — урезанный чат, админу — полный.
    const [ownerWs, readerWs] = await Promise.all([ws(owner), ws(reader)]);
    expectOk(await owner.api.patch(`/api/chats/${ch.id}`, { title: "Новое имя" }), chatBody);
    const toReader = await readerWs.waitFor("chat:updated", (e) => e.chat?.id === ch.id);
    expectShape(chat, toReader.chat);
    expect(toReader.chat).toMatchObject({ title: "Новое имя", memberIds: [reader.id], membersCount: 4 });
    const toOwner = await ownerWs.waitFor("chat:updated", (e) => e.chat?.id === ch.id);
    expect([...toOwner.chat.memberIds].sort()).toEqual(all);
  });
});

describe("GET /api/channels/:id/similar", () => {
  test("сначала каналы с общей аудиторией; закрытые и забанившие — нет", async () => {
    const { baseUrl } = server();
    const owner = await registerUser(baseUrl);
    const reader = await registerUser(baseUrl);
    const outsider = await registerUser(baseUrl);
    const base = await createChannel(owner, [reader], { isPublic: true, username: handle() });
    const close = await createChannel(owner, [reader], { isPublic: true, username: handle() });
    const banning = await createChannel(owner, [reader], { isPublic: true, username: handle() });
    const priv = await createChannel(owner, [reader]);
    const privBase = await createChannel(owner, [reader]);
    expectOk(await owner.api.post(`/api/chats/${banning.id}/members`, { userId: reader.id, role: "ban" }), chatBody);
    expectOk(await owner.api.post(`/api/chats/${close.id}/members`, { userId: outsider.id, role: "add" }), chatBody);

    const list = expectOk(await reader.api.get(`/api/channels/${base.id}/similar`), similarChannelsBody).channels;
    // close: общие owner и reader — больше всех пересечений.
    expect(list[0]).toEqual({
      id: close.id,
      title: "Канал",
      username: close.username,
      avatarColor: close.avatarColor,
      isVerified: false,
      subscriberCount: 3,
      isMember: true,
    });
    const ids = list.map((c) => c.id);
    expect(ids).not.toContain(banning.id);
    expect(ids).not.toContain(priv.id);
    expect(ids).not.toContain(base.id);
    expect(list.length).toBeLessThanOrEqual(10);
    // Забанивший канал виден другим.
    expect(expectOk(await owner.api.get(`/api/channels/${base.id}/similar`), similarChannelsBody).channels.map((c) => c.id)).toContain(banning.id);

    // Публичный канал виден и не подписчику; закрытый — только подписчикам.
    expectOk(await outsider.api.get(`/api/channels/${base.id}/similar`), similarChannelsBody);
    expectOk(await reader.api.get(`/api/channels/${privBase.id}/similar`), similarChannelsBody);
    expectError(await outsider.api.get(`/api/channels/${privBase.id}/similar`), 404, "Канал не найден");
    const group = await createGroup(owner, [], { isPublic: true, username: handle("gr") });
    expectError(await owner.api.get(`/api/channels/${group.id}/similar`), 404, "Канал не найден");
    expectError(await owner.api.get("/api/channels/c_nonexistent00/similar"), 404, "Канал не найден");
  });
});

describe("GET /api/channels/:id/stats", () => {
  test("сводка по постам: подписчики, просмотры, реакции, комментарии, по дням, топ", async () => {
    const { baseUrl } = server();
    const owner = await registerUser(baseUrl);
    const admin = await registerUser(baseUrl);
    const reader = await registerUser(baseUrl);
    const outsider = await registerUser(baseUrl);
    const channel = await createChannel(owner, [admin, reader], { adminIds: [admin.id] });

    const empty = expectOk(await admin.api.get(`/api/channels/${channel.id}/stats`), channelStatsBody);
    // Служебная строка «Канал создан» постом не считается.
    expect(empty).toMatchObject({ subscribers: 3, posts: 0, views: 0, comments: 0, reactions: 0, averageViews: 0, firstPostAt: null, lastPostAt: null, top: [] });
    expect(empty.byDay).toHaveLength(14);
    expect(empty.byDay[13]).toEqual({ date: new Date().toISOString().slice(0, 10), posts: 0, views: 0 });

    const first = expectOk(await publish(owner, channel.id, { text: "первый" }), messageEnvelope).message;
    const second = expectOk(await publish(owner, channel.id, { text: "x".repeat(200) }), messageEnvelope).message;
    expectOk(await reader.api.post(`/api/posts/${second.id}/view`), postViewBody);
    expectOk(await reader.api.post(`/api/chats/${channel.id}/messages/${second.id}/react`, { emoji: "👍" }), messageEnvelope);
    expectOk(await reader.api.post(`/api/posts/${first.id}/comments`, { text: "коммент" }), commentResultBody);

    const stats = expectOk(await owner.api.get(`/api/channels/${channel.id}/stats`), channelStatsBody);
    expect(stats).toMatchObject({
      subscribers: 3,
      posts: 2,
      views: 1,
      comments: 1,
      reactions: 1,
      averageViews: 1,
      firstPostAt: first.createdAt,
      lastPostAt: second.createdAt,
    });
    expect(stats.byDay[13]).toMatchObject({ posts: 2, views: 1 });
    expect(stats.top).toEqual([
      { id: second.id, text: "x".repeat(120), createdAt: second.createdAt, views: 1, commentCount: 0 },
      { id: first.id, text: "первый", createdAt: first.createdAt, views: 0, commentCount: 1 },
    ]);

    expectError(await reader.api.get(`/api/channels/${channel.id}/stats`), 403, "Статистика доступна администраторам канала");
    // Постороннему закрытый канал не раскрывается — 404.
    expectError(await outsider.api.get(`/api/channels/${channel.id}/stats`), 404, "Канал не найден");
    const group = await createGroup(owner, []);
    expectError(await owner.api.get(`/api/channels/${group.id}/stats`), 404, "Канал не найден");
    expectError(await owner.api.get("/api/channels/c_nonexistent00/stats"), 404, "Канал не найден");
  });
});
