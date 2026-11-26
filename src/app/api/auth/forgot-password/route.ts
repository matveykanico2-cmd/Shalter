import crypto from "node:crypto";
import { route, jsonBody, HttpError } from "@/lib/server/http";
import { get, run, now } from "@/lib/server/db";

export const POST = route(async (req) => {
  const body = await jsonBody<{ email?: string; phone?: string }>(req);
  const email = String(body.email ?? "").trim().toLowerCase();
  const phone = String(body.phone ?? "").trim();
  if (!email || !phone) throw new HttpError(400, "Enter both email and phone number.");
  const user = get<{ id: number }>("SELECT id FROM users WHERE lower(email) = ? AND phone = ?", email, phone);
  if (!user) throw new HttpError(400, "Email and phone number do not match.");
  const raw = crypto.randomBytes(32).toString("hex");
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  run("INSERT INTO email_tokens (user_id, token_hash, kind, expires_at, created_at) VALUES (?, ?, 'reset', ?, ?)", user.id, hash, now() + 30 * 60 * 1000, now());
  return { ok: true, resetToken: raw };
});
