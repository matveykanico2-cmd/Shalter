// Чаты сообщества: добавление (сразу или заявкой), видимость, удаление из сообщества,
// заявки на добавление при режиме «только админы».
import { describe, expect, test } from "vitest";
import { chatCard } from "../../schemas/chats";
import { communityBody, communityRequestedBody, requestsBody, resolveBody } from "../../schemas/communities";
import { expectError, expectOk } from "../../support/expect";
import { createChannel, createDm, createGroup, registerUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { aboutCommunity, admit, createCommunity, NO_RIGHTS, wsPool } from "./helpers";

const server = useServer();
const ws = wsPool();

const chatsOf = (community: any) => community.chats.map((c: any) => c.id);

describe("POST /:id/chats", () => {
  test("ошибки: не участник, чужой/личный/занятый чат", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const outsider = await registerUser(baseUrl);
    const shared = await createGroup(a, [b]);
    const c = await createCommunity(a, { chatId: shared.id });
    const outsiders = await createGroup(outsider, []);
    const bPlain = await createGroup(a, [b]);
    const dm = await createDm(b, a);
    const other = await createCommunity(b);
    const taken = await createGroup(b, []);
    expectOk(await b.api.post(`/api/communities/${other.id}/chats`, { chatId: taken.id }), communityBody);

    expectError(await outsider.api.post(`/api/communities/${c.id}/chats`, { chatId: outsiders.id }), 403, "Добавлять чаты могут только участники сообщества");
    expectError(await b.api.post(`/api/communities/${c.id}/chats`, {}), 404, "Чат не найден");
    expectError(await b.api.post(`/api/communities/${c.id}/chats`, { chatId: 123 }), 404, "Чат не найден");
    expectError(await b.api.post(`/api/communities/${c.id}/chats`, { chatId: outsiders.id }), 404, "Чат не найден");
    expectError(await b.api.post(`/api/communities/${c.id}/chats`, { chatId: dm.id }), 400, "В сообщество добавляются группы и каналы");
    expectError(await b.api.post(`/api/communities/${c.id}/chats`, { chatId: bPlain.id }), 403, "Добавить чат может только его владелец или администратор");
    expectError(await b.api.post(`/api/communities/${c.id}/chats`, { chatId: taken.id }), 409, "Этот чат уже входит в сообщество");
    expectError(await a.api.post(`/api/communities/${c.id}/chats`, { chatId: shared.id }), 409, "Этот чат уже входит в сообщество");
  });

  test("addMode «all»: участник добавляет свой чат сразу; служебная строка и community:updated", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const sub = await registerUser(baseUrl);
    const outsider = await registerUser(baseUrl);
    const shared = await createGroup(a, [b]);
    const c = await createCommunity(a, { title: "Клуб", chatId: shared.id });
    const channel = await createChannel(b, [sub]);
    const [aWs, subWs, outWs] = await Promise.all([ws(a), ws(sub), ws(outsider)]);

    const res = expectOk(await b.api.post(`/api/communities/${c.id}/chats`, { chatId: channel.id, visible: "false" }), communityBody).community;
    expect(chatsOf(res)).toEqual([shared.id, channel.id]);
    expect(res.chats[1]).toEqual({
      id: channel.id,
      type: "channel",
      title: "Канал",
      username: null,
      avatarColor: channel.avatarColor,
      avatarImage: null,
      isPublic: false,
      approveJoins: false,
      members: 2,
      isMember: true,
      isChatAdmin: true,
      visible: false,
      addedBy: b.id,
    });
    await subWs.waitFor("message:new", (e) => e.chatId === channel.id && e.message?.text === "Канал добавлен в сообщество «Клуб»");
    // Подписчики нового чата тоже становятся участниками сообщества и получают событие.
    await subWs.waitFor("community:updated", aboutCommunity(c.id));
    await aWs.waitFor("community:updated", aboutCommunity(c.id));
    await outWs.expectNone("community:updated");
    expect(expectOk(await a.api.get(`/api/communities/${c.id}`), communityBody).community.membersCount).toBe(3);
  });

  test("addMode «admins»: участник подаёт заявку; управляющим — community:updated", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const shared = await createGroup(a, [b]);
    const c = await createCommunity(a, { chatId: shared.id, addMode: "admins" });
    const mine = await createGroup(b, []);
    const [aWs, bWs] = await Promise.all([ws(a), ws(b)]);

    const res = expectOk(await b.api.post(`/api/communities/${c.id}/chats`, { chatId: mine.id }), communityRequestedBody);
    expect(res.requested).toBe(true);
    expect(chatsOf(res.community)).toEqual([shared.id]);
    // Участник счётчик заявок не видит.
    expect(res.community.requestsCount).toBe(0);
    await aWs.waitFor("community:updated", aboutCommunity(c.id));
    await bWs.expectNone("community:updated");
    expect(expectOk(await a.api.get(`/api/communities/${c.id}`), communityBody).community.requestsCount).toBe(1);

    expectError(await b.api.post(`/api/communities/${c.id}/chats`, { chatId: mine.id }), 409, "Заявка на этот чат уже отправлена");
    // Владелец при «только админы» добавляет сразу.
    const own = await createGroup(a, []);
    expect(chatsOf(expectOk(await a.api.post(`/api/communities/${c.id}/chats`, { chatId: own.id }), communityBody).community)).toContain(own.id);
  });
});

describe("PATCH /:id/chats/:chatId — видимость", () => {
  test("скрыть и показать чат", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const joiner = await registerUser(baseUrl);
    const shared = await createGroup(a, [b]);
    const extra = await createGroup(a, []);
    const lonely = await createGroup(a, []);
    const c = await createCommunity(a, { chatId: shared.id });
    expectOk(await a.api.post(`/api/communities/${c.id}/chats`, { chatId: extra.id }), communityBody);
    await admit(a, c.id, [joiner]);
    const bWs = await ws(b);

    expectError(await b.api.patch(`/api/communities/${c.id}/chats/${extra.id}`, { visible: false }), 403, NO_RIGHTS);
    expectError(await a.api.patch(`/api/communities/${c.id}/chats/${lonely.id}`, { visible: false }), 404, "Чат не входит в сообщество");
    expectError(await a.api.patch(`/api/communities/${c.id}/chats/${extra.id}`, {}), 400, "Нужно visible: true или false");
    expectError(await a.api.patch(`/api/communities/${c.id}/chats/${extra.id}`, { visible: "nope" }), 400, "Нужно visible: true или false");

    const hidden = expectOk(await a.api.patch(`/api/communities/${c.id}/chats/${extra.id}`, { visible: 0 }), communityBody).community;
    expect(hidden.chats.find((x) => x.id === extra.id)?.visible).toBe(false);
    await bWs.waitFor("community:updated", aboutCommunity(c.id));
    expect(chatsOf(expectOk(await joiner.api.get(`/api/communities/${c.id}`), communityBody).community)).toEqual([shared.id]);

    expectOk(await a.api.patch(`/api/communities/${c.id}/chats/${extra.id}`, { visible: true }), communityBody);
    expect(chatsOf(expectOk(await joiner.api.get(`/api/communities/${c.id}`), communityBody).community)).toEqual([shared.id, extra.id]);
  });
});

describe("DELETE /:id/chats/:chatId", () => {
  test("убирает управляющий чатами или админ самого чата", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const onlyInB = await registerUser(baseUrl);
    const plain = await registerUser(baseUrl);
    const shared = await createGroup(a, [b, plain]);
    const c = await createCommunity(a, { title: "Клуб", chatId: shared.id });
    const bChat = await createGroup(b, [onlyInB]);
    expectOk(await b.api.post(`/api/communities/${c.id}/chats`, { chatId: bChat.id }), communityBody);
    const lonely = await createGroup(a, []);
    const [onlyWs, plainWs] = await Promise.all([ws(onlyInB), ws(plain)]);

    expectError(await a.api.delete(`/api/communities/${c.id}/chats/${lonely.id}`), 404, "Чат не входит в сообщество");
    // Рядовой участник сообщества, не админ чата.
    expectError(await plain.api.delete(`/api/communities/${c.id}/chats/${bChat.id}`), 403, NO_RIGHTS);
    expectError(await plain.api.delete(`/api/communities/${c.id}/chats/${shared.id}`), 403, NO_RIGHTS);

    // Админ чата (без прав в сообществе) убирает свой чат.
    const after = expectOk(await b.api.delete(`/api/communities/${c.id}/chats/${bChat.id}`), communityBody).community;
    expect(chatsOf(after)).toEqual([shared.id]);
    await onlyWs.waitFor("message:new", (e) => e.chatId === bChat.id && e.message?.text === "Группа больше не входит в сообщество «Клуб»");
    // Событие получает и тот, кто был участником только через этот чат.
    await onlyWs.waitFor("community:updated", aboutCommunity(c.id));
    await plainWs.waitFor("community:updated", aboutCommunity(c.id));
    expect(expectOk(await onlyInB.api.get(`/api/communities/${c.id}`), communityBody).community.role).toBeNull();
    expectOk(await onlyInB.api.get(`/api/chats/${bChat.id}`), chatCard);

    // Владелец сообщества убирает и чужой чат.
    expectOk(await b.api.post(`/api/communities/${c.id}/chats`, { chatId: bChat.id }), communityBody);
    expect(chatsOf(expectOk(await a.api.delete(`/api/communities/${c.id}/chats/${bChat.id}`), communityBody).community)).toEqual([shared.id]);
  });
});

describe("заявки: GET /:id/requests, POST /:id/requests/:requestId", () => {
  test("список, одобрение одной, отклонение всех", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl, { name: "Борис" });
    const bSub = await registerUser(baseUrl);
    const outsider = await registerUser(baseUrl);
    const shared = await createGroup(a, [b]);
    const c = await createCommunity(a, { title: "Клуб", chatId: shared.id, addMode: "admins" });
    const g1 = await createGroup(b, [bSub], { title: "Первая" });
    const g2 = await createGroup(b, []);
    const g3 = await createChannel(b, []);
    expectOk(await b.api.post(`/api/communities/${c.id}/chats`, { chatId: g1.id, visible: false }), communityRequestedBody);
    expectOk(await b.api.post(`/api/communities/${c.id}/chats`, { chatId: g2.id }), communityRequestedBody);
    expectOk(await b.api.post(`/api/communities/${c.id}/chats`, { chatId: g3.id }), communityRequestedBody);

    expectError(await b.api.get(`/api/communities/${c.id}/requests`), 403, NO_RIGHTS);
    expectError(await outsider.api.get(`/api/communities/${c.id}/requests`), 403, NO_RIGHTS);
    expectError(await b.api.post(`/api/communities/${c.id}/requests/all`, { approve: true }), 403, NO_RIGHTS);

    const list = expectOk(await a.api.get(`/api/communities/${c.id}/requests`), requestsBody).requests;
    expect(list.map((r) => r.chatId)).toEqual([g1.id, g2.id, g3.id]);
    expect(list[0]).toMatchObject({
      communityId: c.id,
      chatId: g1.id,
      visible: false,
      suggestedBy: { id: b.id, name: "Борис" },
      chat: { id: g1.id, title: "Первая", isMember: false, isChatAdmin: false, visible: true, addedBy: null, members: 2 },
    });
    expectError(await a.api.post(`/api/communities/${c.id}/requests/cr_nonexistent00`, { approve: true }), 404, "Заявка не найдена");

    const [bWs, subWs] = await Promise.all([ws(b), ws(bSub)]);
    const approved = expectOk(await a.api.post(`/api/communities/${c.id}/requests/${list[0].id}`, { approve: true }), resolveBody);
    expect(approved).toMatchObject({ added: 1, declined: 0 });
    // Видимость из заявки и автор заявки — как добавивший.
    expect(approved.community.chats.find((x) => x.id === g1.id)).toMatchObject({ visible: false, addedBy: b.id });
    expect(approved.community.requestsCount).toBe(2);
    await subWs.waitFor("message:new", (e) => e.chatId === g1.id && e.message?.text === "Группа добавлена в сообщество «Клуб»");
    await subWs.waitFor("community:updated", aboutCommunity(c.id));
    expectError(await a.api.post(`/api/communities/${c.id}/requests/${list[0].id}`, { approve: true }), 404, "Заявка не найдена");

    // Заявка из чужого сообщества по своему id не находится.
    const other = await createCommunity(a, { addMode: "admins" });
    await admit(a, other.id, [b]);
    const g4 = await createGroup(b, []);
    expectOk(await b.api.post(`/api/communities/${other.id}/chats`, { chatId: g4.id }), communityRequestedBody);
    const otherReq = expectOk(await a.api.get(`/api/communities/${other.id}/requests`), requestsBody).requests[0];
    expectError(await a.api.post(`/api/communities/${c.id}/requests/${otherReq.id}`, { approve: true }), 404, "Заявка не найдена");

    bWs.clear();
    // Без approve: true — отклонение; «all» — сразу все заявки.
    const declined = expectOk(await a.api.post(`/api/communities/${c.id}/requests/all`, {}), resolveBody);
    expect(declined).toMatchObject({ added: 0, declined: 2 });
    expect(declined.community.requestsCount).toBe(0);
    expect(declined.community.chats.map((x) => x.id)).toEqual([shared.id, g1.id]);
    await bWs.waitFor("community:updated", aboutCommunity(c.id));
    expect(expectOk(await a.api.get(`/api/communities/${c.id}/requests`), requestsBody).requests).toEqual([]);
    expectError(await a.api.post(`/api/communities/${c.id}/requests/all`, { approve: true }), 404, "Заявка не найдена");

    // После отклонения можно подать заново.
    expectOk(await b.api.post(`/api/communities/${c.id}/chats`, { chatId: g2.id }), communityRequestedBody);
  });

  test("добавление чата в одно сообщество снимает его заявки в другие", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const strict = await createCommunity(a, { addMode: "admins" });
    const open = await createCommunity(a);
    await admit(a, strict.id, [b]);
    await admit(a, open.id, [b]);
    const g = await createGroup(b, []);
    expectOk(await b.api.post(`/api/communities/${strict.id}/chats`, { chatId: g.id }), communityRequestedBody);
    expectOk(await b.api.post(`/api/communities/${open.id}/chats`, { chatId: g.id }), communityBody);
    expect(expectOk(await a.api.get(`/api/communities/${strict.id}/requests`), requestsBody).requests).toEqual([]);
  });
});
