// Истории каналов (POST /api/stories/channel/:chatId), архив историй
// (GET /api/stories/user/:id/archive, приватность storiesArchive) и удаление
// (DELETE /api/stories/:id — автором, админом канала, модерацией).
import { describe, expect, test } from "vitest";
import { expectError, expectOk, expectShape } from "../../support/expect";
import { createChannel, createDm, createGroup, registerUser, registerUsers } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { okBody } from "../../schemas/common";
import { wsMessageNew } from "../../schemas/messages";
import {
  archiveBody,
  archivedOwnStory,
  archivedViewerStory,
  channelAuthor,
  feedBody,
  likeBody,
  ownStory,
  storyRow,
  userGroupBody,
  viewBody,
  viewerStory,
  viewersBody,
  wsStoryDeleted,
  wsStoryNew,
} from "../../schemas/stories";
import { addContact, setPrivacy, socketPool } from "../ws/helpers";
import { ADMIN_ENV, NO_RIGHTS, NOT_FOUND, adminGetter, comment, imageUrl, postChannelStory, postStory } from "./helpers";

const server = useServer({ env: ADMIN_ENV });
const open = socketPool();
const getAdmin = adminGetter(() => server().baseUrl);

describe("истории каналов", () => {
  test("публикует владелец или админ канала; участнику и постороннему — 403; не канал — 400", async () => {
    const { baseUrl } = server();
    const [owner, admin, member, outsider] = await registerUsers(baseUrl, 4);
    const channel = await createChannel(owner, [admin, member], { adminIds: [admin.id] });
    const group = await createGroup(owner, [member]);
    const body = { kind: "image", url: imageUrl() };

    expectError(await owner.api.post(`/api/stories/channel/${group.id}`, body), 400, "Истории есть только у каналов");
    expectError(await owner.api.post("/api/stories/channel/c_nonexistent00", body), 400, "Истории есть только у каналов");
    expectError(await member.api.post(`/api/stories/channel/${channel.id}`, body), 403, NO_RIGHTS);
    expectError(await outsider.api.post(`/api/stories/channel/${channel.id}`, body), 403, NO_RIGHTS);
    expectError(await owner.api.post(`/api/stories/channel/${channel.id}`, { kind: "image", url: "javascript:x" }), 400, "invalid story");

    const byOwner = expectShape(storyRow, await postChannelStory(owner, channel.id, body));
    expect(byOwner).toMatchObject({ userId: channel.id, items: [body], viewedByIds: [], likedByIds: [] });
    const byAdmin = await postChannelStory(admin, channel.id);
    expect(byAdmin.userId).toBe(channel.id);
  });

  test("story:new — участникам канала, не постороннему; в ленте автор — канал", async () => {
    const { baseUrl } = server();
    const [owner, admin, member, outsider] = await registerUsers(baseUrl, 4);
    const channel = await createChannel(owner, [admin, member], { adminIds: [admin.id], title: "Новости" });
    const [mWs, oWs] = await Promise.all([open(member.api), open(outsider.api)]);
    const story = await postChannelStory(owner, channel.id);

    const e = await mWs.waitFor("story:new", (x) => x.storyId === story.id, 10_000);
    expect(expectShape(wsStoryNew, e)).toEqual({ type: "story:new", storyId: story.id, userId: channel.id });
    await oWs.expectNone("story:new", (x) => x.storyId === story.id);

    // Участник: canManage false, списки скрыты.
    const memberFeed = expectOk(await member.api.get("/api/stories"), feedBody).groups;
    const mGroup = memberFeed.find((g: any) => g.user.id === channel.id)!;
    expect(expectShape(channelAuthor, mGroup.user)).toEqual({
      id: channel.id,
      name: "Новости",
      username: null,
      avatarColor: expect.any(String),
      avatarImage: null,
      isChannel: true,
      canManage: false,
    });
    expectShape(viewerStory, mGroup.stories[0]);

    // Админ канала: canManage true, списки видны.
    const { group } = expectOk(await admin.api.get(`/api/stories/user/${channel.id}`), userGroupBody);
    expect(group?.user).toMatchObject({ id: channel.id, isChannel: true, canManage: true });
    expectShape(ownStory, group?.stories[0]);

    // Посторонний историй канала не видит.
    expect(expectOk(await outsider.api.get(`/api/stories/user/${channel.id}`), userGroupBody)).toEqual({ group: null });
    expect(expectOk(await outsider.api.get("/api/stories"), feedBody)).toEqual({ groups: [] });
    expectError(await outsider.api.post(`/api/stories/${story.id}/view`), 404, NOT_FOUND);
  });

  test("просмотры канала: viewers — владельцу и админам; участнику — 403", async () => {
    const { baseUrl } = server();
    const [owner, admin, member] = await registerUsers(baseUrl, 3);
    const channel = await createChannel(owner, [admin, member], { adminIds: [admin.id] });
    const story = await postChannelStory(owner, channel.id);

    // Ответ /view админу канала — со списками, как в ленте; участнику — без.
    const viewed = expectOk(await admin.api.post(`/api/stories/${story.id}/view`), viewBody).story;
    expect(expectShape(ownStory, viewed).viewedByIds).toEqual([admin.id]);
    expectShape(viewerStory, expectOk(await member.api.post(`/api/stories/${story.id}/view`), viewBody).story);
    // То же в ответе /like.
    expectShape(ownStory, expectOk(await admin.api.post(`/api/stories/${story.id}/like`), likeBody).story);
    expectShape(viewerStory, expectOk(await member.api.post(`/api/stories/${story.id}/like`), likeBody).story);

    const byOwner = expectOk(await owner.api.get(`/api/stories/${story.id}/viewers`), viewersBody).viewers;
    expect(byOwner.map((u: any) => u.id)).toEqual([admin.id, member.id]);
    // Себя смотрящий в списке не видит.
    const byAdmin = expectOk(await admin.api.get(`/api/stories/${story.id}/viewers`), viewersBody).viewers;
    expect(byAdmin.map((u: any) => u.id)).toEqual([member.id]);
    expectError(await member.api.get(`/api/stories/${story.id}/viewers`), 403, NO_RIGHTS);
  });

  test("комментарии канала удаляют автор комментария и админы канала; участник — 403", async () => {
    const { baseUrl } = server();
    const [owner, admin, m1, m2] = await registerUsers(baseUrl, 4);
    const channel = await createChannel(owner, [admin, m1, m2], { adminIds: [admin.id] });
    const story = await postChannelStory(owner, channel.id);
    const c1 = await comment(m1, story.id, "раз");
    const c2 = await comment(m1, story.id, "два");
    expectError(await m2.api.delete(`/api/stories/${story.id}/comments/${c1.id}`), 403, NO_RIGHTS);
    expectOk(await admin.api.delete(`/api/stories/${story.id}/comments/${c1.id}`), okBody);
    expectOk(await owner.api.delete(`/api/stories/${story.id}/comments/${c2.id}`), okBody);
  });

  test("удаление истории канала: участнику — 403; админу — ок и story:deleted участникам", async () => {
    const { baseUrl } = server();
    const [owner, admin, member, outsider] = await registerUsers(baseUrl, 4);
    const channel = await createChannel(owner, [admin, member], { adminIds: [admin.id] });
    const story = await postChannelStory(owner, channel.id);
    const [mWs, oWs] = await Promise.all([open(member.api), open(outsider.api)]);

    expectError(await member.api.delete(`/api/stories/${story.id}`), 403, NO_RIGHTS);
    expectError(await outsider.api.delete(`/api/stories/${story.id}`), 403, NO_RIGHTS);
    expectOk(await admin.api.delete(`/api/stories/${story.id}`), okBody);
    const e = await mWs.waitFor("story:deleted", (x) => x.storyId === story.id, 10_000);
    expect(expectShape(wsStoryDeleted, e)).toEqual({ type: "story:deleted", storyId: story.id, userId: channel.id });
    await oWs.expectNone("story:deleted", (x) => x.storyId === story.id);
    // Модерационного сообщения владельцу нет — удалил свой админ.
    expect(expectOk(await member.api.get(`/api/stories/user/${channel.id}`), userGroupBody)).toEqual({ group: null });
  });

  test("модератор удаляет историю чужого канала — владелец получает сообщение от системного бота", async () => {
    const { baseUrl } = server();
    const owner = await registerUser(baseUrl);
    const member = await registerUser(baseUrl);
    const channel = await createChannel(owner, [member], { title: "Спорный" });
    const story = await postChannelStory(owner, channel.id);
    const moderator = await getAdmin();
    const [ownerWs, mWs] = await Promise.all([open(owner.api), open(member.api)]);

    expectOk(await moderator.api.delete(`/api/stories/${story.id}`), okBody);
    await mWs.waitFor("story:deleted", (x) => x.storyId === story.id, 10_000);
    const e = await ownerWs.waitFor("message:new", (x) => typeof x.message?.text === "string" && x.message.text.includes("модерацией"), 10_000);
    expectShape(wsMessageNew, e);
    expect(e.message.text).toBe("🛡 История канала «Спорный» удалена модерацией Shalter за нарушение правил.");
    expect(e.message.senderId).not.toBe(moderator.id);
    // Сообщение — в личке владельца с системным ботом, участнику не приходит.
    await mWs.expectNone("message:new", (x) => x.message?.id === e.message.id);
  });
});

describe("архив историй", () => {
  test("свой архив: allowed, все истории по убыванию даты, expired: false, со списками", async () => {
    const a = await registerUser(server().baseUrl);
    expect(expectOk(await a.api.get(`/api/stories/user/${a.id}/archive`), archiveBody)).toEqual({ allowed: true, stories: [] });
    const s1 = await postStory(a);
    const s2 = await postStory(a);
    const { allowed, stories } = expectOk(await a.api.get(`/api/stories/user/${a.id}/archive`), archiveBody);
    expect(allowed).toBe(true);
    // Под нагрузкой обе истории могут получить одну и ту же миллисекунду createdAt —
    // тогда их взаимный порядок не определён; проверяем состав и убывание дат.
    expect(stories.map((s: any) => s.id).sort()).toEqual([s1.id, s2.id].sort());
    expect(Date.parse(stories[0].createdAt)).toBeGreaterThanOrEqual(Date.parse(stories[1].createdAt));
    for (const s of stories) expectShape(archivedOwnStory, s);
    expect(stories[0]).toMatchObject({ expired: false, viewed: false, likeCount: 0, viewCount: 0 });
  });

  test("чужой архив: по умолчанию nobody — закрыт даже взаимному контакту", async () => {
    const { baseUrl } = server();
    const [author, viewer] = await registerUsers(baseUrl, 2);
    await addContact(viewer, author);
    await addContact(author, viewer);
    await postStory(author);
    expect(expectOk(await viewer.api.get(`/api/stories/user/${author.id}/archive`), archiveBody)).toEqual({ stories: [], allowed: false });
  });

  test("storiesArchive: everyone — видят те, кому видны истории; посторонний — нет", async () => {
    const { baseUrl } = server();
    const [author, viewer, outsider] = await registerUsers(baseUrl, 3);
    await addContact(author, viewer);
    const story = await postStory(author);
    await setPrivacy(author, { storiesArchive: "everyone" });

    const res = expectOk(await viewer.api.get(`/api/stories/user/${author.id}/archive`), archiveBody);
    expect(res.allowed).toBe(true);
    expect(res.stories.map((s: any) => s.id)).toEqual([story.id]);
    expectShape(archivedViewerStory, res.stories[0]);
    // Видимость историй проверяется раньше приватности.
    expect(expectOk(await outsider.api.get(`/api/stories/user/${author.id}/archive`), archiveBody)).toEqual({ stories: [], allowed: false });
    expect(expectOk(await viewer.api.get("/api/stories/user/u_nonexistent00/archive"), archiveBody)).toEqual({ stories: [], allowed: false });
  });

  test("storiesArchive: contacts — только тем, кто в контактах у автора; исключения allow/deny", async () => {
    const { baseUrl } = server();
    const [author, inContacts, follower, allowed, denied] = await registerUsers(baseUrl, 5);
    // follower и allowed видят истории через личку, но в контактах у автора их нет.
    for (const u of [follower, allowed]) await createDm(u, author);
    await addContact(author, inContacts);
    await addContact(author, denied);
    await postStory(author);
    await setPrivacy(author, { storiesArchive: "contacts", exceptions: { storiesArchive: { allow: [allowed.id], deny: [denied.id] } } });

    const archiveOf = async (u: typeof author) => expectOk(await u.api.get(`/api/stories/user/${author.id}/archive`), archiveBody).allowed;
    expect(await archiveOf(inContacts)).toBe(true);
    expect(await archiveOf(follower)).toBe(false);
    expect(await archiveOf(allowed)).toBe(true);
    expect(await archiveOf(denied)).toBe(false);
  });

  test("архив канала: участникам — да (админу — со списками), не участникам — нет", async () => {
    const { baseUrl } = server();
    const [owner, member, outsider] = await registerUsers(baseUrl, 3);
    const channel = await createChannel(owner, [member]);
    const story = await postChannelStory(owner, channel.id);

    const forMember = expectOk(await member.api.get(`/api/stories/user/${channel.id}/archive`), archiveBody);
    expect(forMember.allowed).toBe(true);
    expect(forMember.stories.map((s: any) => s.id)).toEqual([story.id]);
    expectShape(archivedViewerStory, forMember.stories[0]);
    expectShape(archivedOwnStory, expectOk(await owner.api.get(`/api/stories/user/${channel.id}/archive`), archiveBody).stories[0]);

    expect(expectOk(await outsider.api.get(`/api/stories/user/${channel.id}/archive`), archiveBody)).toEqual({ stories: [], allowed: false });
    expect(expectOk(await owner.api.get("/api/stories/user/c_nonexistent00/archive"), archiveBody)).toEqual({ stories: [], allowed: false });
  });
});

describe("DELETE /api/stories/:id", () => {
  test("автор удаляет свою: story:deleted аудитории, не постороннему; история пропадает отовсюду", async () => {
    const { baseUrl } = server();
    const [author, follower, outsider] = await registerUsers(baseUrl, 3);
    await addContact(author, follower);
    const story = await postStory(author);
    const [fWs, oWs] = await Promise.all([open(follower.api), open(outsider.api)]);

    expectError(await follower.api.delete(`/api/stories/${story.id}`), 403, NO_RIGHTS);
    expectOk(await author.api.delete(`/api/stories/${story.id}`), okBody);
    const e = await fWs.waitFor("story:deleted", (x) => x.storyId === story.id, 10_000);
    expect(expectShape(wsStoryDeleted, e)).toEqual({ type: "story:deleted", storyId: story.id, userId: author.id });
    await oWs.expectNone("story:deleted", (x) => x.storyId === story.id);

    expect(expectOk(await follower.api.get(`/api/stories/user/${author.id}`), userGroupBody)).toEqual({ group: null });
    expect(expectOk(await author.api.get(`/api/stories/user/${author.id}/archive`), archiveBody).stories).toEqual([]);
    expectError(await follower.api.post(`/api/stories/${story.id}/view`), 404, NOT_FOUND);
    expectError(await author.api.get(`/api/stories/${story.id}/viewers`), 404, NOT_FOUND);
    expectError(await author.api.delete(`/api/stories/${story.id}`), 404, NOT_FOUND);
    expectError(await author.api.delete("/api/stories/st_1_00000000"), 404, NOT_FOUND);
  });

  test("модератор удаляет чужую историю — автор получает сообщение от системного бота", async () => {
    const { baseUrl } = server();
    const author = await registerUser(baseUrl);
    const story = await postStory(author);
    const moderator = await getAdmin();
    const [aWs, modWs] = await Promise.all([open(author.api), open(moderator.api)]);

    expectOk(await moderator.api.delete(`/api/stories/${story.id}`), okBody);
    // story:deleted — и автору, и модератору.
    await aWs.waitFor("story:deleted", (x) => x.storyId === story.id, 10_000);
    await modWs.waitFor("story:deleted", (x) => x.storyId === story.id, 10_000);
    const e = await aWs.waitFor("message:new", (x) => x.message?.text === "🛡 Ваша история удалена модерацией Shalter за нарушение правил.", 10_000);
    expectShape(wsMessageNew, e);
    expect(e.message.senderId).not.toBe(moderator.id);
    expect(expectOk(await author.api.get(`/api/stories/user/${author.id}/archive`), archiveBody).stories).toEqual([]);
  });
});
