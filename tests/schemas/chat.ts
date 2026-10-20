// Чат: rowToChat (server/data/chats.js) и сводка для списка чатов
// (attachSummaries, server/data/chat-summary.js).
import { z } from "zod";
import { anyJson, genId, isoDate } from "./common";
import { message } from "./message";
import { viewerUser } from "./user";

const chatShape = {
  id: genId("c").or(z.string()),
  type: z.enum(["dm", "group", "channel", "bot"]),
  title: z.string().nullable(),
  description: z.string().optional(),
  username: z.string().optional(),
  isPublic: z.literal(true).optional(),
  isVerified: z.literal(true).optional(),
  inviteCode: z.string().optional(),
  approveJoins: z.literal(true).optional(),
  signMessages: z.literal(true).optional(),
  commentsOff: z.boolean(),
  anonymousAdmins: z.literal(true).optional(),
  permissions: anyJson.nullable(),
  avatarColor: z.string().optional(),
  avatarImage: z.string().optional(),
  ownerId: z.string().optional(),
  adminIds: z.array(z.string()),
  moderatorIds: z.array(z.string()),
  ownerIds: z.array(z.string()),
  memberTitles: z.record(z.string(), anyJson),
  memberIds: z.array(z.string()),
  pinned: z.boolean(),
  muted: z.boolean(),
  mutedUntil: isoDate.optional(),
  slowModeSeconds: z.number().optional(),
  commentPriceStars: z.number(),
  archived: z.boolean(),
  createdAt: isoDate,
  linkedDiscussionChatId: z.string().optional(),
  wallpaper: anyJson.nullable(),
  allowedReactions: anyJson.nullable(),
  restrictions: z.record(z.string(), anyJson),
  warnings: z.record(z.string(), anyJson),
  bannedIds: z.array(z.string()),
  rules: z.string().optional(),
  topicsEnabled: z.literal(true).optional(),
  welcomeText: z.string().optional(),
  protectedBy: z.array(z.string()),
  points: z.number(),
  votes: z.record(z.string(), anyJson),
  autoDeleteSeconds: z.number().optional(),
  secret: z.literal(true).optional(),
};

export const chat = z.strictObject(chatShape);

/** Чат в списке чатов и в GET /api/chats/:id — с последним сообщением, счётчиками и собеседником. */
export const chatSummary = z.strictObject({
  ...chatShape,
  mutedUntil: isoDate.nullable(),
  pinOrder: z.number().nullable(),
  isSaved: z.literal(true).optional(),
  lastMessage: message.nullable(),
  unreadCount: z.number(),
  hasUnreadMention: z.boolean(),
  unread: z.literal(true).optional(),
  otherUser: viewerUser.nullable(),
  draft: anyJson.nullable(),
});

export type Chat = z.infer<typeof chat>;
export type ChatSummary = z.infer<typeof chatSummary>;
