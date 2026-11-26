import { route, jsonBody, HttpError } from "@/lib/server/http";
import { all, get, run } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";
import { conversationChannel } from "@/lib/server/dm";
import { userLite } from "@/lib/server/queries";

export const GET = route(async () => {
  const me = await requireUser();
  const rows = all<{ id: number; title: string; owner_id: number; linked_conversation_id: number | null; uid: number; username: string; name: string; avatar: string | null; verified: number; member_count: number; joined: number; last_message: string | null; updated_at: number }>(
    `SELECT c.id, c.title, c.owner_id, c.linked_conversation_id, u.id AS uid, u.username, u.name, u.avatar, u.verified,
      (SELECT COUNT(*) FROM conversation_members cm2 WHERE cm2.conversation_id = c.id) AS member_count,
      EXISTS (SELECT 1 FROM conversation_members mine WHERE mine.conversation_id = c.id AND mine.user_id = ?) AS joined,
      (SELECT text FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_message,
      c.updated_at
     FROM conversations c JOIN users u ON u.id = c.owner_id
     WHERE c.kind = 'channel' ORDER BY c.updated_at DESC, c.id DESC`, me.id,
  );
  return { channels: rows.map((r) => ({ id: r.id, title: r.title, discussionId: r.linked_conversation_id, owner: userLite(r), memberCount: r.member_count, joined: !!r.joined, lastMessage: r.last_message, updatedAt: r.updated_at })) };
});

export const POST = route(async (req) => {
  const me = await requireUser();
  const body = await jsonBody<{ title?: string; action?: string; channelId?: number }>(req);
  if (body.action === "join" || body.action === "leave") {
    const id = Number(body.channelId);
    const channel = get<{ id: number; owner_id: number; kind: string }>("SELECT id, owner_id, kind FROM conversations WHERE id = ?", id);
    if (!channel || channel.kind !== "channel") throw new HttpError(404, "Channel not found.");
    if (body.action === "leave" && channel.owner_id === me.id) throw new HttpError(400, "The channel owner cannot leave it.");
    const existing = get("SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?", id, me.id);
    const linked = get<{ linked_conversation_id: number | null }>("SELECT linked_conversation_id FROM conversations WHERE id = ?", id)?.linked_conversation_id;
    if (body.action === "join" && !existing) run("INSERT INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, 'member')", id, me.id);
    if (body.action === "leave" && existing) run("DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?", id, me.id);
    if (linked && body.action === "join") run("INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, 'member')", linked, me.id);
    if (linked && body.action === "leave") run("DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?", linked, me.id);
    return { ok: true };
  }
  const title = String(body.title ?? "").trim();
  if (!title) throw new HttpError(400, "Channel name is required.");
  return { id: conversationChannel(me.id, title) };
});
