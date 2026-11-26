import crypto from "node:crypto";
import { route, jsonBody, HttpError } from "@/lib/server/http";
import { get, run, now } from "@/lib/server/db";
import { hashPassword } from "@/lib/server/auth";

export const POST = route(async (req) => {
  const body = await jsonBody<{ token?: string; password?: string }>(req);
  const token = String(body.token ?? "");
  const password = String(body.password ?? "");
  if (token.length < 32 || password.length < 8) throw new HttpError(400, "Invalid reset request.");
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  const row = get<{ id: number; user_id: number; expires_at: number }>("SELECT id, user_id, expires_at FROM email_tokens WHERE token_hash = ? AND kind = 'reset' AND used_at IS NULL", hash);
  if (!row || row.expires_at < now()) throw new HttpError(400, "This reset link has expired.");
  run("UPDATE users SET password_hash = ? WHERE id = ?", hashPassword(password), row.user_id);
  run("UPDATE email_tokens SET used_at = ? WHERE id = ?", now(), row.id);
  return { ok: true };
});
