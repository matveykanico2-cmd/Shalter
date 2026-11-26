import "server-only";
import { requireUser, type UserRow } from "./auth";
import { HttpError } from "./http";

export const ADMIN_PHONE = process.env.SNAPGRAM_ADMIN_PHONE ?? "+797819827502";

function normalizePhone(phone: string | null | undefined) {
  return (phone ?? "").replace(/[\s()-]/g, "");
}

export function isAdmin(user: Pick<UserRow, "phone">) {
  return normalizePhone(user.phone) === normalizePhone(ADMIN_PHONE);
}

export async function requireAdmin() {
  const user = await requireUser();
  if (!isAdmin(user)) throw new HttpError(403, "Admin access is required.");
  return user;
}
