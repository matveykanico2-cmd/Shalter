import type {
  archiveBody,
  commentBody,
  commentLikeBody,
  commentsBody,
  feedBody,
  likeBody,
  storyCommentWithAuthor,
  storyGroup,
  storyItem,
  storyRowBody,
  storyView,
  userGroupBody,
  viewBody,
  viewersBody,
} from "@shalter/shared/schemas/stories";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";

import { http } from "@/shared/api";

export type StoryGroup = z.infer<typeof storyGroup>;
export type StoryAuthor = StoryGroup["user"];
/** История в ленте; у автора есть viewedByIds, у зрителя — нет. archive добавляет expired. */
export type Story = z.infer<typeof storyView> & { viewedByIds?: string[]; expired?: boolean };
export type StoryItem = z.infer<typeof storyItem>;
export type StoryComment = z.infer<typeof storyCommentWithAuthor>;
export type StoryViewer = z.infer<typeof viewersBody>["viewers"][number];
export type StoriesArchive = z.infer<typeof archiveBody>;

const id = encodeURIComponent;
const baseKey = ["stories"] as const;

export const storyQueries = {
  baseKey,
  /** Лента над списком чатов: свои, контактов и каналов (GET /api/stories). */
  feed: () =>
    queryOptions({
      queryKey: [...baseKey, "feed"],
      queryFn: ({ signal }) => http.get<z.infer<typeof feedBody>>("/api/stories", signal),
    }),
  /** Действующие истории человека — кружок в профиле. */
  ofUser: (userId: string) =>
    queryOptions({
      queryKey: [...baseKey, "user", userId],
      queryFn: ({ signal }) => http.get<z.infer<typeof userGroupBody>>(`/api/stories/user/${id(userId)}`, signal),
    }),
  /** Архив историй человека — вкладка «Истории» в профиле (allowed: false — скрыт настройкой). */
  archive: (userId: string) =>
    queryOptions({
      queryKey: [...baseKey, "archive", userId],
      queryFn: ({ signal }) => http.get<StoriesArchive>(`/api/stories/user/${id(userId)}/archive`, signal),
    }),
};

export type NewStoryItem = { kind: "image" | "video"; url: string };

export const storyApi = {
  post: (items: NewStoryItem[]) => http.post<z.infer<typeof storyRowBody>>("/api/stories", { items }),
  postToChannel: (chatId: string, items: NewStoryItem[]) => http.post<z.infer<typeof storyRowBody>>(`/api/stories/channel/${id(chatId)}`, { items }),
  view: (storyId: string) => http.post<z.infer<typeof viewBody>>(`/api/stories/${id(storyId)}/view`),
  remove: (storyId: string) => http.delete<unknown>(`/api/stories/${id(storyId)}`),
  like: (storyId: string) => http.post<z.infer<typeof likeBody>>(`/api/stories/${id(storyId)}/like`),
  viewers: (storyId: string) => http.get<z.infer<typeof viewersBody>>(`/api/stories/${id(storyId)}/viewers`),
  comments: (storyId: string) => http.get<z.infer<typeof commentsBody>>(`/api/stories/${id(storyId)}/comments`),
  addComment: (storyId: string, text: string, parentId: string | null) => http.post<z.infer<typeof commentBody>>(`/api/stories/${id(storyId)}/comments`, { text, parentId }),
  likeComment: (storyId: string, commentId: string) => http.post<z.infer<typeof commentLikeBody>>(`/api/stories/${id(storyId)}/comments/${id(commentId)}/like`),
  editComment: (storyId: string, commentId: string, text: string) => http.patch<z.infer<typeof commentBody>>(`/api/stories/${id(storyId)}/comments/${id(commentId)}`, { text }),
  removeComment: (storyId: string, commentId: string) => http.delete<unknown>(`/api/stories/${id(storyId)}/comments/${id(commentId)}`),
};
