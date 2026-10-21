// Глобальный поиск GET /api/search?q=…: свои чаты, публичные каналы/группы,
// люди, боты, игры и сообщения. Главное — что видно постороннему: чужие
// личные чаты, закрытые группы и их сообщения в выдачу не попадают.
import { describe, expect, test } from "vitest";
import { searchBody } from "../../schemas/search";
import { Api } from "../../support/client";
import { expectError, expectOk } from "../../support/expect";
import { createChannel, createDm, createGroup, registerUser, sendText, uniq, type TestUser } from "../../support/seed";
import { useServer } from "../../support/use-server";

const server = useServer();

const EMPTY = { chats: [], channels: [], users: [], bots: [], games: [], messages: [] };

async function search(user: TestUser, q: string) {
  return expectOk(await user.api.get("/api/search", { query: { q } }), searchBody);
}

/** Слово, которое встречается только в этом тесте (поиск — по префиксу последнего слова). */
const word = () => uniq("w").toLowerCase();

describe("GET /api/search — основы", () => {
  test("без сессии — 401", async () => {
    expectError(await new Api(server().baseUrl).get("/api/search", { query: { q: "x" } }), 401, "unauthorized");
  });

  test("пустой запрос (или одни пробелы) — пустые списки всех разделов", async () => {
    const me = await registerUser(server().baseUrl);
    expect(await search(me, "")).toEqual(EMPTY);
    expect(await search(me, "   ")).toEqual(EMPTY);
    expect(expectOk(await me.api.get("/api/search"), searchBody)).toEqual(EMPTY);
  });
});

describe("люди и боты", () => {
  test("люди находятся по имени и @username; себя в выдаче нет; собеседник по личке — в «чатах», а не в «людях»", async () => {
    const { baseUrl } = server();
    const tag = word();
    const alice = await registerUser(baseUrl, { name: `Алиса ${tag}` });
    const bob = await registerUser(baseUrl, { name: `Боб ${tag}` });
    const me = await registerUser(baseUrl, { name: `Я ${tag}` });

    const found = await search(me, tag);
    expect(found.users.map((u) => u.id).sort()).toEqual([alice.id, bob.id].sort());
    expect(found.users.find((u) => u.id === alice.id)).toMatchObject({ name: `Алиса ${tag}`, username: alice.username });
    expect(found.chats).toEqual([]);
    expect(found.messages).toEqual([]);

    // Регистр не важен, @ в начале снимается.
    expect((await search(me, `@${bob.username.toUpperCase()}`)).users.map((u) => u.id)).toEqual([bob.id]);
    expect((await search(me, `АЛИСА ${tag.toUpperCase()}`)).users.map((u) => u.id)).toEqual([alice.id]);

    const dm = await createDm(me, alice);
    await sendText(me, dm.id, "привет");
    const after = await search(me, tag);
    expect(after.chats.map((c) => c.id)).toEqual([dm.id]);
    expect(after.chats[0]).toMatchObject({ type: "dm", memberIds: expect.arrayContaining([me.id, alice.id]) });
    expect(after.users.map((u) => u.id)).toEqual([bob.id]);
  });

  test("точное совпадение username — выше остальных", async () => {
    const { baseUrl } = server();
    const tag = word();
    const longer = await registerUser(baseUrl, { name: "Длинный", username: `${tag}_more` });
    const exact = await registerUser(baseUrl, { name: "Точный", username: tag });
    const me = await registerUser(baseUrl);
    expect((await search(me, tag)).users.map((u) => u.id)).toEqual([exact.id, longer.id]);
  });

  test("боты — отдельным списком (publicUser), в «людях» их нет", async () => {
    const me = await registerUser(server().baseUrl);
    const found = await search(me, "@helper");
    expect(found.bots).toEqual([expect.objectContaining({ id: "bot_helper", username: "helper", name: "Помощник", isBot: true })]);
    expect(found.users.some((u) => u.isBot)).toBe(false);
  });
});

describe("чужие чаты не утекают", () => {
  test("личка, закрытая группа и закрытый канал: участники находят, посторонний — нет", async () => {
    const { baseUrl } = server();
    const tag = word();
    const [w1, w2, w3] = [word(), word(), word()];
    const alice = await registerUser(baseUrl);
    const bob = await registerUser(baseUrl);
    const outsider = await registerUser(baseUrl);

    const dm = await createDm(alice, bob);
    const inDm = await sendText(alice, dm.id, `пароль от сейфа ${w1}`);
    const group = await createGroup(alice, [bob], { title: `Тайная ${tag}` });
    const inGroup = await sendText(bob, group.id, `встреча ${w2}`);
    const channel = await createChannel(alice, [bob], { title: `Закрытый ${tag}` });
    const inChannel = await sendText(alice, channel.id, `пост ${w3}`);

    for (const q of [w1, w2, w3, tag, `пароль от сейфа ${w1}`]) {
      const res = await search(outsider, q);
      expect(res, `запрос «${q}»`).toEqual({ ...EMPTY, users: [] });
    }

    const bobDm = await search(bob, w1);
    expect(bobDm.messages).toEqual([expect.objectContaining({ id: inDm.id, chatId: dm.id, senderId: alice.id, text: `пароль от сейфа ${w1}` })]);
    // Несколько слов: все, последнее — по префиксу.
    expect((await search(bob, `сейфа ${w1.slice(0, 4)}`)).messages.map((m) => m.id)).toEqual([inDm.id]);
    expect((await search(bob, `сейф ${w1}`)).messages).toEqual([]);

    expect((await search(alice, w2)).messages.map((m) => m.id)).toEqual([inGroup.id]);
    expect((await search(bob, w3)).messages.map((m) => m.id)).toEqual([inChannel.id]);
    const byTitle = await search(bob, tag);
    expect(byTitle.chats.map((c) => c.id).sort()).toEqual([group.id, channel.id].sort());
    expect(byTitle.channels).toEqual([]);
  });

  test("после выхода из группы её чат и сообщения больше не находятся", async () => {
    const { baseUrl } = server();
    const tag = word();
    const w = word();
    const owner = await registerUser(baseUrl);
    const member = await registerUser(baseUrl);
    const group = await createGroup(owner, [member], { title: `Клуб ${tag}` });
    await sendText(owner, group.id, `правила ${w}`);
    expect((await search(member, w)).messages).toHaveLength(1);

    expect((await member.api.post(`/api/chats/${group.id}/leave`)).status).toBe(200);
    expect(await search(member, w)).toEqual(EMPTY);
    expect((await search(member, tag)).chats).toEqual([]);
  });

  test("секретный чат в поиск не попадает ни чатом, ни сообщениями", async () => {
    const { baseUrl } = server();
    const tag = word();
    const w = word();
    const alice = await registerUser(baseUrl);
    const bob = await registerUser(baseUrl, { name: `Боб ${tag}` });
    const res = await alice.api.post("/api/chats/secret", { userId: bob.id });
    expect(res.status, res.text).toBe(200);
    const secret = res.body.chat;
    const sent = await alice.api.post(`/api/chats/${secret.id}/messages`, { text: `тайна ${w}` });
    expect(sent.status, sent.text).toBe(200);

    const found = await search(alice, tag);
    expect(found.chats).toEqual([]);
    // Собеседник по секретному чату остаётся в «людях».
    expect(found.users.map((u) => u.id)).toEqual([bob.id]);
    expect((await search(alice, w)).messages).toEqual([]);
  });
});

describe("публичные каналы и группы", () => {
  test("не вступившему — карточкой в channels, сообщения не ищутся; после вступления — в chats и messages", async () => {
    const { baseUrl } = server();
    const tag = word();
    const w = word();
    const owner = await registerUser(baseUrl);
    const reader = await registerUser(baseUrl);
    const channel = await createChannel(owner, [], { title: `Новости ${tag}`, isPublic: true, username: `n${tag}`, description: "О разном" });
    const group = await createGroup(owner, [], { title: `Болталка ${tag}`, isPublic: true, username: `g${tag}` });
    const post = await sendText(owner, channel.id, `анонс ${w}`);

    const before = await search(reader, tag);
    expect(before.chats).toEqual([]);
    // Сортировка — по названию.
    expect(before.channels).toEqual([
      { id: group.id, title: `Болталка ${tag}`, username: `g${tag}`, avatarColor: expect.any(String), subscriberCount: 1 },
      { id: channel.id, title: `Новости ${tag}`, username: `n${tag}`, description: "О разном", avatarColor: expect.any(String), subscriberCount: 1 },
    ]);
    // По @username — тоже.
    expect((await search(reader, `@n${tag}`)).channels.map((c) => c.id)).toEqual([channel.id]);
    // Публичный канал открыт для чтения, но поиск по сообщениям — только в своих чатах.
    expect((await search(reader, w)).messages).toEqual([]);

    const join = await reader.api.post(`/api/chats/${channel.id}/join`);
    expect(join.status, join.text).toBe(200);
    const after = await search(reader, tag);
    expect(after.chats.map((c) => c.id)).toEqual([channel.id]);
    expect(after.channels.map((c) => c.id)).toEqual([group.id]);
    expect((await search(reader, w)).messages.map((m) => m.id)).toEqual([post.id]);
    // Владелец видит свои чаты в chats (включая автоматическую закрытую группу
    // обсуждения публичного канала — она подписчику не видна), а в channels — ничего.
    const own = await search(owner, tag);
    expect(own.chats.map((c) => c.title).sort()).toEqual([`Болталка ${tag}`, `Новости ${tag}`, `Новости ${tag} · Обсуждение`]);
    expect(own.channels).toEqual([]);
  });
});

describe("сообщения: что выпадает из выдачи", () => {
  test("удалённое у себя и очищенная история пропадают только у того, кто это сделал", async () => {
    const { baseUrl } = server();
    const [w1, w2] = [word(), word()];
    const alice = await registerUser(baseUrl);
    const bob = await registerUser(baseUrl);
    const dm = await createDm(alice, bob);
    const m1 = await sendText(alice, dm.id, `первое ${w1}`);

    expect((await alice.api.delete(`/api/chats/${dm.id}/messages/${m1.id}`, { forEveryone: false })).status).toBe(200);
    expect((await search(alice, w1)).messages).toEqual([]);
    expect((await search(bob, w1)).messages.map((m) => m.id)).toEqual([m1.id]);

    const m2 = await sendText(bob, dm.id, `второе ${w2}`);
    expect((await bob.api.post(`/api/chats/${dm.id}/clear`, {})).status).toBe(200);
    expect((await search(bob, w2)).messages).toEqual([]);
    expect((await search(alice, w2)).messages.map((m) => m.id)).toEqual([m2.id]);

    // Новое сообщение после очистки — снова находится.
    const m3 = await sendText(alice, dm.id, `третье ${w2}`);
    expect((await search(bob, w2)).messages.map((m) => m.id)).toEqual([m3.id]);
    // Свежие — первыми.
    expect((await search(alice, w2)).messages.map((m) => m.id)).toEqual([m3.id, m2.id]);
  });

  test("удалённое у всех не находится ни у кого; после правки ищется новый текст", async () => {
    const { baseUrl } = server();
    const [w1, w2, w3] = [word(), word(), word()];
    const alice = await registerUser(baseUrl);
    const bob = await registerUser(baseUrl);
    const dm = await createDm(alice, bob);

    const gone = await sendText(alice, dm.id, `удалю ${w1}`);
    expect((await alice.api.delete(`/api/chats/${dm.id}/messages/${gone.id}`, { forEveryone: true })).status).toBe(200);
    expect((await search(alice, w1)).messages).toEqual([]);
    expect((await search(bob, w1)).messages).toEqual([]);

    const edited = await sendText(alice, dm.id, `было ${w2}`);
    expect((await alice.api.patch(`/api/chats/${dm.id}/messages/${edited.id}`, { text: `стало ${w3}` })).status).toBe(200);
    expect((await search(bob, w2)).messages).toEqual([]);
    expect((await search(bob, w3)).messages).toEqual([expect.objectContaining({ id: edited.id, text: `стало ${w3}`, editedAt: expect.any(String) })]);
  });

  test("личка, «удалённая у себя», не находится в чатах — собеседник находится среди людей", async () => {
    const { baseUrl } = server();
    const tag = word();
    const w = word();
    const me = await registerUser(baseUrl);
    const peer = await registerUser(baseUrl, { name: `Собеседник ${tag}` });
    const dm = await createDm(me, peer);
    await sendText(peer, dm.id, `старое ${w}`);

    expect((await me.api.post(`/api/chats/${dm.id}/delete-for-me`)).status).toBe(200);
    const found = await search(me, tag);
    expect(found.chats).toEqual([]);
    expect(found.users.map((u) => u.id)).toEqual([peer.id]);
    expect((await search(me, w)).messages).toEqual([]);

    // После нового сообщения личка снова ищется как чат.
    await sendText(peer, dm.id, "новое");
    const again = await search(me, tag);
    expect(again.chats.map((c) => c.id)).toEqual([dm.id]);
    expect(again.users).toEqual([]);
  });
});

describe("игры", () => {
  test("встроенные и опубликованные видны всем, неопубликованная — только автору", async () => {
    const { baseUrl } = server();
    const tag = word();
    const author = await registerUser(baseUrl);
    const other = await registerUser(baseUrl);
    const code = "<html><body>game</body></html>";
    const draft = await author.api.post("/api/games", { title: `Черновик ${tag}`, code });
    const published = await author.api.post("/api/games", { title: `Готовая ${tag}`, code, isPublic: true });
    expect(draft.status, draft.text).toBe(200);
    expect(published.status, published.text).toBe(200);

    expect((await search(author, tag)).games.map((g) => g.id).sort()).toEqual([draft.body.game.id, published.body.game.id].sort());
    expect((await search(other, tag)).games).toEqual([expect.objectContaining({ id: published.body.game.id, title: `Готовая ${tag}`, isPublic: true })]);

    expect((await search(other, "змейка")).games).toEqual([
      { id: "builtin-snake", title: "Змейка", emoji: "🐍", description: "Классика: собирайте яблоки и растите", builtin: true, isPublic: true },
    ]);
  });
});
