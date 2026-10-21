// Истории: просмотры (POST /:id/view, GET /:id/viewers), лайки (POST /:id/like)
// и комментарии (GET/POST /:id/comments, лайк, правка, удаление) — с WS-событиями
// аудитории автора (server/routes/stories.js).
import { describe, expect, test } from "vitest";
import { expectError, expectOk, expectShape } from "../../support/expect";
import { registerUser, registerUsers, type TestUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { okBody } from "../../schemas/common";
import {
  commentBody,
  commentLikeBody,
  commentsBody,
  likeBody,
  userGroupBody,
  ownStory,
  viewBody,
  viewerStory,
  viewersBody,
  wsStoryCommentDeleted,
  wsStoryCommented,
  wsStoryCommentLiked,
  wsStoryCommentUpdated,
  wsStoryLiked,
} from "../../schemas/stories";
import { addContact, socketPool } from "../ws/helpers";
import { ADMIN_ENV, NO_RIGHTS, NOT_FOUND, adminGetter, comment, postStory } from "./helpers";

const server = useServer({ env: ADMIN_ENV });
const open = socketPool();
const getAdmin = adminGetter(() => server().baseUrl);

/** Автор, два зрителя (они в контактах у автора) и посторонний. */
async function cast(): Promise<{ author: TestUser; v1: TestUser; v2: TestUser; outsider: TestUser; story: any }> {
  const [author, v1, v2, outsider] = await registerUsers(server().baseUrl, 4);
  await addContact(author, v1);
  await addContact(author, v2);
  const story = await postStory(author);
  return { author, v1, v2, outsider, story };
}

describe("просмотры", () => {
  test("POST /view: зритель получает историю без списков, viewed: true; повтор не дублирует", async () => {
    const { author, v1, story } = await cast();
    const first = expectOk(await v1.api.post(`/api/stories/${story.id}/view`), viewBody).story;
    expectShape(viewerStory, first);
    expect(first).toMatchObject({ id: story.id, viewed: true, viewCount: 1, liked: false, likeCount: 0 });
    expect(expectOk(await v1.api.post(`/api/stories/${story.id}/view`), viewBody).story).toMatchObject({ viewCount: 1 });

    // Автор видит, кто посмотрел.
    const own = expectOk(await author.api.get(`/api/stories/user/${author.id}`), userGroupBody).group!.stories[0];
    expect(own).toMatchObject({ viewedByIds: [v1.id], viewCount: 1, viewed: false });
    // Зритель в ленте — viewed: true.
    const feed = (await v1.api.get("/api/stories")).body.groups;
    expect(feed[0].stories[0]).toMatchObject({ viewed: true, viewCount: 1 });
  });

  test("POST /view своей истории — со списками, автор тоже попадает в viewedByIds", async () => {
    const a = await registerUser(server().baseUrl);
    const story = await postStory(a);
    const own = expectOk(await a.api.post(`/api/stories/${story.id}/view`), viewBody).story;
    expectShape(ownStory, own);
    expect(own).toMatchObject({ viewed: true, viewedByIds: [a.id], viewCount: 1 });
    // …но в списке посмотревших автора нет.
    expect(expectOk(await a.api.get(`/api/stories/${story.id}/viewers`), viewersBody)).toEqual({ viewers: [] });
  });

  test("POST /view: постороннему и на несуществующую — 404 not found, просмотр не засчитан", async () => {
    const { author, outsider, story } = await cast();
    expectError(await outsider.api.post(`/api/stories/${story.id}/view`), 404, NOT_FOUND);
    expectError(await author.api.post("/api/stories/st_1_00000000/view"), 404, NOT_FOUND);
    expect((await author.api.get(`/api/stories/${story.id}/viewers`)).body).toEqual({ viewers: [] });
  });

  test("GET /viewers: автору — профили посмотревших по порядку; другим — 403; нет истории — 404", async () => {
    const { author, v1, v2, outsider, story } = await cast();
    await v2.api.post(`/api/stories/${story.id}/view`);
    await v1.api.post(`/api/stories/${story.id}/view`);
    const { viewers } = expectOk(await author.api.get(`/api/stories/${story.id}/viewers`), viewersBody);
    expect(viewers.map((u: any) => u.id)).toEqual([v2.id, v1.id]);
    expect(viewers[0]).toMatchObject({ id: v2.id, name: v2.name, username: v2.username });

    expectError(await v1.api.get(`/api/stories/${story.id}/viewers`), 403, NO_RIGHTS);
    expectError(await outsider.api.get(`/api/stories/${story.id}/viewers`), 403, NO_RIGHTS);
    expectError(await author.api.get("/api/stories/st_1_00000000/viewers"), 404, NOT_FOUND);
    // Модератору список посмотревших закрыт (403), хотя удалять историю он может: для модерации
    // он не нужен, а это чужие данные (решение продукта, 21.10.2026).
    expectError(await (await getAdmin()).api.get(`/api/stories/${story.id}/viewers`), 403, NO_RIGHTS);
  });
});

describe("лайки", () => {
  test("POST /like переключает лайк; story:liked — аудитории автора, не постороннему", async () => {
    const { author, v1, v2, outsider, story } = await cast();
    const [aWs, v2Ws, oWs] = await Promise.all([open(author.api), open(v2.api), open(outsider.api)]);

    const liked = expectOk(await v1.api.post(`/api/stories/${story.id}/like`), likeBody);
    expect(liked).toMatchObject({ liked: true, likeCount: 1 });
    expectShape(viewerStory, liked.story);
    expect(liked.story).toMatchObject({ id: story.id, liked: true, likeCount: 1 });
    for (const ws of [aWs, v2Ws]) {
      const e = await ws.waitFor("story:liked", (x) => x.storyId === story.id && x.likeCount === 1, 10_000);
      expect(expectShape(wsStoryLiked, e)).toEqual({ type: "story:liked", storyId: story.id, userId: author.id, likeCount: 1 });
    }
    // Автор видит, кто лайкнул.
    const own = (await author.api.get(`/api/stories/user/${author.id}`)).body.group.stories[0];
    expect(own).toMatchObject({ likedByIds: [v1.id], likeCount: 1, liked: false });

    const unliked = expectOk(await v1.api.post(`/api/stories/${story.id}/like`), likeBody);
    expect(unliked).toMatchObject({ liked: false, likeCount: 0 });
    await aWs.waitFor("story:liked", (x) => x.storyId === story.id && x.likeCount === 0, 10_000);
    await oWs.expectNone("story:liked", (x) => x.storyId === story.id);
  });

  test("свой лайк — со списками; постороннему и несуществующей — 404", async () => {
    const { author, outsider, story } = await cast();
    const own = expectOk(await author.api.post(`/api/stories/${story.id}/like`), likeBody);
    expect(expectShape(ownStory, own.story).likedByIds).toEqual([author.id]);
    expectError(await outsider.api.post(`/api/stories/${story.id}/like`), 404, NOT_FOUND);
    expectError(await author.api.post("/api/stories/st_1_00000000/like"), 404, NOT_FOUND);
  });
});

describe("комментарии", () => {
  test("POST /comments: текст обрезается, автор комментария вложен; story:commented — аудитории, не постороннему", async () => {
    const { author, v1, v2, outsider, story } = await cast();
    const [aWs, v2Ws, oWs] = await Promise.all([open(author.api), open(v2.api), open(outsider.api)]);

    const res = expectOk(await v1.api.post(`/api/stories/${story.id}/comments`, { text: `  ${"к".repeat(600)}  ` }), commentBody);
    expect(res.comment).toMatchObject({ storyId: story.id, userId: v1.id, text: "к".repeat(500), parentId: null, likedByIds: [], likeCount: 0 });
    expect(res.comment).not.toHaveProperty("editedAt");
    expect(res.comment.author).toMatchObject({ id: v1.id, name: v1.name });

    for (const ws of [aWs, v2Ws]) {
      const e = await ws.waitFor("story:commented", (x) => x.comment?.id === res.comment.id, 10_000);
      expect(expectShape(wsStoryCommented, e)).toEqual({ type: "story:commented", storyId: story.id, comment: res.comment });
    }
    await oWs.expectNone("story:commented", (x) => x.storyId === story.id);

    // Список — по возрастанию даты, с авторами.
    const second = await comment(author, story.id, "спасибо");
    const list = expectOk(await v2.api.get(`/api/stories/${story.id}/comments`), commentsBody).comments;
    expect(list.map((c: any) => c.id)).toEqual([res.comment.id, second.id]);
    expect(list[1].author).toMatchObject({ id: author.id });
  });

  test("ответы: parentId сводится к корню ветки; чужой/несуществующий parentId игнорируется", async () => {
    const { author, v1, story } = await cast();
    const other = await postStory(author);
    const root = await comment(v1, story.id, "корень");
    const reply = await comment(author, story.id, "ответ", root.id);
    expect(reply.parentId).toBe(root.id);
    // Ответ на ответ — тоже в ветку корня (вложенность в один уровень).
    const nested = await comment(v1, story.id, "ответ на ответ", reply.id);
    expect(nested.parentId).toBe(root.id);
    expect((await comment(v1, story.id, "мимо", "stc_1_00000000")).parentId).toBeNull();
    // Комментарий другой истории родителем быть не может.
    const foreign = await comment(v1, other.id, "в другой истории");
    expect((await comment(v1, story.id, "чужой родитель", foreign.id)).parentId).toBeNull();
  });

  test("ошибки POST/GET /comments: пустой текст — 400; посторонний и нет истории — 404", async () => {
    const { author, v1, outsider, story } = await cast();
    expectError(await v1.api.post(`/api/stories/${story.id}/comments`, { text: "   " }), 400, "empty comment");
    expectError(await v1.api.post(`/api/stories/${story.id}/comments`, {}), 400, "empty comment");
    expectError(await outsider.api.post(`/api/stories/${story.id}/comments`, { text: "привет" }), 404, NOT_FOUND);
    expectError(await outsider.api.get(`/api/stories/${story.id}/comments`), 404, NOT_FOUND);
    expectError(await author.api.get("/api/stories/st_1_00000000/comments"), 404, NOT_FOUND);
    expect(expectOk(await author.api.get(`/api/stories/${story.id}/comments`), commentsBody)).toEqual({ comments: [] });
  });

  test("лайк комментария: переключение и story:comment-liked; чужая история/нет комментария — 404", async () => {
    const { author, v1, v2, outsider, story } = await cast();
    const other = await postStory(author);
    const c = await comment(v1, story.id, "нравится?");
    const [aWs, oWs] = await Promise.all([open(author.api), open(outsider.api)]);

    const liked = expectOk(await v2.api.post(`/api/stories/${story.id}/comments/${c.id}/like`), commentLikeBody);
    expect(liked).toMatchObject({ liked: true, likeCount: 1, comment: { id: c.id, likedByIds: [v2.id], likeCount: 1 } });
    expect(liked.comment).not.toHaveProperty("author");
    const e = await aWs.waitFor("story:comment-liked", (x) => x.commentId === c.id && x.likeCount === 1, 10_000);
    expect(expectShape(wsStoryCommentLiked, e)).toEqual({ type: "story:comment-liked", storyId: story.id, commentId: c.id, likeCount: 1, likedByIds: [v2.id] });
    await oWs.expectNone("story:comment-liked", (x) => x.commentId === c.id);

    const unliked = expectOk(await v2.api.post(`/api/stories/${story.id}/comments/${c.id}/like`), commentLikeBody);
    expect(unliked).toMatchObject({ liked: false, likeCount: 0 });
    expect((await v1.api.get(`/api/stories/${story.id}/comments`)).body.comments[0]).toMatchObject({ likedByIds: [], likeCount: 0 });

    expectError(await v2.api.post(`/api/stories/${other.id}/comments/${c.id}/like`), 404, NOT_FOUND);
    expectError(await v2.api.post(`/api/stories/${story.id}/comments/stc_1_00000000/like`), 404, NOT_FOUND);
    expectError(await outsider.api.post(`/api/stories/${story.id}/comments/${c.id}/like`), 404, NOT_FOUND);
  });

  test("PATCH комментария: только свой; editedAt; story:comment-updated; ошибки 400/403/404", async () => {
    const { author, v1, outsider, story } = await cast();
    const other = await postStory(author);
    const c = await comment(v1, story.id, "было");
    const [aWs, oWs] = await Promise.all([open(author.api), open(outsider.api)]);

    const res = expectOk(await v1.api.patch(`/api/stories/${story.id}/comments/${c.id}`, { text: "  стало  " }), commentBody);
    expect(res.comment).toMatchObject({ id: c.id, text: "стало", editedAt: expect.any(String), author: { id: v1.id } });
    const e = await aWs.waitFor("story:comment-updated", (x) => x.comment?.id === c.id, 10_000);
    expect(expectShape(wsStoryCommentUpdated, e)).toEqual({ type: "story:comment-updated", storyId: story.id, comment: res.comment });
    await oWs.expectNone("story:comment-updated", (x) => x.comment?.id === c.id);
    expect((await author.api.get(`/api/stories/${story.id}/comments`)).body.comments[0]).toMatchObject({ text: "стало", editedAt: res.comment.editedAt });

    // Даже автор истории чужой комментарий не правит.
    expectError(await author.api.patch(`/api/stories/${story.id}/comments/${c.id}`, { text: "x" }), 403, "Править можно только свой комментарий");
    expectError(await v1.api.patch(`/api/stories/${story.id}/comments/${c.id}`, { text: " " }), 400, "empty comment");
    expectError(await v1.api.patch(`/api/stories/${other.id}/comments/${c.id}`, { text: "x" }), 404, NOT_FOUND);
    expectError(await v1.api.patch(`/api/stories/st_1_00000000/comments/${c.id}`, { text: "x" }), 404, NOT_FOUND);
    expectError(await v1.api.patch(`/api/stories/${story.id}/comments/stc_1_00000000`, { text: "x" }), 404, NOT_FOUND);
  });

  test("DELETE комментария: свой, автор истории и модератор — да; другой зритель — 403", async () => {
    const { author, v1, v2, outsider, story } = await cast();
    const c1 = await comment(v1, story.id, "1");
    const c2 = await comment(v1, story.id, "2");
    const c3 = await comment(v1, story.id, "3");
    const [aWs, oWs] = await Promise.all([open(author.api), open(outsider.api)]);

    expectError(await v2.api.delete(`/api/stories/${story.id}/comments/${c1.id}`), 403, NO_RIGHTS);
    expectError(await outsider.api.delete(`/api/stories/${story.id}/comments/${c1.id}`), 403, NO_RIGHTS);

    expectOk(await v1.api.delete(`/api/stories/${story.id}/comments/${c1.id}`), okBody);
    const e = await aWs.waitFor("story:comment-deleted", (x) => x.commentId === c1.id, 10_000);
    expect(expectShape(wsStoryCommentDeleted, e)).toEqual({ type: "story:comment-deleted", storyId: story.id, commentId: c1.id });
    await oWs.expectNone("story:comment-deleted", (x) => x.commentId === c1.id);

    expectOk(await author.api.delete(`/api/stories/${story.id}/comments/${c2.id}`), okBody);
    expectOk(await (await getAdmin()).api.delete(`/api/stories/${story.id}/comments/${c3.id}`), okBody);
    expect(expectOk(await author.api.get(`/api/stories/${story.id}/comments`), commentsBody)).toEqual({ comments: [] });
    expectError(await v1.api.delete(`/api/stories/${story.id}/comments/${c1.id}`), 404, NOT_FOUND);
    expectError(await v1.api.delete(`/api/stories/st_1_00000000/comments/${c1.id}`), 404, NOT_FOUND);
  });

  test("PATCH комментария — только пока история видна; удалить свой можно и после", async () => {
    // Автор удалил зрителя из контактов — история ему больше не видна.
    const { author, v1, story } = await cast();
    const c = await comment(v1, story.id, "до");
    expect((await author.api.delete("/api/contacts", { userId: v1.id })).status).toBe(200);
    expectError(await v1.api.get(`/api/stories/${story.id}/comments`), 404, NOT_FOUND);
    expectError(await v1.api.patch(`/api/stories/${story.id}/comments/${c.id}`, { text: "после" }), 404, NOT_FOUND);
    expect(expectOk(await author.api.get(`/api/stories/${story.id}/comments`), commentsBody).comments.map((x: any) => x.text)).toEqual(["до"]);
    // Удаление своего комментария — уборка своих данных, видимость не нужна.
    expectOk(await v1.api.delete(`/api/stories/${story.id}/comments/${c.id}`), okBody);
  });

});
