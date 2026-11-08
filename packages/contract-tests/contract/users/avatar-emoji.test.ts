// Смайл вместо аватарки (avatarEmoji) у профиля, бота и сообщества: установка, снятие,
// проверка значения («Некорректный эмодзи»), фото и смайл сменяют друг друга, другие
// видят смайл в публичном пользователе и в сообществе; приватность «фото» прячет и смайл.
// Свой смайл контакта (POST /api/contacts/photo { emoji }) видит только тот, кто его поставил.
import { describe, expect, test } from "vitest";
import { z } from "zod";
import { botBody, botListBody } from "../../schemas/bots";
import { communityBody, joinedBody, mineBody } from "../../schemas/communities";
import { otherProfileBody, ownProfileBody, patchProfileBody } from "../../schemas/users";
import { expectError, expectOk } from "../../support/expect";
import { registerUser, registerUsers } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { createBot } from "../bots/helpers";
import { admit, createCommunity } from "../communities/helpers";
import { addContact, setPrivacy } from "../ws/helpers";
import { addAvatar, POSTER, uploadedUrl } from "./helpers";

const BAD_EMOJI = "Некорректный эмодзи";
const BAD_VALUES: unknown[] = ["abc", "Ж", "1", "🔥🔥🔥🔥🔥🔥🔥🔥🔥", "🔥 x", 5, true, { e: "🔥" }, ["🔥"]];

const server = useServer();

describe("профиль: PATCH /api/users/:id { avatarEmoji }", () => {
  test("установить, сменить на склейку, убрать (null и пустой строкой)", async () => {
    const { baseUrl } = server();
    const me = await registerUser(baseUrl);
    const patch = (avatarEmoji: unknown) => me.api.patch(`/api/users/${me.id}`, { avatarEmoji });

    expect(expectOk(await patch("🔥"), patchProfileBody).user!.avatarEmoji).toBe("🔥");
    expect(expectOk(await me.api.get(`/api/users/${me.id}`), ownProfileBody).user.avatarEmoji).toBe("🔥");
    expect(expectOk(await patch(" 👨‍👩‍👧 "), patchProfileBody).user!.avatarEmoji).toBe("👨‍👩‍👧");
    expect(expectOk(await patch("🇷🇺"), patchProfileBody).user!.avatarEmoji).toBe("🇷🇺");

    expect(expectOk(await patch(null), patchProfileBody).user).not.toHaveProperty("avatarEmoji");
    await patch("🎉");
    expect(expectOk(await patch(""), patchProfileBody).user).not.toHaveProperty("avatarEmoji");
  });

  test("прозрачный фон сохраняется независимо от смайла; произвольный CSS запрещён", async () => {
    const me = await registerUser(server().baseUrl);
    await me.api.patch(`/api/users/${me.id}`, { avatarEmoji: "🔥" });
    const res = expectOk(await me.api.patch(`/api/users/${me.id}`, { avatarColor: "transparent" }), patchProfileBody);
    expect(res.user).toMatchObject({ avatarEmoji: "🔥", avatarColor: "transparent" });
    expectError(await me.api.patch(`/api/users/${me.id}`, { avatarColor: "url(https://example.com/a)" }), 400, "Некорректный цвет");
  });

  test("не смайл, длинная строка, не строка — 400 «Некорректный эмодзи», ничего не сохраняется", async () => {
    const { baseUrl } = server();
    const me = await registerUser(baseUrl);
    await me.api.patch(`/api/users/${me.id}`, { avatarEmoji: "🔥" });
    for (const value of BAD_VALUES) {
      expectError(await me.api.patch(`/api/users/${me.id}`, { avatarEmoji: value, bio: "не сохранится" }), 400, BAD_EMOJI);
    }
    const own = expectOk(await me.api.get(`/api/users/${me.id}`), ownProfileBody).user;
    expect(own.avatarEmoji).toBe("🔥");
    expect(own.bio).toBe("");
  });

  test("чужой профиль — 403 раньше проверки смайла", async () => {
    const { baseUrl } = server();
    const [me, other] = await registerUsers(baseUrl, 2);
    expectError(await me.api.patch(`/api/users/${other.id}`, { avatarEmoji: "🔥" }), 403, "forbidden");
    expectError(await me.api.patch(`/api/users/${other.id}`, { avatarEmoji: "abc" }), 403, "forbidden");
  });

  test("другие видят смайл; приватность «фото» прячет его вместе с фото", async () => {
    const { baseUrl } = server();
    const [owner, stranger] = await registerUsers(baseUrl, 2);
    await owner.api.patch(`/api/users/${owner.id}`, { avatarEmoji: "🦄" });
    const seen = expectOk(await stranger.api.get(`/api/users/${owner.id}`), otherProfileBody).user;
    expect(seen.avatarEmoji).toBe("🦄");

    await setPrivacy(owner, { photo: "nobody" });
    expect(expectOk(await stranger.api.get(`/api/users/${owner.id}`), otherProfileBody).user).not.toHaveProperty("avatarEmoji");
    expect(expectOk(await owner.api.get(`/api/users/${owner.id}`), ownProfileBody).user.avatarEmoji).toBe("🦄");
  });

  test("новое фото сменяет смайл: POST /api/avatars и PATCH avatarImage", async () => {
    const { baseUrl } = server();
    const me = await registerUser(baseUrl);
    await me.api.patch(`/api/users/${me.id}`, { avatarEmoji: "🔥" });
    const added = await addAvatar(me);
    expect(added.user).not.toHaveProperty("avatarEmoji");
    expect(expectOk(await me.api.get(`/api/users/${me.id}`), ownProfileBody).user).not.toHaveProperty("avatarEmoji");

    // Смайл поверх фото: фото остаются в галерее.
    const withEmoji = expectOk(await me.api.patch(`/api/users/${me.id}`, { avatarEmoji: "🎉" }), patchProfileBody).user!;
    expect(withEmoji.avatarEmoji).toBe("🎉");
    expect(withEmoji.avatarImages).toHaveLength(1);

    const poster = expectOk(await me.api.patch(`/api/users/${me.id}`, { avatarImage: POSTER }), patchProfileBody).user!;
    expect(poster).not.toHaveProperty("avatarEmoji");
    expect(poster.avatarImage).toBe(POSTER);
  });
});

describe("бот: PATCH /api/bots/:id { avatarEmoji }", () => {
  test("владелец ставит и убирает смайл; фото и смайл сменяют друг друга; другие видят", async () => {
    const { baseUrl } = server();
    const [owner, other] = await registerUsers(baseUrl, 2);
    const bot = await createBot(owner, "Смайлобот", { avatarImage: POSTER });

    const set = expectOk(await owner.api.patch(`/api/bots/${bot.id}`, { avatarEmoji: "🤖" }), botBody).bot;
    expect(set.user.avatarEmoji).toBe("🤖");
    expect(set.user).not.toHaveProperty("avatarImage");
    expect(expectOk(await owner.api.get("/api/bots"), botListBody).bots[0]!.user.avatarEmoji).toBe("🤖");
    expect(expectOk(await other.api.get(`/api/users/${bot.id}`), otherProfileBody).user.avatarEmoji).toBe("🤖");

    const photo = expectOk(await owner.api.patch(`/api/bots/${bot.id}`, { avatarImage: POSTER }), botBody).bot;
    expect(photo.user.avatarImage).toBe(POSTER);
    expect(photo.user).not.toHaveProperty("avatarEmoji");

    await owner.api.patch(`/api/bots/${bot.id}`, { avatarEmoji: "🎮" });
    const cleared = expectOk(await owner.api.patch(`/api/bots/${bot.id}`, { avatarEmoji: null }), botBody).bot;
    expect(cleared.user).not.toHaveProperty("avatarEmoji");
  });

  test("некорректный смайл — 400; чужой бот — отказ раньше проверки", async () => {
    const { baseUrl } = server();
    const [owner, stranger] = await registerUsers(baseUrl, 2);
    const bot = await createBot(owner);
    for (const value of BAD_VALUES) expectError(await owner.api.patch(`/api/bots/${bot.id}`, { avatarEmoji: value }), 400, BAD_EMOJI);
    const foreign = await stranger.api.patch(`/api/bots/${bot.id}`, { avatarEmoji: "abc" });
    expect(foreign.status).not.toBe(200);
    expect(foreign.status).not.toBe(400);
    expect(expectOk(await owner.api.get("/api/bots"), botListBody).bots[0]!.user).not.toHaveProperty("avatarEmoji");
  });
});

describe("сообщество: avatarEmoji при создании и в PATCH /api/communities/:id", () => {
  test("создать со смайлом, сменить на фото, снова смайл, убрать; видно в mine/joined и участнику", async () => {
    const { baseUrl } = server();
    const [owner, member] = await registerUsers(baseUrl, 2);
    const created = await createCommunity(owner, { avatarEmoji: "🏡" });
    expect(created).toMatchObject({ avatarEmoji: "🏡", avatarImage: null });

    const mine = expectOk(await owner.api.get("/api/communities/joined"), joinedBody).communities;
    expect(mine.find((c) => c.id === created.id)?.avatarEmoji).toBe("🏡");
    expect(expectOk(await owner.api.get("/api/communities/mine"), mineBody).communities.find((c) => c.id === created.id)?.avatarEmoji).toBe("🏡");

    await admit(owner, created.id, [member]);
    expect(expectOk(await member.api.get(`/api/communities/${created.id}`), communityBody).community.avatarEmoji).toBe("🏡");

    const photo = expectOk(await owner.api.patch(`/api/communities/${created.id}`, { avatarImage: POSTER }), communityBody).community;
    expect(photo).toMatchObject({ avatarImage: POSTER, avatarEmoji: null });

    const emoji = expectOk(await owner.api.patch(`/api/communities/${created.id}`, { avatarEmoji: "🌲" }), communityBody).community;
    expect(emoji).toMatchObject({ avatarImage: null, avatarEmoji: "🌲" });

    const cleared = expectOk(await owner.api.patch(`/api/communities/${created.id}`, { avatarEmoji: null }), communityBody).community;
    expect(cleared).toMatchObject({ avatarImage: null, avatarEmoji: null });
  });

  test("фото и смайл вместе при создании — остаётся фото", async () => {
    const { baseUrl } = server();
    const owner = await registerUser(baseUrl);
    const created = await createCommunity(owner, { avatarImage: POSTER, avatarEmoji: "🏡" });
    expect(created).toMatchObject({ avatarImage: POSTER, avatarEmoji: null });
  });

  test("некорректный смайл — 400 при создании и правке; без права менять информацию — 403", async () => {
    const { baseUrl } = server();
    const [owner, member] = await registerUsers(baseUrl, 2);
    for (const value of BAD_VALUES) expectError(await owner.api.post("/api/communities", { title: "Ок", avatarEmoji: value }), 400, BAD_EMOJI);
    const created = await createCommunity(owner);
    for (const value of BAD_VALUES) expectError(await owner.api.patch(`/api/communities/${created.id}`, { avatarEmoji: value }), 400, BAD_EMOJI);
    await admit(owner, created.id, [member]);
    expectError(await member.api.patch(`/api/communities/${created.id}`, { avatarEmoji: "🔥" }), 403, "Нет права менять информацию о сообществе");
    expect(expectOk(await owner.api.get(`/api/communities/${created.id}`), communityBody).community.avatarEmoji).toBeNull();
  });
});

describe("контакт: POST /api/contacts/photo { emoji }", () => {
  const photoBody = z.strictObject({ localAvatar: z.string().nullable() });

  test("свой смайл контакта видит только владелец; фото из профиля остаётся, его смайл — в profileAvatarEmoji", async () => {
    const { baseUrl } = server();
    const [me, friend, stranger] = await registerUsers(baseUrl, 3);
    await friend.api.patch(`/api/users/${friend.id}`, { avatarEmoji: "🦄" });
    await addContact(me, friend);

    expect(expectOk(await me.api.post("/api/contacts/photo", { userId: friend.id, emoji: " 🐱 " }), photoBody)).toEqual({ localAvatar: "emoji:🐱" });
    const seen = expectOk(await me.api.get(`/api/users/${friend.id}`), otherProfileBody);
    expect(seen.user).toMatchObject({ avatarEmoji: "🐱", profileAvatarEmoji: "🦄" });
    expect(seen.user).not.toHaveProperty("profileAvatarImage");
    expect(seen.contactPhoto).toBe("emoji:🐱");
    expect((await me.api.get("/api/contacts")).body.contacts[0].user).toMatchObject({ avatarEmoji: "🐱", profileAvatarEmoji: "🦄" });

    // Остальные видят смайл из профиля.
    expect(expectOk(await stranger.api.get(`/api/users/${friend.id}`), otherProfileBody).user.avatarEmoji).toBe("🦄");
    expect(expectOk(await friend.api.get(`/api/users/${friend.id}`), ownProfileBody).user.avatarEmoji).toBe("🦄");

    // Смайл сменяется фото и снимается пустой ссылкой.
    expect(expectOk(await me.api.post("/api/contacts/photo", { userId: friend.id, url: "" }), photoBody)).toEqual({ localAvatar: null });
    const back = expectOk(await me.api.get(`/api/users/${friend.id}`), otherProfileBody);
    expect(back.user.avatarEmoji).toBe("🦄");
    expect(back.user).not.toHaveProperty("profileAvatarEmoji");
    expect(back).not.toHaveProperty("contactPhoto");
  });

  test("не смайл — 400 «Некорректный эмодзи»; не контакт — 404; чужой закрытый файл стикером — 400", async () => {
    const { baseUrl } = server();
    const [me, friend, other] = await registerUsers(baseUrl, 3);
    const photo = (body: Record<string, unknown>) => me.api.post("/api/contacts/photo", { userId: friend.id, ...body });
    for (const value of BAD_VALUES) expectError(await photo({ emoji: value }), 400, BAD_EMOJI);
    expectError(await photo({ emoji: "🐱" }), 404, "Сначала добавьте человека в контакты");

    await addContact(me, friend);
    // Файл, который other только загрузил, не открыт никому — стикером на аватарку его не поставить.
    expectError(await photo({ emoji: `sticker:${await uploadedUrl(other)}` }), 400, "Некорректное изображение");
    expect(expectOk(await photo({ emoji: "👨‍👩‍👧" }), photoBody)).toEqual({ localAvatar: "emoji:👨‍👩‍👧" });
  });
});
