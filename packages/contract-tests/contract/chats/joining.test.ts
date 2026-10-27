// Вступление в чаты: превью и поиск публичного чата по юзернейму, вступление,
// заявки (approveJoins), ссылки-приглашения, список заблокированных.
import { describe, expect, test } from "vitest";
import { chat } from "../../schemas/chat";
import {
  bannedBody,
  byUsernameBody,
  chatBody,
  chatCard,
  chatList,
  inviteCreateBody,
  inviteInfoBody,
  invitePendingBody,
  joinDecisionBody,
  joinPendingBody,
  joinRequestsBody,
  previewBody,
} from "../../schemas/chats";
import { publicUser } from "../../schemas/user";
import { expectError, expectOk, expectShape } from "../../support/expect";
import { createChannel, createDm, createGroup, registerUser, sendText, uniq, type TestUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { anonymous, NO_RIGHTS, NOT_FOUND, wsPool } from "./helpers";

const server = useServer();
const ws = wsPool();

async function publicChannel(owner: TestUser, members: TestUser[] = [], extra: Record<string, unknown> = {}) {
  const username = uniq("pubch");
  const ch = await createChannel(owner, members, { isPublic: true, username, title: "Публичный", ...extra });
  return { ...ch, username };
}

async function publicGroup(owner: TestUser, members: TestUser[] = [], extra: Record<string, unknown> = {}) {
  const username = uniq("pubgr");
  const gr = await createGroup(owner, members, { isPublic: true, username, title: "Открытая", ...extra });
  return { ...gr, username };
}

describe("без сессии", () => {
  test("401", async () => {
    const api = anonymous(server().baseUrl);
    for (const res of await Promise.all([
      api.get("/api/chats/c_whatever00/preview"),
      api.post("/api/chats/c_whatever00/join"),
      api.get("/api/chats/c_whatever00/banned"),
      api.get("/api/chats/c_whatever00/join-requests"),
      api.post("/api/chats/c_whatever00/join-requests/u_x"),
      api.post("/api/chats/c_whatever00/invite"),
      api.get("/api/chats/invite/abc"),
      api.post("/api/chats/invite/abc/join"),
    ])) expectError(res, 401, "unauthorized");
  });
});

describe("GET /:id/preview", () => {
  test("публичный канал глазами постороннего", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl, { name: "Автор" });
    const outsider = await registerUser(baseUrl);
    const ch = await publicChannel(a, [], { description: "про всё" });
    const post = await sendText(a, ch.id, "первый пост");

    const body = expectOk(await outsider.api.get(`/api/chats/${ch.id}/preview`), previewBody);
    expect(body.chat).toEqual({
      id: ch.id,
      type: "channel",
      title: "Публичный",
      username: ch.username,
      description: "про всё",
      avatarColor: "#D9822E",
      isVerified: false,
      subscribers: 1,
      isMember: false,
      approveJoins: false,
      requestPending: false,
    });
    expect(body.messages.map((m) => m.id)).toContain(post.id);
    expect(body.messages.at(-1)?.id).toBe(post.id);
    expect(body.hasMore).toBe(false);
    expect(body.senders.map((u) => u.id)).toContain(a.id);

    const one = expectOk(await outsider.api.get(`/api/chats/${ch.id}/preview`, { query: { limit: 1 } }), previewBody);
    expect(one.messages.map((m) => m.id)).toEqual([post.id]);
    expect(one.hasMore).toBe(true);

    // Превью ничего не отмечает прочитанным и в список не добавляет.
    expect(expectOk(await outsider.api.get("/api/chats"), chatList).chats).toEqual([]);
  });

  test("приватные чаты, лички и несуществующие — 404; заблокированному — 403", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const group = await createGroup(a, [b]);
    const dm = await createDm(a, b);
    for (const id of [group.id, dm.id, "c_nonexistent00"]) {
      expectError(await b.api.get(`/api/chats/${id}/preview`), 404, "Чат не найден");
    }
    const pub = await publicGroup(a, [b]);
    expectOk(await a.api.post(`/api/chats/${pub.id}/members`, { userId: b.id, role: "ban" }), chatBody);
    expectError(await b.api.get(`/api/chats/${pub.id}/preview`), 403, "Вас заблокировали в этом чате");
  });
});

describe("GET /by-username/:username", () => {
  test("поиск публичного чата по юзернейму", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const ch = await publicChannel(a, [b]);

    const body = expectOk(await b.api.get(`/api/chats/by-username/${ch.username.toUpperCase()}`), byUsernameBody);
    expect(body.chat).toEqual({
      id: ch.id,
      type: "channel",
      title: "Публичный",
      username: ch.username,
      description: null,
      avatarColor: "#D9822E",
      isVerified: false,
      subscribers: 2,
      isMember: true,
      banned: false,
      approveJoins: false,
      requestPending: false,
    });
    expectOk(await b.api.get(`/api/chats/by-username/${encodeURIComponent("@" + ch.username)}`), byUsernameBody);
    expectError(await b.api.get("/api/chats/by-username/nosuchchat123"), 404, NOT_FOUND);

    // Юзернейм пользователя — не чат.
    expectError(await b.api.get(`/api/chats/by-username/${a.username}`), 404, NOT_FOUND);

    expectOk(await a.api.post(`/api/chats/${ch.id}/members`, { userId: b.id, role: "ban" }), chatBody);
    expect(expectOk(await b.api.get(`/api/chats/by-username/${ch.username}`), byUsernameBody).chat).toMatchObject({ isMember: false, banned: true, subscribers: 1 });
  });
});

describe("POST /:id/join", () => {
  test("в группу: chat:added вступившему, chat:updated участникам, служебная строка", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const joiner = await registerUser(baseUrl, { name: "Новенький" });
    const outsider = await registerUser(baseUrl);
    const gr = await publicGroup(a, [b]);
    const [bWs, jWs, outWs] = await Promise.all([ws(b.api), ws(joiner.api), ws(outsider.api)]);

    const joined = expectOk(await joiner.api.post(`/api/chats/${gr.id}/join`), chatBody).chat;
    expect(joined.memberIds).toContain(joiner.id);
    const added = await jWs.waitFor("chat:added", (e) => e.chat?.id === gr.id);
    expectShape(chat, added.chat);
    const upd = await bWs.waitFor("chat:updated", (e) => e.chat?.id === gr.id);
    expect(upd.chat.memberIds).toContain(joiner.id);
    await jWs.expectNone("chat:updated", (e) => e.chat?.id === gr.id, 0);
    await outWs.expectNone("chat:updated");
    await outWs.expectNone("chat:added");

    const last = expectOk(await joiner.api.get(`/api/chats/${gr.id}`), chatCard).chat.lastMessage;
    expect(last).toMatchObject({ type: "system", text: "Новенький вступил(а) в группу" });

    // Повторное вступление — просто чат.
    expect(expectOk(await joiner.api.post(`/api/chats/${gr.id}/join`), chatBody).chat.memberIds.filter((id) => id === joiner.id)).toHaveLength(1);
  });

  test("в канал: chat:added вступившему, chat:updated подписчикам, без служебной строки", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const joiner = await registerUser(baseUrl);
    const ch = await publicChannel(a, [b]);
    const [aWs, jWs] = await Promise.all([ws(a.api), ws(joiner.api)]);
    expectOk(await joiner.api.post(`/api/chats/${ch.id}/join`), chatBody);
    await jWs.waitFor("chat:added", (e) => e.chat?.id === ch.id);
    // Как при вступлении по ссылке и одобрении заявки.
    const upd = await aWs.waitFor("chat:updated", (e) => e.chat?.id === ch.id);
    expect(upd.chat.memberIds).toContain(joiner.id);
    await aWs.expectNone("message:new");
  });

  test("ошибки вступления", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const group = await createGroup(a, []);
    const dm = await createDm(a, a);
    for (const id of [group.id, dm.id, "c_nonexistent00"]) {
      expectError(await b.api.post(`/api/chats/${id}/join`), 404, "Чат не найден");
    }
    const gr = await publicGroup(a, [b]);
    expectOk(await a.api.post(`/api/chats/${gr.id}/members`, { userId: b.id, role: "ban" }), chatBody);
    expectError(await b.api.post(`/api/chats/${gr.id}/join`), 403, "Вас заблокировали в этом чате");
  });
});

describe("заявки на вступление (approveJoins)", () => {
  test("подача, список, одобрение и отказ", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const member = await registerUser(baseUrl);
    const u1 = await registerUser(baseUrl, { name: "Первый" });
    const u2 = await registerUser(baseUrl, { name: "Второй" });
    const ch = await publicChannel(a, [member]);
    expectOk(await a.api.post(`/api/chats/${ch.id}/settings`, { approveJoins: true }), chatBody);
    const [aWs, mWs, u1Ws, u2Ws] = await Promise.all([ws(a.api), ws(member.api), ws(u1.api), ws(u2.api)]);

    expectOk(await u1.api.post(`/api/chats/${ch.id}/join`), joinPendingBody);
    const jr = await aWs.waitFor("chat:join-request", (e) => e.chatId === ch.id);
    expect(jr.user.id).toBe(u1.id);
    expectShape(publicUser, jr.user);
    await mWs.expectNone("chat:join-request");

    // Заявка видна в превью и по юзернейму.
    expect(expectOk(await u1.api.get(`/api/chats/${ch.id}/preview`), previewBody).chat).toMatchObject({ approveJoins: true, requestPending: true, isMember: false });
    expect(expectOk(await u1.api.get(`/api/chats/by-username/${ch.username}`), byUsernameBody).chat.requestPending).toBe(true);
    // Повторная подача не дублирует заявку.
    expectOk(await u1.api.post(`/api/chats/${ch.id}/join`), joinPendingBody);
    expectOk(await u2.api.post(`/api/chats/${ch.id}/join`), joinPendingBody);

    expectError(await member.api.get(`/api/chats/${ch.id}/join-requests`), 403, NO_RIGHTS);
    expectError(await member.api.post(`/api/chats/${ch.id}/join-requests/${u1.id}`, { approve: true }), 403, NO_RIGHTS);
    expectError(await u1.api.get(`/api/chats/${ch.id}/join-requests`), 404, NOT_FOUND);

    const list = expectOk(await a.api.get(`/api/chats/${ch.id}/join-requests`), joinRequestsBody).requests;
    expect(list.map((r) => r.userId)).toEqual([u1.id, u2.id]);
    expect(list[0]).toMatchObject({ chatId: ch.id, user: { id: u1.id, name: "Первый" } });

    const approved = expectOk(await a.api.post(`/api/chats/${ch.id}/join-requests/${u1.id}`, {}), joinDecisionBody);
    expect(approved).toMatchObject({ ok: true, approved: true });
    expect(approved.chat?.memberIds).toContain(u1.id);
    await u1Ws.waitFor("chat:added", (e) => e.chat?.id === ch.id);
    await mWs.waitFor("chat:updated", (e) => e.chat?.id === ch.id);

    const declined = expectOk(await a.api.post(`/api/chats/${ch.id}/join-requests/${u2.id}`, { approve: false }), joinDecisionBody);
    expect(declined).toEqual({ ok: true, approved: false });
    const ev = await u2Ws.waitFor("chat:join-declined", (e) => e.chatId === ch.id);
    expect(ev).toEqual({ type: "chat:join-declined", chatId: ch.id, title: "Публичный" });

    expectError(await a.api.post(`/api/chats/${ch.id}/join-requests/${u2.id}`, {}), 404, "Заявка не найдена");
    expect(expectOk(await a.api.get(`/api/chats/${ch.id}/join-requests`), joinRequestsBody).requests).toEqual([]);
  });
});

describe("ссылки-приглашения", () => {
  test("создание, повтор, отзыв; ограничения", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const dm = await createDm(a, b);
    const group = await createGroup(a, [b]);
    expectError(await a.api.post(`/api/chats/${dm.id}/invite`), 400, "Пригласительная ссылка есть только у групп и каналов");
    expectError(await b.api.post(`/api/chats/${group.id}/invite`), 403, NO_RIGHTS);

    const first = expectOk(await a.api.post(`/api/chats/${group.id}/invite`), inviteCreateBody);
    expect(first.chat.inviteCode).toBe(first.code);
    const again = expectOk(await a.api.post(`/api/chats/${group.id}/invite`, {}), inviteCreateBody);
    expect(again.code).toBe(first.code);
    const revoked = expectOk(await a.api.post(`/api/chats/${group.id}/invite`, { revoke: true }), inviteCreateBody);
    expect(revoked.code).not.toBe(first.code);
    expectError(await b.api.get(`/api/chats/invite/${first.code}`), 404, "Ссылка недействительна или отозвана");
    expectError(await b.api.post(`/api/chats/invite/${first.code}/join`), 404, "Ссылка недействительна или отозвана");
  });

  test("вступление в приватную группу по ссылке", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const joiner = await registerUser(baseUrl, { name: "Гость" });
    const outsider = await registerUser(baseUrl);
    const group = await createGroup(a, [b], { title: "Тайная", description: "для своих" });
    const { code } = expectOk(await a.api.post(`/api/chats/${group.id}/invite`), inviteCreateBody);
    const [bWs, jWs, outWs] = await Promise.all([ws(b.api), ws(joiner.api), ws(outsider.api)]);

    const info = expectOk(await joiner.api.get(`/api/chats/invite/${code}`), inviteInfoBody);
    expect(info.chat).toEqual({
      id: group.id,
      type: "group",
      title: "Тайная",
      description: "для своих",
      avatarColor: "#2E56D9",
      memberCount: 2,
      alreadyMember: false,
      banned: false,
      approveJoins: false,
      requestPending: false,
    });

    expectOk(await joiner.api.post(`/api/chats/invite/${code}/join`), chatBody);
    await jWs.waitFor("chat:added", (e) => e.chat?.id === group.id);
    await bWs.waitFor("chat:updated", (e) => e.chat?.id === group.id);
    await outWs.expectNone("chat:updated");
    expect(expectOk(await joiner.api.get(`/api/chats/${group.id}`), chatCard).chat.lastMessage).toMatchObject({
      type: "system",
      text: "Гость вступил(а) в группу по ссылке-приглашению",
    });
    expect(expectOk(await joiner.api.get(`/api/chats/invite/${code}`), inviteInfoBody).chat).toMatchObject({ alreadyMember: true, memberCount: 3 });
    // Повторное вступление ничего не ломает.
    expect(expectOk(await joiner.api.post(`/api/chats/invite/${code}/join`), chatBody).chat.memberIds).toHaveLength(3);
  });

  test("по ссылке в канал — chat:updated подписчикам; заблокированным нельзя; с одобрением — заявка", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const joiner = await registerUser(baseUrl);
    const channel = await createChannel(a, [b], { title: "Канал по ссылке" });
    const { code } = expectOk(await a.api.post(`/api/chats/${channel.id}/invite`), inviteCreateBody);
    const bWs = await ws(b.api);

    expectOk(await joiner.api.post(`/api/chats/invite/${code}/join`), chatBody);
    // Как при вступлении через POST /:id/join и одобрении заявки.
    await bWs.waitFor("chat:updated", (e) => e.chat?.id === channel.id);

    expectOk(await a.api.post(`/api/chats/${channel.id}/members`, { userId: joiner.id, role: "ban" }), chatBody);
    expect(expectOk(await joiner.api.get(`/api/chats/invite/${code}`), inviteInfoBody).chat).toMatchObject({ banned: true, alreadyMember: false });
    expectError(await joiner.api.post(`/api/chats/invite/${code}/join`), 403, "Вас заблокировали в этом чате");

    expectOk(await a.api.post(`/api/chats/${channel.id}/settings`, { approveJoins: true }), chatBody);
    const late = await registerUser(baseUrl);
    const pending = expectOk(await late.api.post(`/api/chats/invite/${code}/join`), invitePendingBody);
    expect(pending.chat).toEqual({ id: channel.id, title: "Канал по ссылке", type: "channel" });
    expect(expectOk(await late.api.get(`/api/chats/invite/${code}`), inviteInfoBody).chat).toMatchObject({ approveJoins: true, requestPending: true });
  });
});

describe("GET /:id/banned", () => {
  test("видят владельцы, админы и модераторы", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const mod = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const bad = await registerUser(baseUrl, { name: "Хулиган" });
    const group = await createGroup(a, [mod, b, bad]);
    expectOk(await a.api.post(`/api/chats/${group.id}/members`, { userId: mod.id, role: "mod" }), chatBody);
    expect(expectOk(await a.api.get(`/api/chats/${group.id}/banned`), bannedBody).users).toEqual([]);

    expectOk(await a.api.post(`/api/chats/${group.id}/members`, { userId: bad.id, role: "ban" }), chatBody);
    const list = expectOk(await mod.api.get(`/api/chats/${group.id}/banned`), bannedBody).users;
    expect(list.map((u) => u.id)).toEqual([bad.id]);
    expect(list[0].name).toBe("Хулиган");
    expectError(await b.api.get(`/api/chats/${group.id}/banned`), 403, NO_RIGHTS);
    expectError(await bad.api.get(`/api/chats/${group.id}/banned`), 404, NOT_FOUND);
  });
});
