import { isAdminPhone, isPrimaryAdmin, SYSTEM_BOT_ID } from "../../../common/config/accounts.js";
import type { User } from "../model/domain.js";

// Пользователь для чужих глаз и для самого себя — как publicUser и selfUser в
// server/data/sanitize.js.

export function publicUser(user: User) {
  const {
    passwordHash,
    passwordSalt,
    banReason,
    bannedAt,
    bannedUntil,
    totpSecret,
    totpRecoveryCodes,
    cloudPasswordHash,
    cloudPasswordSalt,
    cloudPasswordHint,
    email,
    stars,
    blockedUserIds,
    referralCode,
    // Номер скрыт по умолчанию: показывать его можно только с учётом настройки
    // приватности, а это знает лишь маршрут, который знает, кто смотрит.
    phone,
    adminSections,
    referredBy,
    developer,
    scheduledDeletionAt,
    nameColor,
    ...rest
  } = user;
  return {
    ...rest,
    // Цвет имени — возможность Premium: после окончания подписки не показывается.
    ...(user.isPremium ? { nameColor } : {}),
    isDeveloper: !!user.developer || isAdminPhone(user.phone) || undefined,
    isVerified: user.isVerified ?? (isAdminPhone(user.phone) || undefined),
    isServiceBot: user.id === SYSTEM_BOT_ID || undefined,
    // Анонимный подарок на полке не выдаёт отправителя (fromId остаётся только в базе).
    giftsReceived: Array.isArray(user.giftsReceived)
      ? user.giftsReceived.map((g) => (g?.anon && g.fromId ? { ...g, fromId: null } : g))
      : user.giftsReceived,
    // Боты «в сети» всегда — вместо зелёной точки у бота и так пишется «бот».
    ...(user.isBot ? { online: false, lastSeen: undefined } : {}),
  };
}

export function selfUser(user: User) {
  return {
    ...publicUser(user),
    phone: user.phone,
    email: user.email ?? undefined,
    blockedUserIds: user.blockedUserIds ?? [],
    referralCode: user.referralCode ?? undefined,
    adminSections: user.adminSections ?? [],
    isPrimaryAdmin: isPrimaryAdmin(user.phone) || undefined,
  };
}
