import { route, jsonBody, HttpError } from "@/lib/server/http";
import { all, get, run, now } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";
import { userLite } from "@/lib/server/queries";

export const GET = route(async () => {
  await requireUser();
  const rows = all<{ id: number; title: string; description: string; host_id: number; uid: number; username: string; name: string; avatar: string | null; verified: number; viewer_count: number; created_at: number }>(
    `SELECT s.id, s.title, s.description, s.host_id, u.id AS uid, u.username, u.name, u.avatar, u.verified,
      (SELECT COUNT(*) FROM live_viewers v WHERE v.stream_id = s.id) AS viewer_count, s.created_at
     FROM live_streams s JOIN users u ON u.id = s.host_id WHERE s.status = 'live' ORDER BY s.created_at DESC`,
  );
  return { streams: rows.map((r) => ({ id: r.id, title: r.title, description: r.description, host: userLite(r), viewerCount: r.viewer_count, createdAt: r.created_at })) };
});

export const POST = route(async (req) => {
  const me = await requireUser();
  const body = await jsonBody<{ title?: string; description?: string; action?: string; streamId?: number }>(req);
  if (body.action === "end") {
    const id = Number(body.streamId);
    const stream = get<{ host_id: number }>("SELECT host_id FROM live_streams WHERE id = ? AND status = 'live'", id);
    if (!stream || stream.host_id !== me.id) throw new HttpError(404, "Live stream not found.");
    run("UPDATE live_streams SET status = 'ended', ended_at = ? WHERE id = ?", now(), id);
    return { ok: true };
  }
  const title = String(body.title ?? "").trim().slice(0, 120);
  if (!title) throw new HttpError(400, "Live title is required.");
  const active = get<{ id: number }>("SELECT id FROM live_streams WHERE host_id = ? AND status = 'live'", me.id);
  if (active) throw new HttpError(409, "You already have a live stream.");
  const created = run("INSERT INTO live_streams (host_id, title, description, created_at) VALUES (?, ?, ?, ?)", me.id, title, String(body.description ?? "").trim().slice(0, 500), now());
  run("INSERT OR REPLACE INTO live_viewers (stream_id, user_id, joined_at, last_seen_at) VALUES (?, ?, ?, ?)", created.id, me.id, now(), now());
  return { id: created.id };
});
