import { HELPER_BOT_ID, isAdminPhone, SYSTEM_BOT_ID } from "../../../common/config/accounts.js";
import { HUGO_ID, SHALTER_AI_ID } from "../../../legacy/legacy.js";
import type { User } from "../../users/model/domain.js";

// Пользователь в карточках админки (userLabel в server/routes/admin.js).
export function userLabel(u: User | undefined, fallbackId?: string) {
  if (!u) return { id: fallbackId, name: "(удалённый аккаунт)" };
  return {
    id: u.id,
    name: u.name,
    username: u.username || null,
    phone: u.phone || null,
    email: u.email || null,
    safetyLabel: u.safetyLabel || null,
    isBanned: !!u.isBanned,
    // Карточка в «Модерации» по нему выбирает «Верифицировать» / «Снять галочку».
    isVerified: !!u.isVerified,
    isPremium: !!u.isPremium,
    premiumUntil: u.premiumUntil || null,
    premiumForever: !!u.premiumForever,
    isBusiness: !!u.isBusiness,
    businessUntil: u.businessUntil || null,
    businessForever: !!u.businessForever,
    isAdsActive: !!u.isAdsActive,
    adsUntil: u.adsUntil || null,
    adsForever: !!u.adsForever,
    adminSections: u.adminSections ?? [],
    isDeveloper: !!u.developer || isAdminPhone(u.phone) || undefined,
  };
}

/** Карточка с полями блокировки. */
export const bannedLabel = (u: User) => ({ ...userLabel(u), bannedAt: u.bannedAt || null, banReason: u.banReason || null, bannedUntil: u.bannedUntil || null });

// Служебные аккаунты Shalter (isServiceAccount в server/lib/moderationDelete.js): префикс «bot_»
// тут не годится, его носят и боты пользователей.
const SERVICE_ACCOUNT_IDS = new Set([SYSTEM_BOT_ID, HELPER_BOT_ID, HUGO_ID, SHALTER_AI_ID]);
export const isServiceAccount = (id: string): boolean => SERVICE_ACCOUNT_IDS.has(id);
