// Администраторы сообщества (права editInfo/editChats/ban/addAdmins) и удалённые участники.
import { describe, expect, test } from "vitest";
import { chatCard } from "../../schemas/chats";
import { okBody } from "../../schemas/common";
import { adminsBody, banPreviewBody, banResultBody, bansBody, communityBody, joinedBody } from "../../schemas/communities";
import { expectError, expectOk } from "../../support/expect";
import { createChannel, createGroup, registerUser, type TestUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { aboutCommunity, admit, BANNED, createCommunity, DEFAULT_ADMIN_RIGHTS, NO_RIGHTS, NO_RIGHTS_SET, NOT_MEMBER, OWNER_RIGHTS, wsPool } from "./helpers";

const server = useServer();
const ws = wsPool();

const put = (actor: TestUser, path: string, json: unknown = {}) => actor.api.request("PUT", path, { json });

async function communityWith(n: number) {
  const { baseUrl } = server();
  const owner = await registerUser(baseUrl, { name: "Владелец" });
  const c = await createCommunity(owner, { title: "Клуб" });
  const users: TestUser[] = [];
  for (let i = 0; i < n; i++) users.push(await registerUser(baseUrl, { name: `Участник ${i + 1}` }));
  await admit(owner, c.id, users);
  return { owner, c, users };
}

describe("администраторы", () => {
  test("GET /:id/admins — владелец первым, со всеми правами", async () => {
    const { owner, c, users } = await communityWith(2);
    const [admin, plain] = users;
    const outsider = await registerUser(server().baseUrl);
    expectOk(await put(owner, `/api/communities/${c.id}/admins/${admin.id}`, { rights: { editInfo: true, ban: 1 } }), okBody);

    const list = expectOk(await plain.api.get(`/api/communities/${c.id}/admins`), adminsBody).admins;
    expect(list.map((x) => ({ id: x.id, role: x.role, rights: x.rights }))).toEqual([
      { id: owner.id, role: "owner", rights: OWNER_RIGHTS },
      { id: admin.id, role: "admin", rights: { editInfo: true, editChats: false, ban: true, addAdmins: false } },
    ]);
    expectError(await outsider.api.get(`/api/communities/${c.id}/admins`), 403, NOT_MEMBER);
  });

  test("PUT /:id/admins/:userId — назначение, права по умолчанию, ограничения", async () => {
    const { owner, c, users } = await communityWith(3);
    const [admin, second, plain] = users;
    const outsider = await registerUser(server().baseUrl);
    const [adminWs, plainWs] = await Promise.all([ws(admin), ws(plain)]);

    expectError(await put(plain, `/api/communities/${c.id}/admins/${second.id}`), 403, NO_RIGHTS);
    expectError(await put(owner, `/api/communities/${c.id}/admins/${owner.id}`), 400, "Права владельца не меняются");
    expectError(await put(owner, `/api/communities/${c.id}/admins/${outsider.id}`), 400, "Этот пользователь не участник сообщества");

    expect(expectOk(await put(owner, `/api/communities/${c.id}/admins/${admin.id}`), okBody)).toEqual({ ok: true });
    const ev = await adminWs.waitFor("community:updated", aboutCommunity(c.id));
    expect(ev).toEqual({ type: "community:updated", communityId: c.id });
    // Назначение не рассылается остальным участникам.
    await plainWs.expectNone("community:updated");

    const asAdmin = expectOk(await admin.api.get(`/api/communities/${c.id}`), communityBody).community;
    expect(asAdmin).toMatchObject({ role: "admin", rights: DEFAULT_ADMIN_RIGHTS, addPolicy: "add", adminsCount: 2 });

    // Админ без addAdmins назначать не может.
    expectError(await put(admin, `/api/communities/${c.id}/admins/${second.id}`), 403, NO_RIGHTS);
    // С addAdmins — может, но только в пределах своих прав.
    expectOk(await put(owner, `/api/communities/${c.id}/admins/${admin.id}`, { rights: { addAdmins: true, editInfo: true } }), okBody);
    expectError(
      await put(admin, `/api/communities/${c.id}/admins/${second.id}`, { rights: { editInfo: true, ban: true } }),
      403,
      "Нельзя выдать право, которого нет у вас"
    );
    // Без rights выдаются права по умолчанию — включая ban, которого у админа нет.
    expectError(await put(admin, `/api/communities/${c.id}/admins/${second.id}`), 403, "Нельзя выдать право, которого нет у вас");
    expectOk(await put(admin, `/api/communities/${c.id}/admins/${second.id}`, { rights: { editInfo: true, junk: true } }), okBody);
    const secondView = expectOk(await second.api.get(`/api/communities/${c.id}`), communityBody).community;
    expect(secondView.rights).toEqual({ editInfo: true, editChats: false, ban: false, addAdmins: false });
  });

  test("права админа работают: editInfo, editChats, видимость счётчиков", async () => {
    const { owner, c, users } = await communityWith(2);
    const [editor, banner] = users;
    expectOk(await put(owner, `/api/communities/${c.id}/admins/${editor.id}`, { rights: { editInfo: true, editChats: true } }), okBody);
    expectOk(await put(owner, `/api/communities/${c.id}/admins/${banner.id}`, { rights: { ban: true } }), okBody);
    expectOk(await owner.api.patch(`/api/communities/${c.id}`, { addMode: "admins" }), communityBody);

    expect(expectOk(await editor.api.patch(`/api/communities/${c.id}`, { title: "Переименовано" }), communityBody).community.title).toBe("Переименовано");
    expectError(await banner.api.patch(`/api/communities/${c.id}`, { title: "x" }), 403, "Нет права менять информацию о сообществе");

    // При «только админы» админ без editChats — лишь предлагает.
    const bannerView = expectOk(await banner.api.get(`/api/communities/${c.id}`), communityBody).community;
    expect(bannerView).toMatchObject({ addPolicy: "suggest", requestsCount: 0 });
    const editorView = expectOk(await editor.api.get(`/api/communities/${c.id}`), communityBody).community;
    expect(editorView).toMatchObject({ addPolicy: "add", bannedCount: 0 });
    const g = await createGroup(editor, []);
    expect(expectOk(await editor.api.post(`/api/communities/${c.id}/chats`, { chatId: g.id }), communityBody).community.chats.map((x) => x.id)).toEqual([g.id]);
  });

  test("DELETE /:id/admins/:userId — снять себя может любой, других — с addAdmins", async () => {
    const { owner, c, users } = await communityWith(3);
    const [a1, a2, plain] = users;
    expectOk(await put(owner, `/api/communities/${c.id}/admins/${a1.id}`), okBody);
    expectOk(await put(owner, `/api/communities/${c.id}/admins/${a2.id}`), okBody);
    const a2Ws = await ws(a2);

    expectError(await a1.api.delete(`/api/communities/${c.id}/admins/${a2.id}`), 403, NO_RIGHTS);
    expectError(await plain.api.delete(`/api/communities/${c.id}/admins/${a2.id}`), 403, NO_RIGHTS);

    expect(expectOk(await a1.api.delete(`/api/communities/${c.id}/admins/${a1.id}`), okBody)).toEqual({ ok: true });
    expect(expectOk(await a1.api.get(`/api/communities/${c.id}`), communityBody).community).toMatchObject({ role: "member", rights: NO_RIGHTS_SET });

    expectOk(await owner.api.delete(`/api/communities/${c.id}/admins/${a2.id}`), okBody);
    await a2Ws.waitFor("community:updated", aboutCommunity(c.id));
    expect(expectOk(await owner.api.get(`/api/communities/${c.id}/admins`), adminsBody).admins.map((x) => x.id)).toEqual([owner.id]);

    // ПОВЕДЕНИЕ-ВОПРОС: «снять себя» отвечает ok любому, даже не участнику и не админу; снять владельца — тоже ok, без эффекта.
    const outsider = await registerUser(server().baseUrl);
    expectOk(await outsider.api.delete(`/api/communities/${c.id}/admins/${outsider.id}`), okBody);
    expectOk(await owner.api.delete(`/api/communities/${c.id}/admins/${owner.id}`), okBody);
    expect(expectOk(await owner.api.get(`/api/communities/${c.id}`), communityBody).community.role).toBe("owner");
  });

  test("выход из сообщества снимает роль админа", async () => {
    const { owner, c, users } = await communityWith(1);
    const [admin] = users;
    expectOk(await put(owner, `/api/communities/${c.id}/admins/${admin.id}`), okBody);
    expectOk(await admin.api.post(`/api/communities/${c.id}/leave`), okBody);
    const back = expectOk(await admin.api.post(`/api/communities/${c.id}/join`), communityBody).community;
    expect(back).toMatchObject({ role: "member", rights: NO_RIGHTS_SET, adminsCount: 1 });
  });
});

describe("удалённые участники", () => {
  test("PUT /:id/bans/:userId — ограничения", async () => {
    const { owner, c, users } = await communityWith(3);
    const [admin, admin2, plain] = users;
    expectOk(await put(owner, `/api/communities/${c.id}/admins/${admin.id}`), okBody);
    expectOk(await put(owner, `/api/communities/${c.id}/admins/${admin2.id}`), okBody);

    expectError(await put(plain, `/api/communities/${c.id}/bans/${admin.id}`), 403, NO_RIGHTS);
    expectError(await put(admin, `/api/communities/${c.id}/bans/${admin.id}`), 400, "Нельзя удалить себя");
    expectError(await put(admin, `/api/communities/${c.id}/bans/${owner.id}`), 403, "Владельца удалить нельзя");
    expectError(await put(admin, `/api/communities/${c.id}/bans/${admin2.id}`), 403, "Администратора может удалить только владелец");
    // Владелец удаляет и админа.
    expect(expectOk(await put(owner, `/api/communities/${c.id}/bans/${admin2.id}`), banResultBody)).toEqual({ ok: true, removedChats: 0 });
    expect(expectOk(await owner.api.get(`/api/communities/${c.id}/admins`), adminsBody).admins.map((x) => x.id)).toEqual([owner.id, admin.id]);
  });

  test("бан: чаты удалённого уходят из сообщества, события, доступ закрыт; разбан", async () => {
    const { baseUrl } = server();
    const { owner, c, users } = await communityWith(1);
    const [plain] = users;
    const victim = await registerUser(baseUrl);
    const victimSub = await registerUser(baseUrl);
    const shared = await createGroup(owner, [victim]);
    const vGroup = await createGroup(victim, [victimSub]);
    const vChannel = await createChannel(victim, []);
    expectOk(await owner.api.post(`/api/communities/${c.id}/chats`, { chatId: shared.id }), communityBody);
    expectOk(await victim.api.post(`/api/communities/${c.id}/chats`, { chatId: vGroup.id }), communityBody);
    expectOk(await victim.api.post(`/api/communities/${c.id}/chats`, { chatId: vChannel.id }), communityBody);
    const [victimWs, subWs, plainWs] = await Promise.all([ws(victim), ws(victimSub), ws(plain)]);

    expectError(await plain.api.get(`/api/communities/${c.id}/bans/${victim.id}/preview`), 403, NO_RIGHTS);
    const preview = expectOk(await owner.api.get(`/api/communities/${c.id}/bans/${victim.id}/preview`), banPreviewBody);
    expect(preview).toEqual({ chats: [{ id: vGroup.id, title: "Группа" }, { id: vChannel.id, title: "Канал" }] });
    expect(expectOk(await owner.api.get(`/api/communities/${c.id}/bans/${plain.id}/preview`), banPreviewBody)).toEqual({ chats: [] });

    expect(expectOk(await put(owner, `/api/communities/${c.id}/bans/${victim.id}`), banResultBody)).toEqual({ ok: true, removedChats: 2 });
    await victimWs.waitFor("community:updated", aboutCommunity(c.id));
    await subWs.waitFor("community:updated", aboutCommunity(c.id));
    await plainWs.waitFor("community:updated", aboutCommunity(c.id));
    await subWs.waitFor("message:new", (e) => e.chatId === vGroup.id && e.message?.text === "Группа больше не входит в сообщество «Клуб»");
    await victimWs.waitFor("message:new", (e) => e.chatId === vChannel.id && e.message?.text === "Канал больше не входит в сообщество «Клуб»");

    const ownerView = expectOk(await owner.api.get(`/api/communities/${c.id}`), communityBody).community;
    expect(ownerView.chats.map((x) => x.id)).toEqual([shared.id]);
    expect(ownerView.bannedCount).toBe(1);
    // Удалённый остаётся в общем чате, но в сообщество не попадает.
    expectError(await victim.api.get(`/api/communities/${c.id}`), 403, BANNED);
    expectError(await victim.api.post(`/api/communities/${c.id}/join`), 403, BANNED);
    expectError(await victim.api.post(`/api/communities/${c.id}/chats`, { chatId: vGroup.id }), 403, "Добавлять чаты могут только участники сообщества");
    expect(expectOk(await victim.api.get("/api/communities/joined"), joinedBody).communities).toEqual([]);
    expectOk(await victim.api.get(`/api/chats/${shared.id}`), chatCard);
    expect(ownerView.membersCount).toBe(2);

    expectError(await plain.api.get(`/api/communities/${c.id}/bans`), 403, NO_RIGHTS);
    const bans = expectOk(await owner.api.get(`/api/communities/${c.id}/bans`), bansBody).users;
    expect(bans.map((u) => u.id)).toEqual([victim.id]);

    expectError(await plain.api.delete(`/api/communities/${c.id}/bans/${victim.id}`), 403, NO_RIGHTS);
    expect(expectOk(await owner.api.delete(`/api/communities/${c.id}/bans/${victim.id}`), okBody)).toEqual({ ok: true });
    expect(expectOk(await owner.api.get(`/api/communities/${c.id}/bans`), bansBody).users).toEqual([]);
    // Снова участник — через общий чат сообщества; чаты обратно не возвращаются.
    const back = expectOk(await victim.api.get(`/api/communities/${c.id}`), communityBody).community;
    expect(back).toMatchObject({ role: "member", isBanned: false });
    expect(back.chats.map((x) => x.id)).toEqual([shared.id]);
    // Повторный разбан — тоже ok.
    expectOk(await owner.api.delete(`/api/communities/${c.id}/bans/${victim.id}`), okBody);
  });

  test("бан постороннего и view.isBanned; админ с правом ban видит счётчик", async () => {
    const { baseUrl } = server();
    const { owner, c, users } = await communityWith(1);
    const [banAdmin] = users;
    const stranger = await registerUser(baseUrl);
    expectOk(await put(owner, `/api/communities/${c.id}/admins/${banAdmin.id}`, { rights: { ban: true } }), okBody);
    // Удалить можно и того, кто ещё не вступал.
    expectOk(await put(banAdmin, `/api/communities/${c.id}/bans/${stranger.id}`), banResultBody);
    expect(expectOk(await banAdmin.api.get(`/api/communities/${c.id}`), communityBody).community.bannedCount).toBe(1);
    expect(expectOk(await banAdmin.api.get(`/api/communities/${c.id}/bans`), bansBody).users.map((u) => u.id)).toEqual([stranger.id]);
    expectError(await stranger.api.get(`/api/communities/${c.id}`), 403, BANNED);
    expectOk(await banAdmin.api.delete(`/api/communities/${c.id}/bans/${stranger.id}`), okBody);
    expect(expectOk(await stranger.api.get(`/api/communities/${c.id}`), communityBody).community).toMatchObject({ role: null, isBanned: false });
  });
});
