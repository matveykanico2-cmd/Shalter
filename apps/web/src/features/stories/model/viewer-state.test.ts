import { describe, expect, it } from "vitest";

import type { StoryGroup } from "@/entities/story";

import { currentStoryOf, initViewer, viewerReducer } from "./viewer-state";

const story = (id: string, userId: string, frames = 1) => ({
  id,
  userId,
  kind: "image",
  url: `/u/${id}`,
  items: Array.from({ length: frames }, (_, i) => ({ kind: "image", url: `/u/${id}/${i}` })),
  createdAt: "2026-10-26T10:00:00.000Z",
  expiresAt: "2026-10-27T10:00:00.000Z",
  viewed: false,
  liked: false,
  likeCount: 0,
  viewCount: 0,
});
const group = (userId: string, ...stories: ReturnType<typeof story>[]) => ({ user: { id: userId, name: userId }, stories }) as unknown as StoryGroup;

const A1 = "st_1_aaaaaaaa";
const A2 = "st_2_aaaaaaaa";
const B1 = "st_3_bbbbbbbb";
const groups = [group("a", story(A1, "a", 2), story(A2, "a")), group("b", story(B1, "b"))];

describe("просмотр историй: переходы", () => {
  it("листает кадры, потом следующего автора; на последнем — закрывается", () => {
    let s = initViewer({ groups, groupIndex: 0, startIndex: 0 });
    s = viewerReducer(s, { type: "next" });
    expect([s.gi, s.si, currentStoryOf(s)?.id]).toEqual([0, 1, A1]);
    s = viewerReducer(viewerReducer(s, { type: "next" }), { type: "next" });
    expect([s.gi, s.si, currentStoryOf(s)?.id]).toEqual([1, 0, B1]);
    s = viewerReducer(s, { type: "prev" });
    expect([s.gi, s.si]).toEqual([0, 2]);
    s = viewerReducer(viewerReducer(s, { type: "nextGroup" }), { type: "next" });
    expect(s.done).toBe(true);
  });

  it("удалённая история выпадает; открытая панель остаётся, если кадр жив", () => {
    let s = initViewer({ groups, groupIndex: 1, startIndex: 0 });
    s = viewerReducer(s, { type: "toggleComments" });
    s = viewerReducer(s, { type: "drop", storyId: A2 });
    expect([s.gi, currentStoryOf(s)?.id, s.commentsOpen]).toEqual([1, B1, true]);
    s = viewerReducer(s, { type: "drop", storyId: A1 });
    expect([s.gi, currentStoryOf(s)?.id]).toEqual([0, B1]);
    s = viewerReducer(s, { type: "drop", storyId: B1 });
    expect(s.done).toBe(true);
  });
});
