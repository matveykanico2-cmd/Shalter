// Сообщение: rowToMessage (server/data/messages.js).
import { z } from "zod";
import { anyJson, genId, isoDate } from "./common";

export const reaction = z.looseObject({ emoji: z.string() });

export const message = z.strictObject({
  id: genId("m").or(z.string()),
  chatId: z.string(),
  senderId: z.string(),
  type: z.string(),
  text: z.string().nullable(),
  createdAt: isoDate,
  editedAt: isoDate.optional(),
  pinned: z.boolean(),
  replyToId: z.string().nullable(),
  forwardedFrom: anyJson.optional(),
  attachments: z.array(anyJson).optional(),
  keyboard: anyJson.optional(),
  gift: anyJson.optional(),
  sticker: anyJson.optional(),
  customEmoji: anyJson.optional(),
  linkPreview: anyJson.optional(),
  report: anyJson.optional(),
  reactions: z.array(anyJson),
  readByIds: z.array(z.string()),
  deletedForIds: z.array(z.string()),
  mentionedUserIds: z.array(z.string()),
  threadRootId: z.string().optional(),
  topicId: z.string().optional(),
  readAt: isoDate.optional(),
  effect: z.string().optional(),
  visibleToId: z.string().optional(),
  storyReply: anyJson.optional(),
  anchorForPostId: z.string().optional(),
  discussionAnchorId: z.string().optional(),
  signedBy: z.string().optional(),
  anonymous: z.literal(true).optional(),
  boostedUntil: isoDate.optional(),
  paidStars: z.number().optional(),
  boostedById: z.string().optional(),
  views: z.number().nullable(),
  commentCount: z.number().optional(),
});

export type Message = z.infer<typeof message>;
