// Смайл вместо аватарки (avatarEmoji) у профиля, бота и сообщества: установка, снятие,
// проверка значения («Некорректный эмодзи»), фото и смайл сменяют друг друга, другие
// видят смайл в публичном пользователе и в сообществе; приватность «фото» прячет и смайл.
import { describe, expect, test } from "vitest";
import { botBody, botListBody } from "../../schemas/bots";
import { communityBody, joinedBody, mineBody } from "../../schemas/communities";
import { otherProfileBody, ownProfileBody, patchProfileBody } from "../../schemas/users";
import { expectError, expectOk } from "../../support/expect";
import { registerUser, registerUsers } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { createBot } from "../bots/helpers";
import { admit, createCommunity } from "../communities/helpers";
import { setPrivacy } from "../ws/helpers";
import { addAvatar, POSTER } from "./helpers";

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
