import { isAdminPhone } from "../config/accounts.js";

// Разделы админки, доступные пользователю (server/lib/adminAccess.js): админ по номеру
// видит все, остальные — выданные ему в adminSections.
export function hasAdminSection(user: { phone?: string | null; adminSections?: string[] } | undefined, section: string): boolean {
  if (!user) return false;
  if (isAdminPhone(user.phone)) return true;
  return (user.adminSections ?? []).includes(section);
}
