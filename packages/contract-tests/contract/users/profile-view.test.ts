// Просмотр профилей и блокировка (server/routes/users.js): GET /api/users/:id,
// /by-username/:username, /blocked, POST /:id/block — и матрица приватности:
// сам / контакт владельца / посторонний / заблокированный — для каждого поля,
// которое прячет routes/users.js (телефон, «был(а)», «о себе», день рождения, фото).
import { describe, expect, test } from "vitest";
import { Api } from "../../support/client";
import { expectError, expectOk } from "../../support/expect";
import { registerUser, registerUsers, type TestUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { blockBody, blockedListBody, byUsernameBody, otherProfileBody, ownProfileBody } from "../../schemas/users";
import { addContact, block, setPrivacy, socketPool } from "../ws/helpers";
import { addAvatar, patchMe } from "./helpers";

const server = useServer();
const open = socketPool();

const profile = (viewer: TestUser, owner: TestUser) => viewer.api.get(`/api/users/${owner.id}`);

describe("без сессии", () => {
  const routes: Array<[string, string]> = [
    ["GET", "/api/users/blocked"],
    ["GET", "/api/users/by-username/someone"],
    ["GET", "/api/users/u_whatever00"],
    ["GET", "/api/users/me/pinnable-channels"],
    ["PUT", "/api/users/me/pinned-channels"],
    ["GET", "/api/users/u_whatever00/shared-media"],
    ["GET", "/api/users/u_whatever00/common-chats"],
    ["PATCH", "/api/users/u_whatever00"],
    ["POST", "/api/users/u_whatever00/block"],
  ];
  test.each(routes)("%s %s → 401 unauthorized", async (method, path) => {
    const api = new Api(server().baseUrl);
    expectError(await api.request(method, path, method === "GET" ? {} : { json: {} }), 401, "unauthorized");
  });
});

describe("GET /api/users/:id", () => {
  test("свой профиль — selfUser с телефоном и почтой; пометки контакта пустые", async () => {
    const { baseUrl } = server();
    const me = await registerUser(baseUrl);
    const body = expectOk(await profile(me, me), ownProfileBody);
    expect(body).toEqual({
      user: expect.objectContaining({ id: me.id, phone: me.phone, email: me.email, username: me.username, blockedUserIds: [], adminSections: [] }),
      isContact: false,
      inContacts: false,
      contactName: null,
      contactNote: null,
      commonGroupsCount: 0,
      pinnedChannels: [],
    });
    expect(body.user.referralCode).toEqual(expect.any(String));
  });

  test("чужой профиль — без приватных полей; телефон по умолчанию скрыт (phone = contacts)", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const body = expectOk(await profile(a, b), otherProfileBody);
    expect(body.user).toMatchObject({ id: b.id, name: b.name, username: b.username, bio: "", avatarImages: [], lastSeen: expect.any(String) });
    for (const key of ["phone", "email", "blockedUserIds", "referralCode", "adminSections", "inContacts", "mutualContact", "profileName"]) {
      expect(body.user, `поле ${key}`).not.toHaveProperty(key);
    }
    expect(body).toMatchObject({ isContact: false, inContacts: false, contactName: null, contactNote: null, commonGroupsCount: 0, pinnedChannels: [] });
  });

  test("несуществующий — 404 not found", async () => {
    const a = await registerUser(server().baseUrl);
    expectError(await a.api.get("/api/users/u_nonexistent00"), 404, "not found");
  });

  test("системный бот: isBot, isServiceBot, botUserCount; «в сети» у бота не бывает", async () => {
    const a = await registerUser(server().baseUrl);
    const body = expectOk(await a.api.get("/api/users/bot_shalter"), otherProfileBody);
    expect(body.user).toMatchObject({ id: "bot_shalter", name: "Shalter", username: "shalter", isBot: true, isServiceBot: true, online: false });
    expect(body.user.botUserCount).toEqual(expect.any(Number));
    expect(body.user).not.toHaveProperty("lastSeen");
  });
});

// Поле приватности → какие ключи профиля оно прячет.
const FIELDS: Record<string, string[]> = {
  phone: ["phone"],
  lastSeen: ["lastSeen"],
  bio: ["bio"],
  birthday: ["birthday"],
  photo: ["avatarImage", "avatarImages"],
};

describe("матрица приватности GET /api/users/:id", () => {
  /** Владелец с заполненными полями, его контакт и посторонний. */
  async function setup() {
    const { baseUrl } = server();
    const [owner, contact, stranger] = await registerUsers(baseUrl, 3);
    await patchMe(owner, { bio: "обо мне", birthday: "1990-05-17" });
    await addAvatar(owner);
    await addContact(owner, contact);
    return { owner, contact, stranger };
  }

  test.each(Object.keys(FIELDS))("%s: everyone — всем, contacts — только контактам владельца, nobody — никому; себе — всегда", async (key) => {
    const { owner, contact, stranger } = await setup();
    const fields = FIELDS[key];
    const expected: Record<string, [boolean, boolean]> = { everyone: [true, true], contacts: [true, false], nobody: [false, false] };
    for (const [level, [forContact, forStranger]] of Object.entries(expected)) {
      await setPrivacy(owner, { [key]: level });
      const seenByContact = expectOk(await profile(contact, owner), otherProfileBody).user;
      const seenByStranger = expectOk(await profile(stranger, owner), otherProfileBody).user;
      const own = expectOk(await profile(owner, owner), ownProfileBody).user;
      for (const f of fields) {
        expect(f in seenByContact, `${key}=${level}: ${f} у контакта`).toBe(forContact);
        expect(f in seenByStranger, `${key}=${level}: ${f} у постороннего`).toBe(forStranger);
        expect(f in own, `${key}=${level}: ${f} у себя`).toBe(true);
      }
    }
    // Значения, когда видно, — настоящие.
    await setPrivacy(owner, { [key]: "everyone" });
    const seen = (await profile(stranger, owner)).body.user;
    if (key === "phone") expect(seen.phone).toBe(owner.phone);
    if (key === "bio") expect(seen.bio).toBe("обо мне");
    if (key === "birthday") expect(seen.birthday).toBe("1990-05-17");
    if (key === "photo") expect(seen.avatarImages).toHaveLength(1);
  });

  test("исключения: allow открывает при nobody, deny закрывает при everyone — даже контакту", async () => {
    const { owner, contact, stranger } = await setup();
    await setPrivacy(owner, {
      phone: "nobody",
      bio: "everyone",
      exceptions: { phone: { allow: [stranger.id], deny: [] }, bio: { allow: [], deny: [contact.id] } },
    });
    const byStranger = (await profile(stranger, owner)).body.user;
    const byContact = (await profile(contact, owner)).body.user;
    expect(byStranger.phone).toBe(owner.phone);
    expect(byContact).not.toHaveProperty("phone");
    expect(byStranger.bio).toBe("обо мне");
    expect(byContact).not.toHaveProperty("bio");
  });

  test("lastSeen скрыт — GET /:id, by-username и список блокировок прячут и online", async () => {
    const { owner, stranger } = await setup();
    await open(owner.api); // owner в сети
    await setPrivacy(owner, { lastSeen: "nobody" });
    const seen = expectOk(await profile(stranger, owner), otherProfileBody).user;
    expect(seen).not.toHaveProperty("lastSeen");
    // Как publicUserFor: вместе с lastSeen скрыт и «в сети».
    expect(seen.online).toBe(false);

    const byName = expectOk(await stranger.api.get(`/api/users/by-username/${owner.username}`), byUsernameBody).user;
    expect(byName).not.toHaveProperty("lastSeen");
    expect(byName.online).toBe(false);
  });
});

describe("блокировка", () => {
  test("заблокированный не видит фото, «был(а)», «в сети», телефон, «о себе» и день рождения", async () => {
    const { baseUrl } = server();
    const [owner, viewer] = await registerUsers(baseUrl, 2);
    await patchMe(owner, { bio: "обо мне", birthday: "1990-05-17" });
    await addAvatar(owner);
    await setPrivacy(owner, { phone: "everyone" });
    await open(owner.api);
    expect((await profile(viewer, owner)).body.user).toMatchObject({ online: true, avatarImage: expect.any(String), phone: owner.phone });

    await block(owner, viewer);
    const seen = expectOk(await profile(viewer, owner), otherProfileBody).user;
    expect(seen.online).toBe(false);
    // Блокировка прячет и то, что открыто настройками приватности.
    for (const key of ["avatarImage", "avatarImages", "lastSeen", "phone", "bio", "birthday"]) expect(seen, key).not.toHaveProperty(key);

    // Блокировка односторонняя: заблокировавший видит профиль как обычно.
    expect((await profile(owner, viewer)).body.user).toHaveProperty("lastSeen");

    // Разблокировка возвращает поля.
    await block(owner, viewer, false);
    expect((await profile(viewer, owner)).body.user).toMatchObject({ online: true, avatarImage: expect.any(String) });
  });

  test("POST /:id/block: ответ — publicUser того, кого блокируют; список /blocked и blockedUserIds обновляются", async () => {
    const { baseUrl } = server();
    const [me, target, other] = await registerUsers(baseUrl, 3);
    expect(expectOk(await me.api.get("/api/users/blocked"), blockedListBody)).toEqual({ users: [] });

    const res = expectOk(await me.api.post(`/api/users/${target.id}/block`, { blocked: true }), blockBody);
    expect(res.user).toMatchObject({ id: target.id });
    expect(res.user).not.toHaveProperty("blockedUserIds");

    await block(me, other);
    await block(me, target); // повторно — без дублей
    const list = expectOk(await me.api.get("/api/users/blocked"), blockedListBody).users;
    expect(list.map((u) => u.id).sort()).toEqual([target.id, other.id].sort());
    expect((await profile(me, me)).body.user.blockedUserIds.sort()).toEqual([target.id, other.id].sort());

    // Без blocked в теле — разблокировка.
    expectOk(await me.api.post(`/api/users/${other.id}/block`, {}), blockBody);
    expect(expectOk(await me.api.get("/api/users/blocked"), blockedListBody).users.map((u) => u.id)).toEqual([target.id]);
    // Заблокированный о своём статусе через свой профиль не узнаёт.
    expect((await profile(target, target)).body.user.blockedUserIds).toEqual([]);
  });

  test("в /blocked профили — с учётом их приватности", async () => {
    const { baseUrl } = server();
    const [me, target] = await registerUsers(baseUrl, 2);
    await addAvatar(target);
    await setPrivacy(target, { photo: "nobody", lastSeen: "nobody", bio: "nobody" });
    await block(me, target);
    const [u] = expectOk(await me.api.get("/api/users/blocked"), blockedListBody).users;
    expect(u.id).toBe(target.id);
    for (const key of ["avatarImage", "avatarImages", "lastSeen", "bio"]) expect(u, key).not.toHaveProperty(key);
    expect(u.online).toBe(false);
  });

  test("себя — 400; несуществующего — 404, а разблокировать его можно", async () => {
    const { baseUrl } = server();
    const me = await registerUser(baseUrl);
    expectError(await me.api.post(`/api/users/${me.id}/block`, { blocked: true }), 400, "Нельзя заблокировать самого себя");
    expectError(await me.api.post("/api/users/u_ghost000000/block", { blocked: true }), 404, "Пользователь не найден");
    expect((await profile(me, me)).body.user.blockedUserIds).toEqual([]);
    expectOk(await me.api.post("/api/users/u_ghost000000/block", { blocked: false }), blockBody);
    expect((await me.api.get("/api/users/blocked")).body).toEqual({ users: [] });
  });


  test("блокировка сама по себе событий по WS не шлёт", async () => {
    const { baseUrl } = server();
    const [me, target] = await registerUsers(baseUrl, 2);
    const [meWs, targetWs] = await Promise.all([open(me.api), open(target.api)]);
    meWs.clear();
    targetWs.clear();
    await block(me, target);
    await targetWs.expectNone("contact:updated", () => true, 500);
    await meWs.expectNone("contact:updated", () => true, 0);
  });
});

describe("GET /api/users/by-username/:username", () => {
  test("регистр не важен; свой — с isSelf; «@» в пути не срезается; неизвестный — 404", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const found = expectOk(await a.api.get(`/api/users/by-username/${b.username.toUpperCase()}`), byUsernameBody).user;
    expect(found).toMatchObject({ id: b.id, username: b.username });
    expect(found).not.toHaveProperty("isSelf");
    expect(found).not.toHaveProperty("phone");

    const self = expectOk(await a.api.get(`/api/users/by-username/${a.username}`), byUsernameBody).user;
    expect(self).toMatchObject({ id: a.id, isSelf: true });
    // Себе — publicUser: без телефона и почты.
    expect(self).not.toHaveProperty("phone");

    expectError(await a.api.get(`/api/users/by-username/@${b.username}`), 404, "not found");
    expectError(await a.api.get("/api/users/by-username/no_such_user_zz"), 404, "not found");
  });

  test("имя из контактов подменяет имя профиля", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    await addContact(a, b, { localName: "Бобби" });
    const found = expectOk(await a.api.get(`/api/users/by-username/${b.username}`), byUsernameBody).user;
    expect(found).toMatchObject({ name: "Бобби", profileName: b.name, inContacts: true });
  });
});
