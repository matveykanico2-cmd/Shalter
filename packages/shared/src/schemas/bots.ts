// Боты: управление ботами владельцем (server/routes/bots.js, /api/bots), Bot API
// по токену (server/routes/botApi.js, /api/bot-api) и мини-приложения.
// Бот — rowToBot (server/data/bots.js); аккаунт бота — publicUser.
import { z } from "zod";
import { chat } from "./chat";
import { anyJson, genId, isoDate } from "./common";
import { message } from "./message";
import { publicUser, viewerUser } from "./user";

export const botToken = z.string().regex(/^[0-9a-f]{48}$/);

export const botCommand = z.strictObject({ command: z.string(), description: z.string() });

/** rowToBot: ownerId/createdAt/code — undefined, если в базе NULL. */
export const bot = z.strictObject({
  id: genId("bot"),
  userId: genId("bot"),
  ownerId: z.string().optional(),
  description: z.string(),
  commands: z.array(botCommand),
  createdAt: isoDate.optional(),
  code: z.string().optional(),
  appUrl: z.string().nullable(),
  appName: z.string().nullable(),
  appCode: z.string().nullable(),
});

export const botWithUser = bot.extend({ user: publicUser });

// ---------- /api/bots ----------
export const botListBody = z.strictObject({ bots: z.array(botWithUser) });
export const botCreatedBody = z.strictObject({ bot: botWithUser, token: botToken });
export const botBody = z.strictObject({ bot: botWithUser });
/** PUT /:id/commands — бот без user. */
export const botCommandsBody = z.strictObject({ bot });
export const tokenBody = z.strictObject({ token: botToken });
export const broadcastBody = z.strictObject({ ok: z.literal(true), sent: z.number() });
export const audienceBody = z.strictObject({
  users: z.number(),
  app: z.strictObject({ name: z.string() }).nullable(),
});
export const appOpenBody = z.strictObject({ url: z.string(), name: z.string(), botId: z.string() });
export const appDataBody = z.strictObject({ ok: z.literal(true), chatId: z.string(), message });

// ---------- /api/bot-api ----------
export const botApp = z.strictObject({ url: z.string(), name: z.string().nullable(), hosted: z.boolean() });
export const meBody = z.strictObject({ bot: publicUser, app: botApp.nullable() });
export const appBody = z.strictObject({ app: botApp.nullable() });
export const botUserBody = z.strictObject({ bot: publicUser });

export const messagesBody = z.strictObject({ messages: z.array(message) });
export const messagesPageBody = z.strictObject({ messages: z.array(message), hasMore: z.boolean() });

export const botChatItem = z.strictObject({
  id: z.string(),
  type: z.enum(["dm", "group", "channel", "bot"]),
  title: z.string().nullable(),
  username: z.string().nullable(),
  memberCount: z.number(),
  isAdmin: z.boolean(),
});
export const getChatsBody = z.strictObject({ chats: z.array(botChatItem) });
export const getChatBody = z.strictObject({
  chat: botChatItem.extend({ description: z.string().nullable() }),
  members: z.array(publicUser),
});
export const getUserBody = z.strictObject({ user: viewerUser });
export const commandsBody = z.strictObject({ commands: z.array(botCommand) });

/** resolveUsername — профиль с учётом приватности (publicUserFor), как getUser. */
export const resolveUserBody = z.strictObject({ kind: z.literal("user"), user: viewerUser });
export const resolveChatBody = z.strictObject({
  kind: z.enum(["group", "channel"]),
  chat: z.strictObject({
    id: z.string(),
    type: z.enum(["group", "channel"]),
    title: z.string().nullable(),
    username: z.string(),
    memberCount: z.number(),
  }),
});

export const joinRequestsBotBody = z.strictObject({
  requests: z.array(
    z.strictObject({ userId: z.string(), createdAt: isoDate, name: z.string(), username: z.string(), bio: z.string() }),
  ),
});
export const joinDecisionBotBody = z.strictObject({ ok: z.literal(true), approved: z.boolean() });
export const memberCountBody = z.strictObject({ ok: z.literal(true), memberCount: z.number() });
export const restrictBody = z.strictObject({ ok: z.literal(true), until: isoDate });
export const chatTitleBody = z.strictObject({ chat: z.strictObject({ id: z.string(), title: z.string() }) });
export const chatDescriptionBody = z.strictObject({ chat: z.strictObject({ id: z.string(), description: z.string() }) });

export const checkWebAppOkBody = z.strictObject({
  ok: z.literal(true),
  user: publicUser,
  chatId: z.string().nullable(),
  authDate: z.number(),
  ageSec: z.number(),
});
export const checkWebAppErrorBody = z.strictObject({ ok: z.literal(false), error: z.string() });

/** rowToScheduled (server/data/scheduledMessages.js); attachments — только если есть. */
export const scheduledItem = z.strictObject({
  id: z.string().regex(/^sm_\d+_[a-z0-9]{1,5}$/),
  chatId: z.string(),
  senderId: z.string(),
  text: z.string(),
  attachments: z.array(anyJson).optional(),
  replyToId: z.string().nullable(),
  topicId: z.string().nullable(),
  repeat: z.string().nullable(),
  sendAt: isoDate,
  createdAt: isoDate,
});
export const scheduledBody = z.strictObject({ scheduled: scheduledItem });
export const scheduledListBody = z.strictObject({ scheduled: z.array(scheduledItem) });

export const createdGroupBody = z.strictObject({
  chat: z.strictObject({ id: genId("c"), title: z.string(), memberCount: z.number() }),
});
export const addMemberBody = z.union([
  z.strictObject({ ok: z.literal(true), memberCount: z.number() }),
  z.strictObject({ ok: z.literal(true), alreadyMember: z.literal(true) }),
]);
export const promoteBody = z.strictObject({ ok: z.literal(true), adminIds: z.array(z.string()) });
export const adminsBody = z.strictObject({ ownerId: z.string().optional(), admins: z.array(publicUser) });
export const countBody = z.strictObject({ count: z.number() });
export const chatMemberBody = z.strictObject({
  user: publicUser,
  isAdmin: z.boolean(),
  isOwner: z.boolean(),
  restrictedUntil: z.string().nullable(),
});
export const permissionFlags = z.strictObject({
  sendMessages: z.boolean(),
  sendMedia: z.boolean(),
  sendStickers: z.boolean(),
  sendPolls: z.boolean(),
  addMembers: z.boolean(),
  pinMessages: z.boolean(),
  createTopics: z.boolean(),
  setOwnTag: z.boolean(),
});
export const permissionsBotBody = z.strictObject({ permissions: permissionFlags });
export const inviteLinkBody = z.strictObject({
  code: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
  link: z.string().regex(/^\/join\/[A-Za-z0-9_-]{22}$/),
});
export const userStatusBody = z.strictObject({ online: z.boolean(), lastSeen: isoDate.nullable() });
export const commonChatsBody = z.strictObject({
  chats: z.array(z.strictObject({ id: z.string(), type: z.string(), title: z.string().nullable() })),
});
export const channelStatsBody = z.strictObject({
  subscribers: z.number(),
  posts: z.number(),
  views: z.number(),
  comments: z.number(),
});
export const myStatsBody = z.strictObject({ chats: z.number(), messagesSent: z.number(), people: z.number() });
export const sendToUserBody = z.strictObject({ chatId: z.string(), message, user: publicUser });
/** createChannel: username — undefined (ключа нет), если не задан. */
export const createdChannelBody = z.strictObject({
  chat: z.strictObject({ id: genId("c"), title: z.string(), username: z.string().optional(), isPublic: z.boolean() }),
});
export const setDiscussionBody = z.strictObject({
  chat,
  discussion: z.strictObject({ id: z.string(), title: z.string().nullable() }).nullable(),
});
export const getDiscussionBody = z.strictObject({
  channel: z.strictObject({ id: z.string(), title: z.string().nullable() }),
  discussion: z.strictObject({ id: z.string(), title: z.string().nullable(), memberCount: z.number() }).nullable(),
});

// ---------- WS-события Bot API ----------
export const wsTypingUpdate = z.strictObject({
  type: z.literal("typing:update"),
  chatId: z.string(),
  userId: z.string(),
  action: z.string(),
});
/** message:deleted из Bot API — кроме id ещё и messageId. */
export const wsBotMessageDeleted = z.strictObject({
  type: z.literal("message:deleted"),
  chatId: z.string(),
  id: z.string(),
  messageId: z.string(),
});
export const wsChatDeleted = z.strictObject({ type: z.literal("chat:deleted"), chatId: z.string() });
