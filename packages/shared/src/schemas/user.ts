// Пользователь в ответах API: publicUser и selfUser (server/data/sanitize.js)
// поверх rowToUser (server/data/users.js).
import { z } from "zod";
import { anyJson, genId, isoDate } from "./common";

const publicUserShape = {
  id: genId("u").or(z.string()), // системные боты имеют фиксированные id
  name: z.string(),
  lastName: z.string().optional(),
  username: z.string().nullable(),
  avatarColor: z.string().optional(),
  avatarImage: z.string().optional(),
  avatarImages: z.array(anyJson),
  bio: z.string().nullable(),
  online: z.boolean(),
  lastSeen: isoDate.optional(),
  isBot: z.literal(true).optional(),
  isGuest: z.literal(true).optional(),
  isPremium: z.boolean(),
  premiumUntil: isoDate.optional(),
  premiumForever: z.literal(true).optional(),
  isAdsActive: z.boolean(),
  adsUntil: isoDate.optional(),
  adsForever: z.literal(true).optional(),
  adText: z.string().optional(),
  adUrl: z.string().optional(),
  isBusiness: z.boolean(),
  businessUntil: isoDate.optional(),
  businessForever: z.literal(true).optional(),
  businessAddress: z.string().optional(),
  businessLat: z.number().optional(),
  businessLng: z.number().optional(),
  nameColor: z.string().optional(),
  profileBanner: anyJson.optional(),
  adAttachments: z.array(anyJson),
  birthday: z.string().optional(),
  giftsReceived: z.array(anyJson),
  isBanned: z.boolean(),
  messagePriceStars: z.number(),
  statusIcon: z.string().nullable(),
  statusName: z.string().nullable(),
  profileTrack: anyJson.nullable(),
  profileTracks: z.array(anyJson),
  safetyLabel: z.string().optional(),
  safetyLabelAt: isoDate.optional(),
  isVerified: z.literal(true).optional(),
  usernameAuctionId: z.string().optional(),
  isCollectibleUsername: z.literal(true).optional(),
  totpEnabledAt: isoDate.optional(),
  twoFactorMethod: z.enum(["totp", "chat", "password"]),
  twoFactorEnabled: z.boolean(),
  isDeveloper: z.literal(true).optional(),
  isServiceBot: z.literal(true).optional(),
  // Телефон в публичном профиле — только когда приватность разрешает (routes/users.js).
  phone: z.string().optional(),
};

export const publicUser = z.strictObject(publicUserShape);

/**
 * Пользователь «глазами смотрящего» — publicUserFor (server/lib/privacyRules.js):
 * поля контакта (applyContactName) и скрытие по приватности. Так отдаются
 * собеседник в списке чатов, участники чата, отправители в превью.
 */
export const viewerUser = z.strictObject({
  ...publicUserShape,
  bio: publicUserShape.bio.optional(),
  avatarImages: publicUserShape.avatarImages.optional(),
  inContacts: z.literal(true).optional(),
  mutualContact: z.literal(true).optional(),
  profileName: z.string().optional(),
});

export const selfUser = z.strictObject({
  ...publicUserShape,
  phone: z.string(),
  email: z.string().optional(),
  blockedUserIds: z.array(z.string()),
  referralCode: z.string().optional(),
  adminSections: z.array(z.string()),
  isPrimaryAdmin: z.literal(true).optional(),
});

export type PublicUser = z.infer<typeof publicUser>;
export type SelfUser = z.infer<typeof selfUser>;
