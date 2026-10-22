import type { stories, storyComments } from "../../db/schema.js";

export type StoryRow = typeof stories.$inferSelect;
export type StoryCommentRow = typeof storyComments.$inferSelect;

export interface StoryItem {
  kind: string;
  url: string;
  [extra: string]: unknown;
}

/** История — как rowToStory в server/data/stories.js. */
export interface Story {
  id: string;
  userId: string;
  kind: string;
  url: string;
  items: StoryItem[];
  createdAt: string;
  expiresAt: string;
  viewedByIds: string[];
  likedByIds: string[];
}

/** Комментарий к истории — как rowToComment в server/data/stories.js. */
export interface StoryComment {
  id: string;
  storyId: string;
  userId: string;
  text: string;
  createdAt: string;
  editedAt: string | undefined;
  parentId: string | null;
  likedByIds: string[];
  likeCount: number;
}

export interface NewStory {
  id: string;
  userId: string;
  items: StoryItem[];
  createdAt: string;
  expiresAt: string;
}

export interface NewStoryComment {
  id: string;
  storyId: string;
  userId: string;
  text: string;
  createdAt: string;
  parentId: string | null;
}
