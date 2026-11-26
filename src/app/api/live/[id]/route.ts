import { route, intParam, jsonBody, HttpError } from "@/lib/server/http";
import { all, get, run, now } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";
import { userLite } from "@/lib/server/queries";

type Ctx = { params: Promise<{ id: string }> };
export const GET = route(async (_req, { params }: Ctx) => {
  const me = await requireUser();
  const id = intParam((await params).id);
  const row = get<{ id: number; title: string; description: string; host_id: number; uid: number; username: string; name: string; avatar: string | null; verified: number; status: string; created_at: number }>(
    `SELECT s.id, s.title, s.description, s.host_id, u.id AS uid, u.username, u.name, u.avatar, u.verified, s.status, s.created_at FROM live_streams s JOIN users u ON u.id = s.host_id WHERE s.id = ?`, id,
  );
  if (!row) throw new HttpError(404, "Live stream not found.");
  const t = now();
  run("INSERT OR REPLACE INTO live_viewers (stream_id, user_id, joined_at, last_seen_at) VALUES (?, ?, COALESCE((SELECT joined_at FROM live_viewers WHERE stream_id = ? AND user_id = ?), ?), ?)", id, me.id, id, me.id, t, t);
  const viewers = all<{ uid: number; username: string; name: string; avatar: string | null; verified: number }>("SELECT u.id AS uid, u.username, u.name, u.avatar, u.verified FROM live_viewers v JOIN users u ON u.id = v.user_id WHERE v.stream_id = ? ORDER BY v.joined_at LIMIT 50", id);
  return { stream: { id: row.id, title: row.title, description: row.description, host: userLite(row), status: row.status, createdAt: row.created_at, viewerCount: viewers.length, viewers: viewers.map(userLite), isHost: row.host_id === me.id } };
});

export const PATCH = route(async (req, { params }: Ctx) => {
  const me = await requireUser();
  const id = intParam((await params).id);
  const body = await jsonBody<{ action?: string }>(req);
  if (body.action === "end") {
    const stream = get<{ host_id: number }>("SELECT host_id FROM live_streams WHERE id = ? AND status = 'live'", id);
    if (!stream || stream.host_id !== me.id) throw new HttpError(403, "Only the host can end this stream.");
    run("UPDATE live_streams SET status = 'ended', ended_at = ? WHERE id = ?", now(), id);
  }
  if (body.action === "leave") run("DELETE FROM live_viewers WHERE stream_id = ? AND user_id = ?", id, me.id);
  return { ok: true };
});
