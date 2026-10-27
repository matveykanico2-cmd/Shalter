// Ответы модуля чатов (server/routes/chats.js) и bootstrap (server/routes/bootstrap.js),
// которые не сводятся к общим chat / chatSummary.
import { z } from "zod";
import { anyJson, isoDate } from "./common";
import { chat, chatSummary } from "./chat";
import { message } from "./message";
import { publicUser, viewerUser } from "./user";

/** { chat } — чат как есть (rowToChat). */
export const chatBody = z.strictObject({ chat });

/** GET /api/chats */
export const chatList = z.strictObject({ chats: z.array(chatSummary) });

/** GET /api/chats/:id */
export const chatCard = z.strictObject({
  chat: chatSummary,
  members: z.array(publicUser),
  commands: anyJson.nullable(),
  paidMessages: z
    .strictObject({ stars: z.number(), youPay: z.boolean(), kind: z.literal("comment").optional() })
    .nullable(),
});

/** POST /:id/mute — чат с наложенным личным состоянием звука (mutedUntil может быть null). */
export const muteBody = z.strictObject({ chat: chat.extend({ mutedUntil: isoDate.nullable() }) });

/** GET /:id/features — палитра цветов чата и баллы бустов (lib/chatFeatures.js colorState). */
export const featuresBody = z.strictObject({
  colors: z.array(z.strictObject({ hex: z.string(), name: z.string(), level: z.number(), unlocked: z.boolean() })),
  points: z.number(),
});

const permissionFlags = z.strictObject({
  sendMessages: z.boolean(),
  sendMedia: z.boolean(),
  sendStickers: z.boolean(),
  sendPolls: z.boolean(),
  addMembers: z.boolean(),
  pinMessages: z.boolean(),
  createTopics: z.boolean(),
  setOwnTag: z.boolean(),
});

/** GET /:id/permissions */
export const permissionsBody = z.strictObject({
  permissions: permissionFlags,
  fields: z.array(z.strictObject({ id: z.string(), label: z.string() })),
});

/** POST /:id/permissions */
export const setPermissionsBody = z.strictObject({ chat, permissions: permissionFlags });

/** GET /:id/preview — публичный чат глазами ещё не вступившего. */
export const previewBody = z.strictObject({
  chat: z.strictObject({
    id: z.string(),
    type: z.enum(["group", "channel"]),
    title: z.string().nullable(),
    username: z.string().optional(),
    description: z.string().nullable(),
    avatarColor: z.string().optional(),
    avatarImage: z.string().optional(),
    isVerified: z.boolean(),
    subscribers: z.number(),
    isMember: z.boolean(),
    approveJoins: z.boolean(),
    requestPending: z.boolean(),
  }),
  messages: z.array(message),
  senders: z.array(publicUser),
  hasMore: z.boolean(),
});

/** GET /by-username/:username */
export const byUsernameBody = z.strictObject({
  chat: z.strictObject({
    id: z.string(),
    type: z.string(),
    title: z.string().nullable(),
    username: z.string().optional(),
    description: z.string().nullable(),
    avatarColor: z.string().optional(),
    avatarImage: z.string().optional(),
    isVerified: z.boolean(),
    subscribers: z.number(),
    isMember: z.boolean(),
    banned: z.boolean(),
    approveJoins: z.boolean(),
    requestPending: z.boolean(),
  }),
});

/** GET /invite/:code — описание чата по ссылке-приглашению. */
export const inviteInfoBody = z.strictObject({
  chat: z.strictObject({
    id: z.string(),
    type: z.string(),
    title: z.string().nullable(),
    description: z.string().optional(),
    avatarColor: z.string().optional(),
    avatarImage: z.string().optional(),
    isVerified: z.literal(true).optional(),
    memberCount: z.number(),
    alreadyMember: z.boolean(),
    banned: z.boolean(),
    approveJoins: z.boolean(),
    requestPending: z.boolean(),
  }),
});

/** POST /:id/invite */
export const inviteCreateBody = z.strictObject({ code: z.string().regex(/^[A-Za-z0-9_-]{22}$/), chat });

/** POST /invite/:code/join и POST /:id/join при approveJoins — заявка подана. */
export const invitePendingBody = z.strictObject({
  pending: z.literal(true),
  chat: z.strictObject({ id: z.string(), title: z.string().nullable(), type: z.string() }),
});
export const joinPendingBody = z.strictObject({ pending: z.literal(true) });

/** GET /:id/join-requests */
export const joinRequestsBody = z.strictObject({
  requests: z.array(z.strictObject({ chatId: z.string(), userId: z.string(), createdAt: isoDate, user: publicUser })),
});

/** POST /:id/join-requests/:userId */
export const joinDecisionBody = z.strictObject({ ok: z.literal(true), approved: z.boolean(), chat: chat.optional() });

/** GET /:id/banned */
export const bannedBody = z.strictObject({ users: z.array(publicUser) });

/** GET /:id/admin-log */
export const adminLogBody = z.strictObject({
  entries: z.array(
    z.strictObject({
      id: z.number(),
      actorId: z.string(),
      action: z.string(),
      targetId: z.string().optional(),
      details: anyJson.optional(),
      createdAt: isoDate,
    })
  ),
  users: z.array(publicUser),
});

/** GET /:id/typing */
export const typingBody = z.strictObject({ typingUserId: z.string().nullable(), typingAction: z.string().nullable() });

export const slowModeBody = z.strictObject({ chat, slowModeSeconds: z.number() });
export const commentPriceBody = z.strictObject({ chat, commentPriceStars: z.number() });
export const welcomeBody = z.strictObject({ chat, welcomeText: z.string() });
export const protectBody = z.strictObject({ chat, protectedBy: z.array(z.string()) });
export const discussionBody = z.strictObject({ chat, discussion: chat.nullable() });
export const readBody = z.strictObject({ ok: z.literal(true), count: z.number() });
export const leaveBody = z.strictObject({ ok: z.literal(true), deleted: z.boolean() });
export const pinnedOrderBody = z.strictObject({ ok: z.literal(true), pinnedOrder: z.array(z.string()) });
/** POST /:id/wallpaper без forEveryone — личные настройки пользователя целиком. */
export const wallpaperPersonalBody = z.strictObject({ settings: z.looseObject({ chatWallpapers: z.record(z.string(), anyJson) }) });

/** Папка (rowToFolder, server/data/folders.js). */
export const folder = z.strictObject({
  id: z.string(),
  ownerId: z.string(),
  name: z.string(),
  order: z.number(),
  chatIds: z.array(z.string()),
  inviteCode: z.string().optional(),
});

/** GET /api/bootstrap — всё, что нужно клиенту для первого экрана. */
export const bootstrapBody = z.strictObject({
  settings: z.looseObject({
    theme: z.string(),
    notifications: z.looseObject({ mutedChats: z.record(z.string(), anyJson) }),
    privacy: z.looseObject({}),
    drafts: z.record(z.string(), z.string()),
    chatClears: z.record(z.string(), z.string()),
    hiddenChats: z.record(z.string(), z.string()),
    chatWallpapers: z.record(z.string(), anyJson),
  }),
  chats: z.array(chatSummary),
  folders: z.array(folder),
  contactIds: z.array(z.string()),
});

/** Раньше здесь были временные расширения; теперь это общие viewerUser / chatSummary. */
export const contactAwareUser = viewerUser;
export const chatSummaryWithContacts = chatSummary;
