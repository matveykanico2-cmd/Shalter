import { route, jsonBody, HttpError } from "@/lib/server/http";
import { get } from "@/lib/server/db";
import { startSession, verifyPassword } from "@/lib/server/auth";

export const POST = route(async (req) => {
  const body = await jsonBody<{ login: string; password: string }>(req);
  const login = String(body.login ?? "").trim();
  const user = get<{ id: number; password_hash: string }>(
    "SELECT id, password_hash FROM users WHERE username = ? OR email = ? OR phone = ?",
    login,
    login,
    login,
  );
  if (!user)
    throw new HttpError(401, "The username you entered doesn't belong to an account. Please check your username and try again.");
  if (!verifyPassword(String(body.password ?? ""), user.password_hash))
    throw new HttpError(401, "Sorry, your password was incorrect. Please double-check your password.");
  await startSession(user.id);
  return { ok: true };
});
