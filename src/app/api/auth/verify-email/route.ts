import crypto from "node:crypto";
import { route, jsonBody, HttpError } from "@/lib/server/http";
import { get, run, now } from "@/lib/server/db";

export const POST = route(async (req) => {
  const body = await jsonBody<{ token?: string }>(req);
  const raw = String(body.token ?? "");
  if (raw) {
    const hash = crypto.createHash("sha256").update(raw).digest("hex");
    const row = get<{ id: number; user_id: number; expires_at: number }>("SELECT id, user_id, expires_at FROM email_tokens WHERE token_hash = ? AND kind = 'verify' AND used_at IS NULL", hash);
    if (!row || row.expires_at < now()) throw new HttpError(400, "This verification link has expired.");
    run("UPDATE users SET email_verified_at = ? WHERE id = ?", now(), row.user_id);
    run("UPDATE email_tokens SET used_at = ? WHERE id = ?", now(), row.id);
    return { ok: true, verified: true };
  }
  return { ok: true, verificationDisabled: true };
});
