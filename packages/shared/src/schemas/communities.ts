// Сообщества (server/routes/communities.js поверх server/data/communities.js).
// Все поля view()/chatCard() отдаются всегда — пустые значения приходят как null,
// поэтому опциональных полей здесь почти нет.
import { z } from "zod";
import { genId, isoDate } from "./common";
import { publicUser } from "./user";

export const communityRights = z.strictObject({
  editInfo: z.boolean(),
  editChats: z.boolean(),
  ban: z.boolean(),
  addAdmins: z.boolean(),
});

export const communityRole = z.enum(["owner", "admin", "member"]);
export const addPolicy = z.enum(["add", "suggest"]);
export const addMode = z.enum(["all", "admins"]);

/** chatCard() — чат в списке сообщества. */
export const communityChat = z.strictObject({
  id: z.string(),
  type: z.enum(["group", "channel"]),
  title: z.string().nullable(),
  username: z.string().nullable(),
  avatarColor: z.string().nullable(),
  avatarImage: z.string().nullable(),
  isPublic: z.boolean(),
  approveJoins: z.boolean(),
  members: z.number(),
  isMember: z.boolean(),
  isChatAdmin: z.boolean(),
  visible: z.boolean(),
  addedBy: z.string().nullable(),
});

/** view() — сообщество глазами пользователя. */
export const community = z.strictObject({
  id: genId("cm"),
  title: z.string(),
  description: z.string().nullable(),
  avatarColor: z.string().nullable(),
  avatarImage: z.string().nullable(),
  addMode,
  role: communityRole.nullable(),
  isOwner: z.boolean(),
  isMember: z.boolean(),
  isBanned: z.boolean(),
  rights: communityRights,
  addPolicy: addPolicy.nullable(),
  pinned: z.boolean(),
  collapsed: z.boolean(),
  chats: z.array(communityChat),
  /** Нет видимого публичного чата: вступить можно только по приглашению в чат. */
  isClosed: z.boolean(),
  /** null — посторонний смотрит закрытое сообщество. */
  membersCount: z.number().nullable(),
  adminsCount: z.number().nullable(),
  bannedCount: z.number(),
  requestsCount: z.number(),
});

/** { community } — создание, карточка, правка, вступление, prefs, чаты. */
export const communityBody = z.strictObject({ community });

/** POST /:id/chats при addPolicy «suggest» — заявка подана. */
export const communityRequestedBody = z.strictObject({ requested: z.literal(true), community });

/** GET /mine */
export const mineBody = z.strictObject({
  communities: z.array(
    z.strictObject({
      id: z.string(),
      title: z.string(),
      avatarColor: z.string().nullable(),
      avatarImage: z.string().nullable(),
      chatCount: z.number(),
      addPolicy,
    })
  ),
});

/** GET /joined */
export const joinedBody = z.strictObject({
  communities: z.array(
    z.strictObject({
      id: z.string(),
      title: z.string(),
      description: z.string().nullable(),
      avatarColor: z.string().nullable(),
      avatarImage: z.string().nullable(),
      role: communityRole.nullable(),
      isOwner: z.boolean(),
      rights: communityRights,
      addMode,
      pinned: z.boolean(),
      collapsed: z.boolean(),
      chatIds: z.array(z.string()),
      requestsCount: z.number(),
    })
  ),
});

/** GET /by-chat/:chatId */
export const byChatBody = z.strictObject({
  community: z
    .strictObject({
      id: z.string(),
      title: z.string(),
      avatarColor: z.string().nullable(),
      avatarImage: z.string().nullable(),
      isOwner: z.boolean(),
      isMember: z.boolean(),
      canRemoveChat: z.boolean(),
    })
    .nullable(),
});

/** GET /:id/members */
export const membersBody = z.strictObject({ users: z.array(publicUser.extend({ role: communityRole })) });

/** GET /:id/admins */
export const adminsBody = z.strictObject({
  admins: z.array(publicUser.extend({ role: z.enum(["owner", "admin"]), rights: communityRights, badge: z.string().nullable(), title: z.string().nullable() })),
});

/** GET /:id/bans */
export const bansBody = z.strictObject({ users: z.array(publicUser.extend({ bannedAt: isoDate })) });

/** GET /:id/bans/:userId/preview */
export const banPreviewBody = z.strictObject({
  chats: z.array(z.strictObject({ id: z.string(), title: z.string().nullable() })),
});

/** PUT /:id/bans/:userId */
export const banResultBody = z.strictObject({ ok: z.literal(true), removedChats: z.number() });

/** GET /:id/requests — rowToRequest, где suggestedBy заменён карточкой пользователя. */
export const requestsBody = z.strictObject({
  requests: z.array(
    z.strictObject({
      id: genId("cr"),
      communityId: z.string(),
      chatId: z.string(),
      suggestedBy: publicUser.nullable(),
      visible: z.boolean(),
      createdAt: isoDate,
      chat: communityChat,
    })
  ),
});

/** POST /:id/requests/:requestId */
export const resolveBody = z.strictObject({ added: z.number(), declined: z.number(), community });
