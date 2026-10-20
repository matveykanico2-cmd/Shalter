// Редактирование своего профиля: PATCH /api/users/:id (server/routes/users.js) —
// проверки полей, тексты ошибок, что можно и что нельзя поменять, и рассылка
// contact:updated (lib/notifyProfileChanged.js) с учётом приватности и блокировок.
// Сервер с админским номером — чтобы проверить запрет его занять/освободить.
import { describe, expect, test } from "vitest";
import { expectError, expectOk, expectShape } from "../../support/expect";
import { createChannel, createDm, registerUser, registerUsers, uniq, uniqPhone } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { contactUpdated } from "../../schemas/ws";
import { ownProfileBody, patchProfileBody } from "../../schemas/users";
import { registerPremiumUser } from "../chats/helpers";
import { addContact, block, setPrivacy, socketPool } from "../ws/helpers";
import { POSTER, fakeUploadUrl, patchMe, uploadedUrl } from "./helpers";

const ADMIN_PHONE = "+70000000771";
const server = useServer({ env: { PREMIUM_ADMIN_PHONE: ADMIN_PHONE, ALLOW_ADMIN_PHONE_SIGNUP: "1" } });
const open = socketPool();

describe("PATCH /api/users/:id — успешные изменения", () => {
  test("обрезка пробелов, пустые значения → поле пропадает; ответ — selfUser; GET видит то же", async () => {
    const { baseUrl } = server();
    const me = await registerUser(baseUrl);
    const res = expectOk(
      await me.api.patch(`/api/users/${me.id}`, {
        name: "  Иван  ",
        lastName: "  Петров ",
        bio: "  привет  ",
        birthday: " 2000-02-29 ",
        avatarColor: "#ABCDEF",
        businessAddress: "  ул. Ленина  ",
        businessLat: "55.75",
        businessLng: 37.6,
        profileBanner: { id: "sunset", extra: "x" },
      }),
      patchProfileBody
    );
    expect(res.user).toMatchObject({
      id: me.id,
      name: "Иван",
      lastName: "Петров",
      bio: "привет",
      birthday: "2000-02-29",
      avatarColor: "#ABCDEF",
      businessAddress: "ул. Ленина",
      businessLat: 55.75,
      businessLng: 37.6,
      profileBanner: { id: "sunset" },
      phone: me.phone,
      email: me.email,
    });
    expect(expectOk(await me.api.get(`/api/users/${me.id}`), ownProfileBody).user).toMatchObject({ name: "Иван", lastName: "Петров", birthday: "2000-02-29" });

    const cleared = expectOk(
      await me.api.patch(`/api/users/${me.id}`, { lastName: "   ", bio: null, birthday: "", businessAddress: " ", businessLat: null, profileBanner: null }),
      patchProfileBody
    ).user!;
    for (const key of ["lastName", "birthday", "businessAddress", "businessLat", "profileBanner"]) expect(cleared, key).not.toHaveProperty(key);
    expect(cleared.bio).toBe("");
    expect(cleared.businessLng).toBe(37.6);
  });

  test("незнакомые и служебные поля молча игнорируются", async () => {
    const { baseUrl } = server();
    const me = await registerUser(baseUrl);
    const user = await patchMe(me, {
      email: "hacker@test.invalid",
      isPremium: true,
      premiumUntil: "2999-01-01T00:00:00.000Z",
      isVerified: true,
      adminSections: ["moderation"],
      blockedUserIds: ["u_x"],
      stars: 1000,
      online: false,
      isBot: true,
    });
    expect(user).toMatchObject({ email: me.email, isPremium: false, adminSections: [], blockedUserIds: [], online: me.self.online });
    for (const key of ["isVerified", "isBot", "premiumUntil", "stars"]) expect(user, key).not.toHaveProperty(key);
  });

  test("пустой PATCH — 200 и профиль без изменений", async () => {
    const me = await registerUser(server().baseUrl);
    const user = await patchMe(me, {});
    expect(user).toMatchObject({ id: me.id, name: me.name, username: me.username });
  });

  test("username: «@» срезается, свой текущий можно оставить; ошибки — точные тексты", async () => {
    const { baseUrl } = server();
    const [me, other] = await registerUsers(baseUrl, 2);
    const handle = uniq("nick");
    expect((await patchMe(me, { username: ` @${handle} ` })).username).toBe(handle);
    expect((await patchMe(me, { username: handle })).username).toBe(handle);
    expect((await me.api.get(`/api/users/by-username/${handle}`)).body.user.id).toBe(me.id);

    const bad = "Юзернейм: 3–32 символа, латинские буквы, цифры и _";
    for (const value of ["ab", "a".repeat(33), "имя_рус", "with space", "", null]) {
      expectError(await me.api.patch(`/api/users/${me.id}`, { username: value }), 400, bad);
    }
    expectError(await me.api.patch(`/api/users/${me.id}`, { username: "Admin" }), 409, "Этот юзернейм зарезервирован — выберите другой");
    expectError(await me.api.patch(`/api/users/${me.id}`, { username: other.username.toUpperCase() }), 409, "Этот юзернейм уже занят");
    const channelHandle = uniq("chan");
    await createChannel(other, [], { isPublic: true, username: channelHandle });
    expectError(await me.api.patch(`/api/users/${me.id}`, { username: channelHandle }), 409, "Этот юзернейм уже занят каналом");
    // После ошибок — прежний.
    expect((await me.api.get(`/api/users/${me.id}`)).body.user.username).toBe(handle);
  });

  test("phone: нормализуется; чужой — 409; админский — 403 (ни занять, ни освободить)", async () => {
    const { baseUrl } = server();
    const [me, other] = await registerUsers(baseUrl, 2);
    const next = uniqPhone();
    const formatted = `${next.slice(0, 2)} (${next.slice(2, 5)}) ${next.slice(5, 8)}-${next.slice(8)}`;
    // К номеру привязаны поиск по телефону, вход по коду и восстановление —
    // смена номера требует пароль от аккаунта; без него номер прежний.
    expectError(await me.api.patch(`/api/users/${me.id}`, { phone: formatted }), 400, "Чтобы сменить номер, введите пароль от аккаунта");
    expectError(await me.api.patch(`/api/users/${me.id}`, { phone: formatted, currentPassword: "wrong-1" }), 401, "Неверный пароль");
    expect((await me.api.get(`/api/users/${me.id}`)).body.user.phone).toBe(me.phone);
    // Свой же номер (другие поля формы) пароля не требует.
    expect((await patchMe(me, { phone: me.phone, bio: "без смены номера" })).phone).toBe(me.phone);
    expect((await patchMe(me, { phone: formatted, currentPassword: me.password })).phone).toBe(next);

    for (const value of ["12345", "+7abc1234567", "", null]) {
      expectError(await me.api.patch(`/api/users/${me.id}`, { phone: value }), 400, "Введите номер телефона в формате +79991234567");
    }
    expectError(await me.api.patch(`/api/users/${me.id}`, { phone: other.phone }), 409, "Этот номер уже используется другим аккаунтом");
    expectError(await me.api.patch(`/api/users/${me.id}`, { phone: ADMIN_PHONE }), 403, "Этот номер нельзя установить");

    const admin = await registerUser(baseUrl, { phone: ADMIN_PHONE });
    expectError(await admin.api.patch(`/api/users/${admin.id}`, { phone: uniqPhone() }), 403, "Этот номер нельзя установить");
    // Свой же админский номер — можно (номер не меняется).
    expect((await patchMe(admin, { phone: ADMIN_PHONE })).phone).toBe(ADMIN_PHONE);
  });

  test("avatarImage: data-URL становится главной аватаркой; null убирает главную", async () => {
    const { baseUrl } = server();
    const me = await registerUser(baseUrl);
    const other = await uploadedUrl(me);
    await me.api.post("/api/avatars", { url: other, poster: POSTER });
    const poster = "data:image/jpeg;base64,/9j/4AAQ";
    const user = await patchMe(me, { avatarImage: poster });
    expect(user.avatarImage).toBe(poster);
    expect(user.avatarImages).toEqual([
      { url: poster, kind: "image", poster },
      { url: other, kind: "image", poster: POSTER },
    ]);
    const after = await patchMe(me, { avatarImage: null });
    expect(after.avatarImages).toEqual([{ url: other, kind: "image", poster: POSTER }]);
    expect(after.avatarImage).toBe(POSTER);
  });

  test("profileBanner: встроенный — только id; своё фото — id custom + ссылка из загрузок", async () => {
    const me = await registerUser(server().baseUrl);
    const url = await uploadedUrl(me, "jpg");
    expect((await patchMe(me, { profileBanner: { id: "custom", url, other: 1 } })).profileBanner).toEqual({ id: "custom", url });
    // Чужая или выдуманная картинка — нельзя.
    const [stranger] = await registerUsers(server().baseUrl, 1);
    expectError(await stranger.api.patch(`/api/users/${stranger.id}`, { profileBanner: { id: "custom", url } }), 400, "Некорректное изображение баннера");
    expectError(await me.api.patch(`/api/users/${me.id}`, { profileBanner: { id: "custom", url: fakeUploadUrl("jpg") } }), 400, "Некорректное изображение баннера");
    expect((await patchMe(me, { profileBanner: { id: "aurora-2", url } })).profileBanner).toEqual({ id: "aurora-2" });
    expect((await me.api.get(`/api/users/${me.id}`)).body.user.profileBanner).toEqual({ id: "aurora-2" });
  });

  test("nameColor: без Premium — 403; с Premium — сохраняется и виден другим; null — снимает", async () => {
    const { baseUrl } = server();
    const plain = await registerUser(baseUrl);
    expectError(await plain.api.patch(`/api/users/${plain.id}`, { nameColor: "red" }), 403, "Цвет имени доступен с Shalter Premium");
    expectError(await plain.api.patch(`/api/users/${plain.id}`, { nameColor: "black" }), 400, "Некорректный цвет имени");
    // null без Premium — можно.
    await patchMe(plain, { nameColor: null });

    const premium = await registerPremiumUser(baseUrl);
    expect((await patchMe(premium, { nameColor: "violet" })).nameColor).toBe("violet");
    expect((await plain.api.get(`/api/users/${premium.id}`)).body.user.nameColor).toBe("violet");
    expect(await patchMe(premium, { nameColor: null })).not.toHaveProperty("nameColor");
  });
});

describe("PATCH /api/users/:id — ошибки", () => {
  test("чужой профиль — 403 forbidden", async () => {
    const [a, b] = await registerUsers(server().baseUrl, 2);
    expectError(await a.api.patch(`/api/users/${b.id}`, { name: "Взлом" }), 403, "forbidden");
    expect((await b.api.get(`/api/users/${b.id}`)).body.user.name).toBe(b.name);
  });

  const cases: Array<[string, Record<string, unknown>, number, string]> = [
    ["имя не строка", { name: 5 }, 400, "Некорректное значение поля"],
    ["bio не строка", { bio: ["x"] }, 400, "Некорректное значение поля"],
    ["birthday не строка", { birthday: 20000101 }, 400, "Некорректное значение поля"],
    ["phone не строка", { phone: 79991234567 }, 400, "Некорректное значение поля"],
    ["пустое имя", { name: "   " }, 400, "Введите имя"],
    ["имя null", { name: null }, 400, "Введите имя"],
    ["длинное имя", { name: "я".repeat(65) }, 400, "Имя — не длиннее 64 символов"],
    ["длинная фамилия", { lastName: "я".repeat(61) }, 400, "Фамилия — не длиннее 60 символов"],
    ["длинное «о себе»", { bio: "я".repeat(301) }, 400, "«О себе» — не длиннее 300 символов"],
    ["цвет не #RRGGBB", { avatarColor: "#abc" }, 400, "Некорректный цвет"],
    ["цвет null", { avatarColor: null }, 400, "Некорректный цвет"],
    ["длинный адрес", { businessAddress: "я".repeat(201) }, 400, "Адрес — не длиннее 200 символов"],
    ["баннер без id", { profileBanner: { url: "x" } }, 400, "Некорректный баннер"],
    ["баннер с плохим id", { profileBanner: { id: "Bad Id" } }, 400, "Некорректный баннер"],
    ["баннер строкой", { profileBanner: "sunset" }, 400, "Некорректный баннер"],
    ["custom-баннер не из загрузок", { profileBanner: { id: "custom", url: "https://evil.example/x.png" } }, 400, "Некорректное изображение баннера"],
    ["координаты не число", { businessLat: "север" }, 400, "Некорректные координаты"],
    ["аватар не data-URL", { avatarImage: "https://evil.example/a.png" }, 400, "Некорректное изображение"],
    ["аватар gif", { avatarImage: "data:image/gif;base64,R0lGOD" }, 400, "Некорректное изображение"],
    ["аватар слишком большой", { avatarImage: `data:image/png;base64,${"A".repeat(400 * 1024)}` }, 400, "Некорректное изображение"],
    ["дата рождения в будущем", { birthday: "2999-01-01" }, 400, "Дата рождения указана неверно"],
    ["дата рождения до 1900", { birthday: "1899-12-31" }, 400, "Дата рождения указана неверно"],
    ["несуществующая дата", { birthday: "2001-02-29" }, 400, "Дата рождения указана неверно"],
    ["дата не ISO", { birthday: "01.01.2000" }, 400, "Дата рождения указана неверно"],
  ];
  test.each(cases)("%s → %i", async (_what, patch, status, error) => {
    const me = await registerUser(server().baseUrl);
    expectError(await me.api.patch(`/api/users/${me.id}`, patch), status, error);
  });

  test("ошибка в одном поле — ничего не сохраняется", async () => {
    const me = await registerUser(server().baseUrl);
    expectError(await me.api.patch(`/api/users/${me.id}`, { name: "Новое", bio: "я".repeat(301) }), 400, "«О себе» — не длиннее 300 символов");
    expect((await me.api.get(`/api/users/${me.id}`)).body.user).toMatchObject({ name: me.name, bio: "" });
  });
});

describe("PATCH /api/users/:id — contact:updated", () => {
  test("себе — publicUser без телефона; собеседнику и владельцу контакта — версия по приватности; посторонним — ничего", async () => {
    const { baseUrl } = server();
    const [me, peer, owner, outsider] = await registerUsers(baseUrl, 4);
    await createDm(peer, me);
    await addContact(owner, me);
    await setPrivacy(me, { photo: "contacts", bio: "nobody" });
    await addContact(me, owner); // owner — контакт me: фото видит, peer — нет
    const [meWs, peerWs, ownerWs, outsiderWs] = await Promise.all([open(me.api), open(peer.api), open(owner.api), open(outsider.api)]);

    await patchMe(me, { bio: "секрет", avatarImage: POSTER });

    const self = expectShape(contactUpdated, await meWs.waitFor("contact:updated", (e) => e.user?.id === me.id, 10_000), "себе").user;
    expect(self).toMatchObject({ id: me.id, bio: "секрет", avatarImage: POSTER });
    expect(self).not.toHaveProperty("phone");
    expect(self).not.toHaveProperty("email");

    const forPeer = expectShape(contactUpdated, await peerWs.waitFor("contact:updated", (e) => e.user?.id === me.id, 10_000), "собеседнику").user;
    for (const key of ["avatarImage", "avatarImages", "bio", "phone"]) expect(forPeer, key).not.toHaveProperty(key);

    const forOwner = expectShape(contactUpdated, await ownerWs.waitFor("contact:updated", (e) => e.user?.id === me.id, 10_000), "владельцу контакта").user;
    expect(forOwner).toMatchObject({ avatarImage: POSTER, inContacts: true, mutualContact: true });
    expect(forOwner).not.toHaveProperty("bio");

    await outsiderWs.expectNone("contact:updated", () => true, 500);
  });

  test("заблокированный собеседник получает событие без фото и с online = false", async () => {
    const { baseUrl } = server();
    const [me, peer] = await registerUsers(baseUrl, 2);
    await createDm(peer, me);
    await block(me, peer);
    const [meWs, peerWs] = await Promise.all([open(me.api), open(peer.api)]);
    await patchMe(me, { name: "Обновлённый", avatarImage: POSTER });
    await meWs.waitFor("contact:updated", (e) => e.user?.id === me.id, 10_000);
    const forPeer = (await peerWs.waitFor("contact:updated", (e) => e.user?.id === me.id, 10_000)).user;
    expect(forPeer).toMatchObject({ name: "Обновлённый", online: false });
    for (const key of ["avatarImage", "avatarImages", "lastSeen"]) expect(forPeer, key).not.toHaveProperty(key);
  });

  test("отклонённый PATCH событий не шлёт", async () => {
    const me = await registerUser(server().baseUrl);
    const ws = await open(me.api);
    expectError(await me.api.patch(`/api/users/${me.id}`, { name: "" }), 400, "Введите имя");
    await ws.expectNone("contact:updated", () => true, 500);
  });
});
