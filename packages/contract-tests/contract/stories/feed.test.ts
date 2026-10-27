// Истории: публикация (POST /api/stories), лента (GET /api/stories), истории
// одного автора (GET /api/stories/user/:id) и кому они видны (server/routes/stories.js).
//
// Видимость: зритель видит автора, если автор у зрителя в контактах, или у них
// есть личка, или это канал, где зритель участник. Блокировка автором скрывает
// его из ленты.
import { describe, expect, test } from "vitest";
import { Api } from "../../support/client";
import { expectError, expectOk, expectShape } from "../../support/expect";
import { createDm, registerUser, registerUsers } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { publicUser } from "../../schemas/user";
import { feedBody, ownStory, storyRow, storyRowBody, userGroupBody, viewerStory, wsStoryNew } from "../../schemas/stories";
import { addContact, block, socketPool } from "../ws/helpers";
import { imageUrl, postStory } from "./helpers";
import { download } from "../uploads/helpers";
import { fakeUploadUrl, uploadedUrl } from "../users/helpers";

const server = useServer();
const open = socketPool();

describe("без сессии", () => {
  const routes: Array<[string, string]> = [
    ["GET", "/api/stories"],
    ["GET", "/api/stories/user/u_x"],
    ["GET", "/api/stories/user/u_x/archive"],
    ["POST", "/api/stories"],
    ["POST", "/api/stories/channel/c_x"],
    ["POST", "/api/stories/st_1_00000000/view"],
    ["POST", "/api/stories/st_1_00000000/like"],
    ["GET", "/api/stories/st_1_00000000/comments"],
    ["POST", "/api/stories/st_1_00000000/comments"],
    ["POST", "/api/stories/st_1_00000000/comments/stc_1_00000000/like"],
    ["PATCH", "/api/stories/st_1_00000000/comments/stc_1_00000000"],
    ["DELETE", "/api/stories/st_1_00000000/comments/stc_1_00000000"],
    ["GET", "/api/stories/st_1_00000000/viewers"],
    ["DELETE", "/api/stories/st_1_00000000"],
  ];
  test.each(routes)("%s %s → 401 unauthorized", async (method, path) => {
    const api = new Api(server().baseUrl);
    expectError(await api.request(method, path, method === "GET" ? {} : { json: {} }), 401, "unauthorized");
  });
});

describe("POST /api/stories — публикация", () => {
  test("одна картинка: история на 24 часа, kind/url = первый элемент, пустые списки", async () => {
    const a = await registerUser(server().baseUrl);
    const url = imageUrl();
    const before = Date.now();
    const { story } = expectOk(await a.api.post("/api/stories", { kind: "image", url }), storyRowBody);
    expect(story).toEqual({
      id: expect.any(String),
      userId: a.id,
      kind: "image",
      url,
      items: [{ kind: "image", url }],
      createdAt: expect.any(String),
      expiresAt: expect.any(String),
      viewedByIds: [],
      likedByIds: [],
    });
    const created = Date.parse(story.createdAt);
    expect(created).toBeGreaterThanOrEqual(before - 1000);
    expect(Date.parse(story.expiresAt) - created).toBe(24 * 60 * 60 * 1000);
  });

  test("items: до 10 элементов, лишние поля и неподходящие элементы отбрасываются", async () => {
    const a = await registerUser(server().baseUrl);
    const urls = Array.from({ length: 12 }, () => imageUrl());
    const items = urls.map((url, i) => ({ kind: i % 2 ? "video" : "image", url, caption: "лишнее" }));
    const story = expectShape(storyRow, await postStory(a, { items }));
    expect(story.items).toEqual(items.slice(0, 10).map(({ kind, url }) => ({ kind, url })));

    // Сначала обрезка до 10, потом фильтр: плохие элементы просто выпадают.
    const good = imageUrl();
    const mixed = await postStory(a, {
      items: [{ kind: "audio", url: imageUrl() }, { kind: "image", url: "javascript:alert(1)" }, { kind: "image" }, null, { kind: "image", url: good }],
    });
    expect(mixed.items).toEqual([{ kind: "image", url: good }]);
    expect(mixed).toMatchObject({ kind: "image", url: good });

    // data: и http:// — тоже «безопасные» адреса (isSafeUrl).
    const data = await postStory(a, { kind: "image", url: "data:image/png;base64,AAAA" });
    expect(data.url).toBe("data:image/png;base64,AAAA");
    // Пустой items → берутся kind/url из тела.
    const legacy = await postStory(a, { items: [], kind: "video", url: "http://img.test.invalid/v.mp4" });
    expect(legacy.items).toEqual([{ kind: "video", url: "http://img.test.invalid/v.mp4" }]);
  });

  test("400 invalid story: нет элементов, чужой вид, опасный адрес", async () => {
    const a = await registerUser(server().baseUrl);
    const bad = [
      {},
      { kind: "image" },
      { kind: "audio", url: imageUrl() },
      { kind: "image", url: "javascript:alert(1)" },
      { kind: "image", url: "ftp://img.test.invalid/x.jpg" },
      { items: [{ kind: "gif", url: imageUrl() }] },
    ];
    for (const body of bad) expectError(await a.api.post("/api/stories", body), 400, "invalid story");
    expect(expectOk(await a.api.get(`/api/stories/user/${a.id}`), userGroupBody)).toEqual({ group: null });
  });

  test("картинка из /uploads — только своя или уже доступная: чужая неприкреплённая и выдуманная → 400", async () => {
    const [a, b] = await registerUsers(server().baseUrl, 2);
    const theirs = await uploadedUrl(b);
    for (const body of [{ kind: "image", url: theirs }, { items: [{ kind: "image", url: imageUrl() }, { kind: "image", url: theirs }] }, { kind: "image", url: fakeUploadUrl() }]) {
      expectError(await a.api.post("/api/stories", body), 400, "Некорректная ссылка на файл");
    }
    expect(expectOk(await a.api.get(`/api/stories/user/${a.id}`), userGroupBody)).toEqual({ group: null });
    expect((await download(a.api, theirs)).status).toBe(404);

    const mine = await uploadedUrl(a);
    expect((await postStory(a, { kind: "image", url: mine })).items).toEqual([{ kind: "image", url: mine }]);
    // Файл из истории a открывается всем вошедшим — и его можно поставить в свою историю.
    expect((await download(b.api, mine)).status).toBe(200);
    await postStory(b, { kind: "image", url: mine });
  });

  test("story:new — автору, его контактам и собеседникам по личке; не посторонним", async () => {
    const { baseUrl } = server();
    const [author, follower, partner, outsider, fan] = await registerUsers(baseUrl, 5);
    await addContact(author, follower); // автор добавил follower в контакты
    await createDm(partner, author); // личка
    await addContact(fan, author); // fan сам добавил автора — без согласия автора истории не видит

    const sockets = await Promise.all([author, follower, partner, outsider, fan].map((u) => open(u.api)));
    const story = await postStory(author);
    for (const ws of sockets.slice(0, 3)) {
      const e = await ws.waitFor("story:new", (x) => x.storyId === story.id, 10_000);
      expect(expectShape(wsStoryNew, e)).toEqual({ type: "story:new", storyId: story.id, userId: author.id });
    }
    await sockets[3].expectNone("story:new", (x) => x.storyId === story.id);
    await sockets[4].expectNone("story:new", (x) => x.storyId === story.id, 50);
  });
});

describe("GET /api/stories — лента", () => {
  test("автор видит свои истории со списками; подписчик — без списков; истории по возрастанию даты", async () => {
    const { baseUrl } = server();
    const [author, follower] = await registerUsers(baseUrl, 2);
    await addContact(author, follower);
    const first = await postStory(author);
    const second = await postStory(author, { items: [{ kind: "image", url: imageUrl() }, { kind: "video", url: imageUrl() }] });

    const own = expectOk(await author.api.get("/api/stories"), feedBody).groups;
    expect(own).toHaveLength(1);
    expectShape(publicUser, own[0].user);
    expect(own[0].user).toMatchObject({ id: author.id, name: author.name });
    expect(own[0].stories.map((s: any) => s.id)).toEqual([first.id, second.id]);
    for (const s of own[0].stories) expectShape(ownStory, s);
    expect(own[0].stories[0]).toMatchObject({ viewed: false, liked: false, likeCount: 0, viewCount: 0, viewedByIds: [], likedByIds: [] });

    const feed = expectOk(await follower.api.get("/api/stories"), feedBody).groups;
    expect(feed).toHaveLength(1);
    expect(feed[0].user).toMatchObject({ id: author.id });
    expect(feed[0].stories.map((s: any) => s.id)).toEqual([first.id, second.id]);
    for (const s of feed[0].stories) {
      expectShape(viewerStory, s);
      expect(s).not.toHaveProperty("viewedByIds");
      expect(s).not.toHaveProperty("likedByIds");
    }
    expect(feed[0].stories[1].items).toHaveLength(2);
  });

  test("кто видит: контакт автора и собеседник по личке — да; посторонний и добавивший автора к себе — нет", async () => {
    const { baseUrl } = server();
    const [author, follower, partner, outsider, authorsContact] = await registerUsers(baseUrl, 5);
    await addContact(follower, author);
    await createDm(partner, author);
    await addContact(author, authorsContact);
    const story = await postStory(author);

    // «Контакты» — со стороны автора: видит тот, кого автор сам добавил.
    for (const viewer of [authorsContact, partner]) {
      const groups = expectOk(await viewer.api.get("/api/stories"), feedBody).groups;
      expect(groups.map((g: any) => g.user.id)).toEqual([author.id]);
      const { group } = expectOk(await viewer.api.get(`/api/stories/user/${author.id}`), userGroupBody);
      expect(group?.user).toMatchObject({ id: author.id });
      expect(group?.stories.map((s: any) => s.id)).toEqual([story.id]);
    }
    // Тот, кто просто добавил автора к себе в контакты, без согласия автора историй не видит.
    for (const viewer of [outsider, follower]) {
      expect(expectOk(await viewer.api.get("/api/stories"), feedBody)).toEqual({ groups: [] });
      expect(expectOk(await viewer.api.get(`/api/stories/user/${author.id}`), userGroupBody)).toEqual({ group: null });
    }
  });

  test("GET /user/:id: без историй и несуществующий автор — group: null", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    await addContact(a, b);
    expect(expectOk(await a.api.get(`/api/stories/user/${b.id}`), userGroupBody)).toEqual({ group: null });
    expect(expectOk(await a.api.get("/api/stories/user/u_nonexistent00"), userGroupBody)).toEqual({ group: null });
    // Свои истории видны себе.
    const story = await postStory(a);
    const { group } = expectOk(await a.api.get(`/api/stories/user/${a.id}`), userGroupBody);
    expect(group?.stories.map((s: any) => s.id)).toEqual([story.id]);
    expectShape(ownStory, group?.stories[0]);
  });

  test("автор заблокировал зрителя — лента и /user/:id его не показывают; разблокировал — снова видно", async () => {
    const { baseUrl } = server();
    const [author, viewer] = await registerUsers(baseUrl, 2);
    await addContact(author, viewer);
    const story = await postStory(author);
    expect(expectOk(await viewer.api.get("/api/stories"), feedBody).groups).toHaveLength(1);

    await block(author, viewer);
    expect(expectOk(await viewer.api.get("/api/stories"), feedBody)).toEqual({ groups: [] });
    expect(expectOk(await viewer.api.get(`/api/stories/user/${author.id}`), userGroupBody)).toEqual({ group: null });
    // По известному id заблокированный тоже не смотрит, не лайкает и не комментирует.
    expect((await viewer.api.post(`/api/stories/${story.id}/view`)).status).toBe(404);
    expect((await viewer.api.post(`/api/stories/${story.id}/like`)).status).toBe(404);
    expect((await viewer.api.get(`/api/stories/${story.id}/comments`)).status).toBe(404);
    expect((await viewer.api.post(`/api/stories/${story.id}/comments`, { text: "привет" })).status).toBe(404);

    // Обратное направление (зритель заблокировал автора) ленту не скрывает.
    await block(author, viewer, false);
    await block(viewer, author);
    expect(expectOk(await viewer.api.get("/api/stories"), feedBody).groups.map((g: any) => g.user.id)).toEqual([author.id]);
  });

  test("автор удалил зрителя из контактов — его истории пропадают из ленты", async () => {
    const { baseUrl } = server();
    const [author, viewer] = await registerUsers(baseUrl, 2);
    await addContact(author, viewer);
    await postStory(author);
    expect(expectOk(await viewer.api.get("/api/stories"), feedBody).groups).toHaveLength(1);
    expect((await author.api.delete("/api/contacts", { userId: viewer.id })).status).toBe(200);
    expect(expectOk(await viewer.api.get("/api/stories"), feedBody)).toEqual({ groups: [] });
  });
});
