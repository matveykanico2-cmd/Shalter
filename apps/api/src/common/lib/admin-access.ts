import { isAdminPhone, isPrimaryAdmin } from "../config/accounts.js";

// Разделы админки, доступные пользователю (server/lib/adminAccess.js): админ по номеру
// видит все, остальные — выданные ему в adminSections.
export function hasAdminSection(user: { phone?: string | null; adminSections?: string[] } | undefined, section: string): boolean {
  if (!user) return false;
  if (isAdminPhone(user.phone)) return true;
  return (user.adminSections ?? []).includes(section);
}

/**
 * Старше ли me цели target (outranks в server/lib/adminAccess.js): главный админ — всех, кроме
 * себя; админ по номеру — тех, у кого только выданные разделы; остальным — только обычных.
 */
export function outranks(me: { phone?: string | null } | undefined, target: { phone?: string | null; adminSections?: string[] }): boolean {
  if (isPrimaryAdmin(me?.phone)) return !isPrimaryAdmin(target.phone);
  if (isAdminPhone(target.phone)) return false;
  if ((target.adminSections ?? []).length) return isAdminPhone(me?.phone);
  return true;
}
