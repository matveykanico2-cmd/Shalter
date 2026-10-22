// Особые аккаунты. Админы определяются по номеру телефона из окружения — как в server/config.js и
// server/lib/adminAccess.js (PREMIUM_ADMIN_PHONE — главный, PREMIUM_ADMIN_PHONES — остальные).
export const ADMIN_PHONE = process.env.PREMIUM_ADMIN_PHONE || "";

const EXTRA_ADMIN_PHONES = (process.env.PREMIUM_ADMIN_PHONES || "")
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);
export const ADMIN_PHONES = [...new Set([ADMIN_PHONE, ...EXTRA_ADMIN_PHONES])];

export function isAdminPhone(phone: string | null | undefined): boolean {
  return !!phone && ADMIN_PHONES.includes(phone);
}

export function isPrimaryAdmin(phone: string | null | undefined): boolean {
  return !!ADMIN_PHONE && phone === ADMIN_PHONE;
}

// Дней Premium за приглашение друга — обоим (server/config.js).
export const PREMIUM_GRANT_DAYS = 30;

// Служебный бот «Shalter»: коды входа и оповещения о безопасности (server/data/systemBot.js
// создаёт его при старте).
export const SYSTEM_BOT_ID = "bot_shalter";

// Служебный помощник и Хьюго (server/data/helperBot.js, hugoBot.js), Shalter AI (shalterAiBot.js).
export const HELPER_BOT_ID = "bot_helper";

/** Разделы админки, которые главный админ выдаёт другим (server/lib/adminAccess.js). */
export const ADMIN_SECTIONS = ["moderation", "server", "giftshop", "emojicatalog", "donations", "pricing", "legal"];
