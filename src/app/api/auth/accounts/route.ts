import { route, jsonBody, HttpError } from "@/lib/server/http";
import { connectedAccounts, requireUser, startSession, switchSession, verifyPassword } from "@/lib/server/auth";
import { get } from "@/lib/server/db";

export const GET = route(async () => {
  await requireUser();
  return { accounts: await connectedAccounts() };
});

export const POST = route(async (req) => {
  const body = await jsonBody<{ action?: string; userId?: number; login?: string; password?: string }>(req);
  if (body.action === "switch") {
    await switchSession(Number(body.userId));
    return { ok: true };
  }
  const login = String(body.login ?? "").trim();
  const user = get<{ id: number; password_hash: string }>("SELECT id, password_hash FROM users WHERE username = ? OR email = ? OR phone = ?", login, login, login);
  if (!user || !verifyPassword(String(body.password ?? ""), user.password_hash)) throw new HttpError(401, "Incorrect account credentials.");
  await startSession(user.id);
  return { ok: true };
});
