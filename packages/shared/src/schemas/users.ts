// Профили пользователей: server/routes/users.js (/api/users) поверх publicUser /
// selfUser (server/data/sanitize.js) и publicUserFor (server/lib/privacyRules.js).
import { z } from "zod";
import { anyJson, genId, isoDate } from "./common";
import { publicUser, selfUser, viewerUser } from "./user";

/** Элемент avatarImages: lib/avatars.js validateEntry (и PATCH avatarImage — url = poster). */
export const avatarEntry = z.strictObject({
  url: z.string(),
  kind: z.enum(["image", "video"]),
  poster: z.string().regex(/^data:image\/(png|jpeg|webp);base64,/),
});

/** Часы работы — только у бизнес-аккаунта с включённым показом (routes/users.js GET /:id). */
const businessHours = z.strictObject({
  hours: z.record(z.string(), z.strictObject({ closed: z.boolean(), open: z.string(), close: z.string() })),
  timeZone: z.string().nullable(),
  status: anyJson,
});

const profileExtras = {
  businessHours: businessHours.optional(),
  // Только у ботов: сколько людей с ним в чатах (data/bots.js countBotAudience).
  botUserCount: z.number().int().nonnegative().optional(),
};

/** Свой профиль в GET /api/users/:id — selfUser. */
export const ownProfileUser = selfUser.extend(profileExtras);

/**
 * Чужой профиль в GET /api/users/:id: publicUser, из которого приватность убирает
 * поля целиком, + телефон, когда разрешено, + пометки контакта (applyContactName).
 */
export const otherProfileUser = viewerUser.extend(profileExtras);

/** Карточка канала в профиле владельца (routes/users.js channelCard). */
export const channelCard = z.strictObject({
  id: genId("c"),
  title: z.string(),
  username: z.string().nullable(),
  avatarColor: z.string().nullable(),
  avatarImage: z.string().nullable(),
  isVerified: z.boolean(),
  members: z.number().int().nonnegative(),
  isMember: z.boolean(),
});

const profileBodyShape = {
  isContact: z.boolean(),
  inContacts: z.boolean(),
  contactName: z.string().nullable(),
  contactNote: z.string().nullable(),
  commonGroupsCount: z.number().int().nonnegative(),
  pinnedChannels: z.array(channelCard),
};

export const ownProfileBody = z.strictObject({ user: ownProfileUser, ...profileBodyShape });
export const otherProfileBody = z.strictObject({ user: otherProfileUser, ...profileBodyShape });

/** GET /api/users/by-username/:username — publicUserFor; свой — с isSelf. */
export const byUsernameBody = z.strictObject({ user: viewerUser.extend({ isSelf: z.literal(true).optional() }) });

/** GET /api/users/blocked — publicUsersFor. */
export const blockedListBody = z.strictObject({ users: z.array(viewerUser) });

/**
 * POST /api/users/:id/block — publicUserFor(того, КТО блокирует) (data/users.js
 * setBlocked возвращает свою строку) — то есть publicUser самого себя.
 */
export const blockBody = z.strictObject({ user: publicUser.nullable() });

/** PATCH /api/users/:id — selfUser. */
export const patchProfileBody = z.strictObject({ user: selfUser.nullable() });

export const pinnableChannelsBody = z.strictObject({ channels: z.array(channelCard), max: z.literal(6) });
export const pinnedChannelsBody = z.strictObject({ pinnedChannels: z.array(channelCard) });

export const commonChatsBody = z.strictObject({
  chats: z.array(
    z.strictObject({
      id: genId("c"),
      title: z.string(),
      avatarColor: z.string().nullable(),
      avatarImage: z.string().nullable(),
      members: z.number().int().nonnegative(),
    })
  ),
});

const mediaItem = z.strictObject({
  messageId: genId("m"),
  createdAt: isoDate,
  senderId: z.string(),
  attachment: z.looseObject({ kind: z.string() }),
});

/** GET /api/users/:id/shared-media — вложения и ссылки личного чата с этим человеком. */
export const sharedMediaBody = z.strictObject({
  chatId: genId("c").nullable(),
  media: z.array(mediaItem),
  files: z.array(mediaItem),
  links: z.array(
    z.strictObject({
      messageId: genId("m"),
      createdAt: isoDate,
      text: z.string(),
      linkPreview: anyJson.optional(),
    })
  ),
  voice: z.array(mediaItem),
});
