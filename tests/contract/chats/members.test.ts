// Участники и роли: POST /:id/members (add/kick/ban/unban/promote/demote/mod/unmod/
// owner/unowner/transfer), теги участников, ограничения, выход, удаление и очистка
// чата, «удалить у себя», журнал администраторов.
import { describe, expect, test } from "vitest";
import { chat } from "../../schemas/chat";
import { adminLogBody, chatBody, chatCard, chatList, leaveBody, slowModeBody } from "../../schemas/chats";
import { okBody } from "../../schemas/common";
import { expectError, expectOk, expectShape, expectStatus } from "../../support/expect";
import { createChannel, createDm, createGroup, registerUser, sendText, type TestUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { anonymous, NO_RIGHTS, NOT_FOUND, wsPool } from "./helpers";

const server = useServer();
const ws = wsPool();

const member = (actor: TestUser, chatId: string, role: string, userId: string) =>
  actor.api.post(`/api/chats/${chatId}/members`, { userId, role });

async function lastMessageOf(user: TestUser, chatId: string) {
  return expectOk(await user.api.get(`/api/chats/${chatId}`), chatCard).chat.lastMessage;
}

describe("без сессии", () => {
  test("401", async () => {
    const api = anonymous(server().baseUrl);
    const id = "c_whatever00";
    for (const res of await Promise.all([
      api.post(`/api/chats/${id}/members`, {}),
      api.post(`/api/chats/${id}/title`, {}),
      api.post(`/api/chats/${id}/restrict`, {}),
      api.post(`/api/chats/${id}/leave`),
      api.post(`/api/chats/${id}/clear`),
      api.post(`/api/chats/${id}/delete-for-me`),
      api.get(`/api/chats/${id}/admin-log`),
    ])) expectError(res, 401, "unauthorized");
  });

  test("постороннему — 404", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const outsider = await registerUser(baseUrl);
    const group = await createGroup(a, []);
    const api = outsider.api;
    const id = group.id;
    for (const res of await Promise.all([
      api.post(`/api/chats/${id}/members`, { userId: outsider.id, role: "add" }),
      api.post(`/api/chats/${id}/title`, { userId: a.id, title: "x" }),
      api.post(`/api/chats/${id}/restrict`, { userId: a.id }),
      api.post(`/api/chats/${id}/leave`),
      api.post(`/api/chats/${id}/clear`),
      api.post(`/api/chats/${id}/delete-for-me`),
      api.get(`/api/chats/${id}/admin-log`),
      api.delete(`/api/chats/${id}`),
    ])) expectError(res, 404, NOT_FOUND);
    expectError(await a.api.delete("/api/chats/c_nonexistent00"), 404, NOT_FOUND);
  });
});

describe("добавление участников", () => {
  test("админ добавляет: chat:added новому, служебная строка; ошибки", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl, { name: "Алиса" });
    const b = await registerUser(baseUrl);
    const c = await registerUser(baseUrl, { name: "Вера" });
    const shy = await registerUser(baseUrl);
    const outsider = await registerUser(baseUrl);
    const group = await createGroup(a, [b]);
    const [bWs, cWs, outWs] = await Promise.all([ws(b.api), ws(c.api), ws(outsider.api)]);

    expectError(await member(a, group.id, "add", b.id), 400, "Уже в чате");
    expectError(await member(a, group.id, "add", "u_nonexistent00"), 404, "Пользователь не найден");
    expectStatus(await shy.api.patch("/api/settings", { privacy: { invites: "nobody" } }), 200);
    expectError(await member(a, group.id, "add", shy.id), 403, "Пользователь ограничил добавление в чаты");

    const updated = expectOk(await member(a, group.id, "add", c.id), chatBody).chat;
    expect(updated.memberIds).toContain(c.id);
    const added = await cWs.waitFor("chat:added", (e) => e.chat?.id === group.id);
    expectShape(chat, added.chat);
    // Прежние участники узнают о новом из служебного сообщения, отдельного chat:updated нет.
    await bWs.waitFor("message:new", (e) => e.chatId === group.id && e.message.text === "Алиса добавил(а) в группу Вера");
    await outWs.expectNone("chat:added");
    await outWs.expectNone("message:new");
    expect(await lastMessageOf(c, group.id)).toMatchObject({ type: "system", text: "Алиса добавил(а) в группу Вера" });
  });

  test("в канал — без служебной строки; рядовой участник без прав — 403", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const c = await registerUser(baseUrl);
    const channel = await createChannel(a, [b]);
    expectOk(await member(a, channel.id, "add", c.id), chatBody);
    expect(await lastMessageOf(c, channel.id)).toMatchObject({ text: expect.stringContaining("создан") });
    // В канале подписчик добавлять не может, даже если право addMembers по умолчанию открыто.
    const d = await registerUser(baseUrl);
    expectError(await member(b, channel.id, "add", d.id), 403, NO_RIGHTS);
  });

  test("в группе участник может добавлять (addMembers), но не кикать", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const c = await registerUser(baseUrl);
    const group = await createGroup(a, [b]);
    expectOk(await member(b, group.id, "add", c.id), chatBody);
    for (const role of ["kick", "ban", "unban", "promote", "demote", "mod"]) {
      expectError(await member(b, group.id, role, c.id), 403, NO_RIGHTS);
    }
  });
});

describe("удаление и блокировка", () => {
  test("kick / ban / unban: события, служебные строки, bannedIds", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl, { name: "Алиса" });
    const b = await registerUser(baseUrl);
    const c = await registerUser(baseUrl, { name: "Вера" });
    const outsider = await registerUser(baseUrl);
    const group = await createGroup(a, [b, c]);
    const [bWs, cWs, outWs] = await Promise.all([ws(b.api), ws(c.api), ws(outsider.api)]);

    expectError(await member(a, group.id, "kick", outsider.id), 404, "Пользователь не в чате");
    expectError(await member(a, group.id, "kick", a.id), 400, "Сначала снимите с участника права владельца");

    const kicked = expectOk(await member(a, group.id, "kick", c.id), chatBody).chat;
    expect(kicked.memberIds).not.toContain(c.id);
    expect(kicked.bannedIds).toEqual([]);
    const del = await cWs.waitFor("chat:deleted", (e) => e.chatId === group.id);
    expect(del).toEqual({ type: "chat:deleted", chatId: group.id });
    await bWs.waitFor("chat:updated", (e) => e.chat?.id === group.id);
    await bWs.waitFor("message:new", (e) => e.message?.text === "Алиса удалил(а) из группы Вера");
    await outWs.expectNone("chat:deleted");
    expectError(await c.api.get(`/api/chats/${group.id}`), 404, NOT_FOUND);

    // Вернуть кикнутого можно, а забаненный вернуться сам не может.
    expectOk(await member(a, group.id, "add", c.id), chatBody);
    const banned = expectOk(await member(a, group.id, "ban", c.id), chatBody).chat;
    expect(banned.bannedIds).toEqual([c.id]);
    expect(await lastMessageOf(a, group.id)).toMatchObject({ text: "Алиса заблокировал(а) Вера" });

    const unbanned = expectOk(await member(a, group.id, "unban", c.id), chatBody).chat;
    expect(unbanned.bannedIds).toEqual([]);
    expect(unbanned.memberIds).not.toContain(c.id);

    // Админ, добавляя забаненного, снимает бан.
    expectOk(await member(a, group.id, "ban", b.id), chatBody);
    const back = expectOk(await member(a, group.id, "add", b.id), chatBody).chat;
    expect(back.memberIds).toContain(b.id);
    expect(back.bannedIds).toEqual([]);
  });

  test("админа удаляет только владелец; модератор может только add/kick/ban/unban", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const admin1 = await registerUser(baseUrl);
    const admin2 = await registerUser(baseUrl);
    const mod = await registerUser(baseUrl);
    const plain = await registerUser(baseUrl);
    const group = await createGroup(a, [admin1, admin2, mod, plain], { adminIds: [admin1.id, admin2.id] });
    expectOk(await member(a, group.id, "mod", mod.id), chatBody);

    expectError(await member(admin1, group.id, "kick", admin2.id), 403, "Удалить администратора может только владелец");
    expectError(await member(mod, group.id, "promote", plain.id), 403, "Модератор может только добавлять и удалять участников");
    expectError(await member(mod, group.id, "mod", plain.id), 403, "Модератор может только добавлять и удалять участников");
    expectOk(await member(mod, group.id, "kick", plain.id), chatBody);
    expectOk(await member(mod, group.id, "add", plain.id), chatBody);
  });
});

describe("роли", () => {
  test("promote / demote / mod / unmod", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl, { name: "Алиса" });
    const b = await registerUser(baseUrl, { name: "Боб" });
    const c = await registerUser(baseUrl, { name: "Вера" });
    const outsider = await registerUser(baseUrl);
    const group = await createGroup(a, [b, c]);
    const [aWs, cWs] = await Promise.all([ws(a.api), ws(c.api)]);

    expectError(await member(a, group.id, "promote", outsider.id), 404, "Пользователь не в чате");
    const promoted = expectOk(await member(a, group.id, "promote", b.id), chatBody).chat;
    expect([...promoted.adminIds].sort()).toEqual([a.id, b.id].sort());
    await cWs.waitFor("chat:updated", (e) => e.chat?.id === group.id && e.chat.adminIds.includes(b.id));
    // Служебная строка о роли пишется асинхронно, после ответа.
    await aWs.waitFor("message:new", (e) => e.message?.text === "Алиса назначил(а) Боб администратором");

    expectOk(await member(a, group.id, "promote", c.id), chatBody);
    expectError(await member(b, group.id, "demote", c.id), 403, "Снять другого администратора может только владелец");
    // Себя снять можно.
    const selfDemoted = expectOk(await member(b, group.id, "demote", b.id), chatBody).chat;
    expect(selfDemoted.adminIds).not.toContain(b.id);
    await aWs.waitFor("message:new", (e) => e.message?.text === "Боб больше не администратор");
    expectOk(await member(a, group.id, "demote", c.id), chatBody);
    await aWs.waitFor("message:new", (e) => e.message?.text === "Алиса снял(а) Вера с должности администратора");

    expectError(await member(a, group.id, "mod", outsider.id), 404, "Пользователь не в чате");
    expect(expectOk(await member(a, group.id, "mod", c.id), chatBody).chat.moderatorIds).toEqual([c.id]);
    await aWs.waitFor("message:new", (e) => e.message?.text === "Алиса назначил(а) Вера модератором");
    expect(expectOk(await member(a, group.id, "unmod", c.id), chatBody).chat.moderatorIds).toEqual([]);
    await aWs.waitFor("message:new", (e) => e.message?.text === "Алиса снял(а) Вера с должности модератора");

    expectError(await member(a, group.id, "superstar", c.id), 400, "unknown role");
  });

  test("совладельцы: owner / unowner", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const c = await registerUser(baseUrl);
    const outsider = await registerUser(baseUrl);
    const group = await createGroup(a, [b, c], { adminIds: [b.id] });

    expectError(await member(b, group.id, "owner", c.id), 403, "Управлять владельцами может только владелец");
    expectError(await member(a, group.id, "owner", outsider.id), 404, "Пользователь не в чате");
    expectError(await member(a, group.id, "unowner", c.id), 400, "Этот участник не владелец");
    expectError(await member(a, group.id, "unowner", a.id), 400, "В чате должен остаться хотя бы один владелец");

    const co = expectOk(await member(a, group.id, "owner", c.id), chatBody).chat;
    expect([...co.ownerIds].sort()).toEqual([a.id, c.id].sort());
    expect(co.adminIds).toContain(c.id);
    expect(co.ownerId).toBe(a.id);
    // Совладелец снимает основного владельца — основным становится он сам.
    const swapped = expectOk(await member(c, group.id, "unowner", a.id), chatBody).chat;
    expect(swapped).toMatchObject({ ownerId: c.id, ownerIds: [c.id] });
    // Бывший владелец остаётся админом.
    expect(swapped.adminIds).toContain(a.id);
  });

  test("передача владения", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl, { name: "Алиса" });
    const b = await registerUser(baseUrl, { name: "Боб" });
    const outsider = await registerUser(baseUrl);
    const group = await createGroup(a, [b], { adminIds: [b.id] });
    const bWs = await ws(b.api);

    // Админ, но не владелец.
    expectError(await member(b, group.id, "transfer", b.id), 403, "Передать чат может только владелец");
    expectError(await member(a, group.id, "transfer", a.id), 400, "Вы уже владелец");
    expectError(await member(a, group.id, "transfer", outsider.id), 404, "Пользователь не в чате");

    const moved = expectOk(await member(a, group.id, "transfer", b.id), chatBody).chat;
    expect(moved).toMatchObject({ ownerId: b.id, ownerIds: [b.id] });
    expect([...moved.adminIds].sort()).toEqual([a.id, b.id].sort());
    await bWs.waitFor("chat:updated", (e) => e.chat?.id === group.id && e.chat.ownerId === b.id);
    expect(await lastMessageOf(a, group.id)).toMatchObject({ type: "system", text: "Алиса передал(а) права владельца: Боб" });
    expectError(await member(a, group.id, "transfer", a.id), 403, "Передать чат может только владелец");
  });
});

describe("POST /:id/title (теги участников)", () => {
  test("кто кому может ставить тег", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const admin = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const c = await registerUser(baseUrl);
    const outsider = await registerUser(baseUrl);
    const group = await createGroup(a, [admin, b, c], { adminIds: [admin.id] });
    const cWs = await ws(c.api);
    const DENY = "Недостаточно прав, чтобы менять этот тег";

    expectError(await a.api.post(`/api/chats/${group.id}/title`, { userId: outsider.id, title: "x" }), 404, "Пользователь не в чате");

    const t = expectOk(await a.api.post(`/api/chats/${group.id}/title`, { userId: admin.id, title: "  Главный помощник этого чата!!  " }), chatBody).chat;
    expect(t.memberTitles).toEqual({ [admin.id]: "Главный помощник этого ч" });
    await cWs.waitFor("chat:updated", (e) => e.chat?.id === group.id);

    expectOk(await admin.api.post(`/api/chats/${group.id}/title`, { userId: b.id, title: "Новичок" }), chatBody);
    expectError(await admin.api.post(`/api/chats/${group.id}/title`, { userId: a.id, title: "x" }), 403, DENY);
    expectError(await b.api.post(`/api/chats/${group.id}/title`, { userId: c.id, title: "x" }), 403, DENY);
    expectOk(await c.api.post(`/api/chats/${group.id}/title`, { userId: c.id, title: "Я" }), chatBody);

    const cleared = expectOk(await b.api.post(`/api/chats/${group.id}/title`, { userId: b.id, title: "" }), chatBody).chat;
    expect(cleared.memberTitles).toEqual({ [admin.id]: "Главный помощник этого ч", [c.id]: "Я" });
  });
});

describe("POST /:id/restrict", () => {
  test("запрет писать: навсегда, до срока и снятие", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl, { name: "Алиса" });
    const admin = await registerUser(baseUrl);
    const b = await registerUser(baseUrl, { name: "Боб" });
    const outsider = await registerUser(baseUrl);
    const group = await createGroup(a, [admin, b], { adminIds: [admin.id] });
    const bWs = await ws(b.api);

    expectError(await b.api.post(`/api/chats/${group.id}/restrict`, { userId: a.id, until: "forever" }), 403, NO_RIGHTS);
    expectError(await admin.api.post(`/api/chats/${group.id}/restrict`, { userId: a.id, until: "forever" }), 400, "Нельзя ограничить владельца или администратора");
    expectError(await a.api.post(`/api/chats/${group.id}/restrict`, { userId: admin.id, until: "forever" }), 400, "Нельзя ограничить владельца или администратора");
    expectError(await a.api.post(`/api/chats/${group.id}/restrict`, { userId: outsider.id, until: "forever" }), 404, NOT_FOUND);

    const r = expectOk(await a.api.post(`/api/chats/${group.id}/restrict`, { userId: b.id, until: "forever" }), chatBody).chat;
    expect(r.restrictions).toEqual({ [b.id]: "forever" });
    expect(await lastMessageOf(a, group.id)).toMatchObject({ type: "system", text: "Алиса запретил(а) писать Боб" });
    expectError(await b.api.post(`/api/chats/${group.id}/messages`, { text: "можно?" }), 403, "Вам запрещено писать в этом чате");
    // Участникам (и самому ограниченному) — chat:updated с новыми ограничениями.
    const upd = await bWs.waitFor("chat:updated", (e) => e.chat?.id === group.id);
    expect(upd.chat.restrictions).toEqual({ [b.id]: "forever" });

    const until = new Date(Date.now() + 3600_000).toISOString();
    expect(expectOk(await a.api.post(`/api/chats/${group.id}/restrict`, { userId: b.id, until }), chatBody).chat.restrictions).toEqual({ [b.id]: until });
    expect((await lastMessageOf(a, group.id))?.text).toMatch(/^Алиса запретил\(а\) писать Боб до .+ \(МСК\)$/);
    expectError(await b.api.post(`/api/chats/${group.id}/messages`, { text: "а теперь?" }), 403, "Вам запрещено писать в этом чате");

    const past = new Date(Date.now() - 1000).toISOString();
    expectOk(await a.api.post(`/api/chats/${group.id}/restrict`, { userId: b.id, until: past }), chatBody);
    // Истёкший срок не мешает писать.
    await sendText(b, group.id, "срок вышел");

    const lifted = expectOk(await a.api.post(`/api/chats/${group.id}/restrict`, { userId: b.id }), chatBody).chat;
    expect(lifted.restrictions).toEqual({});
    expect(await lastMessageOf(a, group.id)).toMatchObject({ text: "Алиса снова разрешил(а) писать Боб" });
  });
});

describe("POST /:id/leave", () => {
  test("участник выходит из группы", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl, { name: "Боб" });
    const outsider = await registerUser(baseUrl);
    const group = await createGroup(a, [b]);
    const [aWs, bWs, outWs] = await Promise.all([ws(a.api), ws(b.api), ws(outsider.api)]);

    expect(expectOk(await b.api.post(`/api/chats/${group.id}/leave`), leaveBody)).toEqual({ ok: true, deleted: false });
    const ev = await aWs.waitFor("chat:updated", (e) => e.chat?.id === group.id);
    expect(ev.chat.memberIds).toEqual([a.id]);
    await aWs.waitFor("message:new", (e) => e.message?.text === "Боб покинул(а) группу");
    // Ушедшему событие не шлётся.
    await bWs.expectNone("chat:updated");
    await outWs.expectNone("chat:updated");
    expectError(await b.api.get(`/api/chats/${group.id}`), 404, NOT_FOUND);
  });

  test("владелец уходит — владельцем становится админ; последний уходит — чат удаляется", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const admin = await registerUser(baseUrl);
    const group = await createGroup(a, [b, admin], { adminIds: [admin.id] });

    expectOk(await a.api.post(`/api/chats/${group.id}/leave`), leaveBody);
    const after = expectOk(await b.api.get(`/api/chats/${group.id}`), chatCard).chat;
    expect(after).toMatchObject({ ownerId: admin.id, ownerIds: [admin.id], adminIds: [admin.id] });

    expectOk(await b.api.post(`/api/chats/${group.id}/leave`), leaveBody);
    expect(expectOk(await admin.api.post(`/api/chats/${group.id}/leave`), leaveBody)).toEqual({ ok: true, deleted: true });
    expectError(await admin.api.get(`/api/chats/${group.id}`), 404, NOT_FOUND);
  });

  test("из лички выйти нельзя — её удаляют", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const dm = await createDm(a, b);
    await sendText(a, dm.id, "пока");
    expectError(await a.api.post(`/api/chats/${dm.id}/leave`), 400, "Покинуть можно только группу или канал");
    const row = expectOk(await b.api.get("/api/chats"), chatList).chats.find((c) => c.id === dm.id)!;
    expect(row.memberIds.sort()).toEqual([a.id, b.id].sort());
    expect(row).not.toHaveProperty("isSaved");
  });
});

describe("DELETE /:id", () => {
  test("личку удаляет любой участник — chat:deleted обоим", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const outsider = await registerUser(baseUrl);
    const dm = await createDm(a, b);
    await sendText(a, dm.id, "удалим");
    const [aWs, bWs, outWs] = await Promise.all([ws(a.api), ws(b.api), ws(outsider.api)]);

    expectOk(await b.api.delete(`/api/chats/${dm.id}`), okBody);
    await aWs.waitFor("chat:deleted", (e) => e.chatId === dm.id);
    await bWs.waitFor("chat:deleted", (e) => e.chatId === dm.id);
    await outWs.expectNone("chat:deleted");
    expectError(await a.api.get(`/api/chats/${dm.id}`), 404, NOT_FOUND);
    expect(expectOk(await a.api.get("/api/chats"), chatList).chats).toEqual([]);
    // Новая личка с тем же человеком — уже другой чат.
    expect((await createDm(a, b)).id).not.toBe(dm.id);
  });

  test("группу удаляют владелец и админы, рядовой участник — 403", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const admin = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const group = await createGroup(a, [admin, b], { adminIds: [admin.id] });
    const bWs = await ws(b.api);
    expectError(await b.api.delete(`/api/chats/${group.id}`), 403, "Удалить чат для всех может только владелец или админ");
    expectOk(await admin.api.delete(`/api/chats/${group.id}`), okBody);
    await bWs.waitFor("chat:deleted", (e) => e.chatId === group.id);
    expectError(await a.api.get(`/api/chats/${group.id}`), 404, NOT_FOUND);
  });
});

describe("POST /:id/clear и /:id/delete-for-me", () => {
  test("очистка у себя и у всех", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const group = await createGroup(a, [b]);
    await sendText(a, group.id, "раз");
    expectError(await b.api.post(`/api/chats/${group.id}/clear`, { forEveryone: true }), 403, "Очистить историю у всех могут только владельцы и админы");

    expectOk(await b.api.post(`/api/chats/${group.id}/clear`), okBody);
    const forB = expectOk(await b.api.get("/api/chats"), chatList).chats.find((c) => c.id === group.id)!;
    expect(forB).toMatchObject({ lastMessage: null, unreadCount: 0 });
    expect(expectOk(await a.api.get("/api/chats"), chatList).chats.find((c) => c.id === group.id)!.lastMessage?.text).toBe("раз");

    const fresh = await sendText(a, group.id, "два");
    expect(expectOk(await b.api.get("/api/chats"), chatList).chats.find((c) => c.id === group.id)).toMatchObject({ lastMessage: { id: fresh.id }, unreadCount: 1 });

    expectOk(await a.api.post(`/api/chats/${group.id}/clear`, { forEveryone: true }), okBody);
    for (const u of [a, b]) {
      expect(expectOk(await u.api.get("/api/chats"), chatList).chats.find((c) => c.id === group.id)!.lastMessage).toBeNull();
    }

    // В личке очистить у всех может любой.
    const dm = await createDm(a, b);
    await sendText(a, dm.id, "x");
    expectOk(await b.api.post(`/api/chats/${dm.id}/clear`, { forEveryone: true }), okBody);
    expect(expectOk(await a.api.get("/api/chats"), chatList).chats.find((c) => c.id === dm.id)!.lastMessage).toBeNull();
  });

  test("«удалить у себя» — история скрыта, отметка в настройках", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const dm = await createDm(a, b);
    await sendText(a, dm.id, "раз");
    expectOk(await b.api.post(`/api/chats/${dm.id}/delete-for-me`), okBody);

    // ПОВЕДЕНИЕ-ВОПРОС: чат остаётся в GET /api/chats (скрывает его клиент по settings.hiddenChats).
    const row = expectOk(await b.api.get("/api/chats"), chatList).chats.find((c) => c.id === dm.id)!;
    expect(row).toMatchObject({ lastMessage: null, unreadCount: 0 });
    const boot = await b.api.get("/api/bootstrap");
    expect(Object.keys(boot.body.settings.hiddenChats)).toEqual([dm.id]);
    expect(Object.keys(boot.body.settings.chatClears)).toEqual([dm.id]);
    // У собеседника всё на месте.
    expect(expectOk(await a.api.get("/api/chats"), chatList).chats[0].lastMessage?.text).toBe("раз");
  });
});

describe("GET /:id/admin-log", () => {
  test("журнал действий администраторов", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const mod = await registerUser(baseUrl);
    const dm = await createDm(a, b);
    const group = await createGroup(a, [b, mod]);

    expectError(await a.api.get(`/api/chats/${dm.id}/admin-log`), 400, "Журнал есть только у групп и каналов");
    expectError(await b.api.get(`/api/chats/${group.id}/admin-log`), 403, "Журнал видят только администраторы");

    expectOk(await member(a, group.id, "mod", mod.id), chatBody);
    expectOk(await a.api.post(`/api/chats/${group.id}/slow-mode`, { seconds: 10 }), slowModeBody);
    expectOk(await a.api.patch(`/api/chats/${group.id}`, { title: "Переименована" }), chatBody);
    expectOk(await a.api.post(`/api/chats/${group.id}/title`, { userId: b.id, title: "тег" }), chatBody);

    const log = expectOk(await mod.api.get(`/api/chats/${group.id}/admin-log`), adminLogBody);
    expect(log.entries.map((e) => e.action)).toEqual(["member_tag", "chat_title", "slow_mode", "member_mod"]);
    expect(log.entries[0]).toMatchObject({ actorId: a.id, targetId: b.id, details: { value: "тег" } });
    expect(log.entries[1]).toMatchObject({ details: { value: "Переименована" } });
    expect(log.entries[1]).not.toHaveProperty("targetId");
    expect(log.entries[2]).toMatchObject({ details: { seconds: 10 } });
    expect(log.entries[3]).toMatchObject({ targetId: mod.id });
    expect(log.entries[3]).not.toHaveProperty("details");
    expect(log.users.map((u) => u.id).sort()).toEqual([a.id, b.id, mod.id].sort());

    // Постранично — beforeId.
    const older = expectOk(await mod.api.get(`/api/chats/${group.id}/admin-log`, { query: { beforeId: log.entries[1].id } }), adminLogBody);
    expect(older.entries.map((e) => e.action)).toEqual(["slow_mode", "member_mod"]);
  });
});
