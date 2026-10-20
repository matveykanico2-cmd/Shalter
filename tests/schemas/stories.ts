// Истории: rowToStory / rowToComment (server/data/stories.js) и то, как их
// отдаёт server/routes/stories.js (storyFor, authorInfo, WS-события).
import { z } from "zod";
import { isoDate } from "./common";
import { publicUser } from "./user";

/** id истории: `st_<ms>_<8 hex>` (routes/stories.js), не genId. */
export const storyId = z.string().regex(/^st_\d+_[a-f0-9]{8}$/);
/** id комментария: `stc_<ms>_<8 hex>`. */
export const commentId = z.string().regex(/^stc_\d+_[a-f0-9]{8}$/);

/** Элемент истории; поля обработанного видео дописывает processStoryVideos. */
export const storyItem = z.strictObject({
  kind: z.enum(["image", "video"]),
  url: z.string(),
  previewUrl: z.string().optional(),
  posterUrl: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  durationSec: z.number().optional(),
});

const storyRowShape = {
  id: storyId,
  /** Автор: id пользователя или id канала (c_…). */
  userId: z.string(),
  /** kind/url — первый элемент (наследие одноэлементных историй). */
  kind: z.enum(["image", "video"]),
  url: z.string(),
  items: z.array(storyItem).min(1),
  createdAt: isoDate,
  expiresAt: isoDate,
  viewedByIds: z.array(z.string()),
  likedByIds: z.array(z.string()),
};

/** История как есть в базе — ответ POST /api/stories и /channel/:id. */
export const storyRow = z.strictObject(storyRowShape);

const viewerFlags = {
  viewed: z.boolean(),
  liked: z.boolean(),
  likeCount: z.number().int(),
  viewCount: z.number().int(),
};

/** storyFor для автора (или админа канала): списки посмотревших и лайкнувших видны. */
export const ownStory = z.strictObject({ ...storyRowShape, ...viewerFlags });

/** storyFor для зрителя: viewedByIds / likedByIds вырезаны. */
const { viewedByIds: _v, likedByIds: _l, ...publicRowShape } = storyRowShape;
export const viewerStory = z.strictObject({ ...publicRowShape, ...viewerFlags });

export const storyView = z.union([ownStory, viewerStory]);

/** Элемент архива: storyFor + expired. */
export const archivedOwnStory = z.strictObject({ ...storyRowShape, ...viewerFlags, expired: z.boolean() });
export const archivedViewerStory = z.strictObject({ ...publicRowShape, ...viewerFlags, expired: z.boolean() });

/** Автор-канал (authorInfo для c_…). */
export const channelAuthor = z.strictObject({
  id: z.string(),
  name: z.string().nullable(),
  username: z.string().nullable(),
  avatarColor: z.string().optional(),
  avatarImage: z.string().nullable(),
  isChannel: z.literal(true),
  canManage: z.boolean(),
});

export const storyGroup = z.strictObject({
  user: z.union([publicUser, channelAuthor]),
  stories: z.array(storyView).min(1),
});

export const feedBody = z.strictObject({ groups: z.array(storyGroup) });
export const userGroupBody = z.strictObject({ group: storyGroup.nullable() });
export const archiveBody = z.strictObject({
  allowed: z.boolean(),
  stories: z.array(z.union([archivedOwnStory, archivedViewerStory])),
});
export const storyRowBody = z.strictObject({ story: storyRow });
export const viewBody = z.strictObject({ story: storyView });
export const likeBody = z.strictObject({ story: storyView, liked: z.boolean(), likeCount: z.number().int() });
export const viewersBody = z.strictObject({ viewers: z.array(publicUser) });

export const storyComment = z.strictObject({
  id: commentId,
  storyId,
  userId: z.string(),
  text: z.string(),
  createdAt: isoDate,
  editedAt: isoDate.optional(),
  parentId: commentId.nullable(),
  likedByIds: z.array(z.string()),
  likeCount: z.number().int(),
});
export const storyCommentWithAuthor = z.strictObject({ ...storyComment.shape, author: publicUser.nullable() });

export const commentsBody = z.strictObject({ comments: z.array(storyCommentWithAuthor) });
export const commentBody = z.strictObject({ comment: storyCommentWithAuthor });
export const commentLikeBody = z.strictObject({ comment: storyComment, liked: z.boolean(), likeCount: z.number().int() });

// WS-события историй.
export const wsStoryNew = z.strictObject({ type: z.literal("story:new"), storyId, userId: z.string() });
export const wsStoryDeleted = z.strictObject({ type: z.literal("story:deleted"), storyId, userId: z.string() });
export const wsStoryLiked = z.strictObject({ type: z.literal("story:liked"), storyId, userId: z.string(), likeCount: z.number().int() });
export const wsStoryCommented = z.strictObject({ type: z.literal("story:commented"), storyId, comment: storyCommentWithAuthor });
export const wsStoryCommentUpdated = z.strictObject({ type: z.literal("story:comment-updated"), storyId, comment: storyCommentWithAuthor });
export const wsStoryCommentLiked = z.strictObject({
  type: z.literal("story:comment-liked"),
  storyId,
  commentId,
  likeCount: z.number().int(),
  likedByIds: z.array(z.string()),
});
export const wsStoryCommentDeleted = z.strictObject({ type: z.literal("story:comment-deleted"), storyId, commentId });
