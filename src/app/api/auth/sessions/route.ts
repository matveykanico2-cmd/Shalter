import { cookies } from "next/headers";
import { route, HttpError } from "@/lib/server/http";
import { all, run } from "@/lib/server/db";
import { requireUser, SESSION_COOKIE } from "@/lib/server/auth";

export const GET = route(async () => {
  const me = await requireUser();
  const current = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
  return { sessions: all<{ token: string; created_at: number }>("SELECT token, created_at FROM sessions WHERE user_id = ? ORDER BY created_at DESC", me.id).map((session, index) => ({ id: String(index), current: session.token === current, createdAt: session.created_at })) };
});

export const DELETE = route(async () => {
  const me = await requireUser();
  const current = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!current) throw new HttpError(401, "You need to log in.");
  run("DELETE FROM sessions WHERE user_id = ? AND token != ?", me.id, current);
  return { ok: true };
});
