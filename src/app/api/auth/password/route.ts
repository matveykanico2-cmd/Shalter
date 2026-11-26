import { route, jsonBody, HttpError } from "@/lib/server/http";
import { get, run } from "@/lib/server/db";
import { hashPassword, requireUser, verifyPassword } from "@/lib/server/auth";

export const POST = route(async (req) => {
  const me = await requireUser();
  const body = await jsonBody<{ currentPassword?: string; newPassword?: string }>(req);
  const currentPassword = String(body.currentPassword ?? "");
  const newPassword = String(body.newPassword ?? "");
  const stored = get<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = ?", me.id);
  if (!stored || !verifyPassword(currentPassword, stored.password_hash)) throw new HttpError(401, "Current password is incorrect.");
  if (newPassword.length < 8) throw new HttpError(400, "New password must be at least 8 characters.");
  if (newPassword === currentPassword) throw new HttpError(400, "Choose a different password.");
  run("UPDATE users SET password_hash = ? WHERE id = ?", hashPassword(newPassword), me.id);
  return { ok: true };
});
