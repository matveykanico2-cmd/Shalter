import type { UserRow } from "../model/domain.js";

// Строка users → пользователь, поле в поле как rowToUser в server/data/users.js: оба
// бэкенда отдают одного и того же пользователя (user.mapper.spec.ts сверяет их).
// undefined — ключа нет в JSON-ответе.

export const FOREVER = "9999-01-01T00:00:00.000Z";

// Повреждённый JSON в колонке не валит запрос: подставляется запасное значение.
function safeParse<T>(val: string | null | undefined, fallback: T): T {
  if (val === null || val === undefined || val === "") return fallback;
  try {
    return JSON.parse(val) as T;
  } catch {
    return fallback;
  }
}

// Список аватарок (server/lib/avatars.js parseList).
function parseAvatarList(json: string | null): { url: string; [key: string]: unknown }[] {
  try {
    const list: unknown = JSON.parse(json || "[]");
    return Array.isArray(list) ? list.filter((e) => e && typeof e.url === "string") : [];
  } catch {
    return [];
  }
}

// Блокировка на срок снимается сама: после bannedUntil аккаунт снова обычный.
export function banActive(row: Pick<UserRow, "isBanned" | "bannedUntil">): boolean {
  if (!row.isBanned) return false;
  return !row.bannedUntil || row.bannedUntil > new Date().toISOString();
}

// Колонка хранит список треков (раньше — один объект). Первый — основной.
function profileTracksOf(raw: string | null): { profileTrack: unknown; profileTracks: unknown[] } {
  let parsed: unknown = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {}
  const list = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
  return { profileTrack: list[0] ?? null, profileTracks: list };
}

interface StatusItem {
  id?: string;
  image?: unknown;
  name?: string;
}

function activeStatus(row: UserRow): StatusItem | undefined {
  if (!row.activeStatusId) return undefined;
  const items = safeParse<StatusItem[]>(row.statusItems, []);
  return Array.isArray(items) ? items.find((i) => i.id === row.activeStatusId) : undefined;
}

export function toUser(row: UserRow) {
  const now = new Date().toISOString();
  const banned = banActive(row);
  const status = activeStatus(row);
  return {
    id: row.id,
    name: row.name,
    lastName: row.lastName ?? undefined,
    username: row.username,
    phone: row.phone,
    email: row.email ?? undefined,
    passwordHash: row.passwordHash ?? undefined,
    passwordSalt: row.passwordSalt ?? undefined,
    avatarColor: row.avatarColor ?? undefined,
    avatarImage: row.avatarImage ?? undefined,
    avatarImages: parseAvatarList(row.avatarImages),
    bio: row.bio,
    online: !!row.online,
    lastSeen: row.lastSeen ?? undefined,
    isBot: !!row.isBot || undefined,
    blockedUserIds: safeParse<string[]>(row.blockedUserIds, []),
    isPremium: !!row.premiumUntil && row.premiumUntil > now,
    premiumUntil: row.premiumUntil && row.premiumUntil !== FOREVER ? row.premiumUntil : undefined,
    premiumForever: row.premiumUntil === FOREVER || undefined,
    referralCode: row.referralCode ?? undefined,
    referredBy: row.referredBy ?? undefined,
    isAdsActive: !!row.adsUntil && row.adsUntil > now,
    adsUntil: row.adsUntil && row.adsUntil !== FOREVER ? row.adsUntil : undefined,
    adsForever: row.adsUntil === FOREVER || undefined,
    adText: row.adText ?? undefined,
    adUrl: row.adUrl ?? undefined,
    isBusiness: !!row.businessUntil && row.businessUntil > now,
    businessUntil: row.businessUntil && row.businessUntil !== FOREVER ? row.businessUntil : undefined,
    businessForever: row.businessUntil === FOREVER || undefined,
    businessAddress: row.businessAddress ?? undefined,
    businessLat: row.businessLat ?? undefined,
    businessLng: row.businessLng ?? undefined,
    nameColor: row.nameColor ?? undefined,
    profileBanner: safeParse<unknown>(row.profileBanner, undefined),
    adAttachments: safeParse<unknown[]>(row.adAttachments, []),
    birthday: row.birthday ?? undefined,
    giftsReceived: safeParse<GiftEntry[]>(row.giftsReceived, []),
    isBanned: banned,
    stars: row.stars ?? 0,
    messagePriceStars: row.messagePriceStars ?? 0,
    statusIcon: status?.image ?? null,
    statusName: status?.name || null,
    banReason: banned ? row.banReason ?? undefined : undefined,
    bannedAt: banned ? row.bannedAt ?? undefined : undefined,
    bannedUntil: banned ? row.bannedUntil ?? undefined : undefined,
    adminSections: safeParse<string[]>(row.adminSections, []),
    ...profileTracksOf(row.profileTrack),
    safetyLabel: row.safetyLabel ?? undefined,
    isVerified: !!row.isVerified || undefined,
    developer: !!row.developer || undefined,
    scheduledDeletionAt: row.scheduledDeletionAt ?? undefined,
    usernameAuctionId: row.usernameAuctionId ?? undefined,
    isCollectibleUsername: !!row.usernameAuctionId || undefined,
    safetyLabelAt: row.safetyLabelAt ?? undefined,
    totpSecret: row.totpSecret ?? undefined,
    totpEnabledAt: row.totpEnabledAt ?? undefined,
    totpRecoveryCodes: safeParse<string[]>(row.totpRecoveryCodes, []),
    twoFactorMethod: (row.twoFactorMethod ?? "totp") as TwoFactorMethod,
    twoFactorEnabled:
      row.twoFactorMethod === "password"
        ? !!(row.cloudPasswordHash && row.cloudPasswordSalt)
        : row.twoFactorMethod === "chat"
          ? !!row.totpEnabledAt
          : !!(row.totpSecret && row.totpEnabledAt),
    cloudPasswordHash: row.cloudPasswordHash ?? undefined,
    cloudPasswordSalt: row.cloudPasswordSalt ?? undefined,
    cloudPasswordHint: row.cloudPasswordHint ?? "",
  };
}

export type TwoFactorMethod = "totp" | "chat" | "password";

export interface GiftEntry {
  anon?: boolean;
  fromId?: string | null;
  [key: string]: unknown;
}
