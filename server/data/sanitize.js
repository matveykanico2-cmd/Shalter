const { ADMIN_PHONE, isAdminPhone } = require("../config");
const { isPrimaryAdmin } = require("../lib/adminAccess");
const { SYSTEM_BOT_ID } = require("./systemBot");

function publicUser(user) {
  const rest = { ...user };
  delete rest.passwordHash;
  delete rest.passwordSalt;
  delete rest.banReason;
  delete rest.bannedAt;
  delete rest.totpSecret;
  delete rest.totpRecoveryCodes;
  delete rest.cloudPasswordHash;
  delete rest.cloudPasswordSalt;
  delete rest.cloudPasswordHint;
  delete rest.email;
  delete rest.stars;
  delete rest.blockedUserIds;
  delete rest.referralCode;
  // Номер скрыт по умолчанию: показывать его можно только с учётом настройки
  // приватности, а это знает лишь маршрут, который знает, кто смотрит.
  delete rest.phone;
  delete rest.adminSections;
  delete rest.referredBy;
  // Цвет имени — возможность Premium: после окончания подписки не показывается.
  if (!user.isPremium) delete rest.nameColor;
  rest.isDeveloper = isAdminPhone(user.phone) || undefined;
  rest.isVerified = user.isVerified ?? (isAdminPhone(user.phone) || undefined);
  rest.isServiceBot = user.id === SYSTEM_BOT_ID || undefined;
  return rest;
}

function selfUser(user) {
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

function publicUsers(users) {
  return users.map(publicUser);
}

module.exports = { publicUser, selfUser, publicUsers };
