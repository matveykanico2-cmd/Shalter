// Каталог каналов (server/routes/channels.js, /api/channels) и посты каналов
// с комментариями (server/routes/posts.js, /api/posts).
import { z } from "zod";
import { isoDate } from "./common";
import { message } from "./message";
import { publicUser } from "./user";

/** GET /api/channels — поля берутся из rowToChat как есть, поэтому пустые отсутствуют. */
export const channelSearchBody = z.strictObject({
  channels: z.array(
    z.strictObject({
      id: z.string(),
      title: z.string().nullable(),
      username: z.string().optional(),
      description: z.string().optional(),
      avatarColor: z.string().optional(),
      avatarImage: z.string().optional(),
      subscriberCount: z.number(),
      isMember: z.boolean(),
    })
  ),
});

/** GET /api/channels/:id/similar */
export const similarChannelsBody = z.strictObject({
  channels: z.array(
    z.strictObject({
      id: z.string(),
      title: z.string().nullable(),
      username: z.string().optional(),
      avatarColor: z.string().optional(),
      avatarImage: z.string().optional(),
      isVerified: z.boolean(),
      subscriberCount: z.number(),
      isMember: z.boolean(),
    })
  ),
});

/** GET /api/channels/:id/stats */
export const channelStatsBody = z.strictObject({
  subscribers: z.number(),
  posts: z.number(),
  views: z.number(),
  comments: z.number(),
  reactions: z.number(),
  averageViews: z.number(),
  firstPostAt: isoDate.nullable(),
  lastPostAt: isoDate.nullable(),
  byDay: z.array(z.strictObject({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), posts: z.number(), views: z.number() })),
  top: z.array(
    z.strictObject({ id: z.string(), text: z.string(), createdAt: isoDate, views: z.number(), commentCount: z.number() })
  ),
});

/** POST /api/posts/:postId/view */
export const postViewBody = z.strictObject({ views: z.number(), counted: z.boolean() });

/** GET /api/posts/:postId/comments */
export const commentsBody = z.strictObject({
  post: message,
  anchor: message,
  chat: z.strictObject({ id: z.string(), title: z.string().nullable() }),
  members: z.array(publicUser),
  replies: z.array(message),
  canComment: z.boolean(),
  commentPriceStars: z.number(),
  commentPriceFree: z.boolean(),
});

/** POST /api/posts/:postId/comments — chargedStars только когда списали звёзды. */
export const commentResultBody = z.strictObject({ message, chargedStars: z.number().optional() });

/** 402 платного комментария (sendGate). */
export const commentPaymentRequired = z.strictObject({
  error: z.string(),
  needStars: z.number(),
  balance: z.number(),
  premiumHelps: z.literal(true),
});
