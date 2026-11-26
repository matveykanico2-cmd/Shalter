import { route, intParam, jsonBody, HttpError } from "@/lib/server/http";
import { all, get, run } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";
import { userIdByUsername } from "@/lib/server/users";
import { userLite } from "@/lib/server/queries";

type Ctx = { params: Promise<{ id: string }> };

function canManage(conversationId: number, userId: number) {
  const row = get<{ kind: string; owner_id: number | null }>("SELECT kind, owner_id FROM conversations WHERE id = ?", conversationId);
  const member = get<{ role: string }>("SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?", conversationId, userId);
  if (!row || !member) throw new HttpError(404, "Conversation not found.");
  if (row.owner_id === userId || member.role === "owner" || member.role === "admin") return row;
  throw new HttpError(403, "Only chat moderators can manage members.");
}

export const GET = route(async (_req, { params }: Ctx) => {
  const me = await requireUser();
  const id = intParam((await params).id);
  if (!get("SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?", id, me.id)) throw new HttpError(404, "Conversation not found.");
  const members = all<{ uid: number; username: string; name: string; avatar: string | null; verified: number; role: string; last_read_id: number }>(
    `SELECT u.id AS uid, u.username, u.name, u.avatar, u.verified, cm.role, cm.last_read_id
     FROM conversation_members cm JOIN users u ON u.id = cm.user_id WHERE cm.conversation_id = ? ORDER BY cm.role = 'owner' DESC, cm.role = 'admin' DESC, u.username`, id,
  );
  return { members: members.map((member) => ({ ...userLite(member), role: member.role, lastReadId: member.last_read_id })) };
});

export const POST = route(async (req, { params }: Ctx) => {
  const me = await requireUser();
  const id = intParam((await params).id);
  canManage(id, me.id);
  const body = await jsonBody<{ usernames?: string[]; username?: string }>(req);
  const names = [...(Array.isArray(body.usernames) ? body.usernames : []), body.username ?? ""].map((value) => String(value).trim()).filter(Boolean);
  if (!names.length) throw new HttpError(400, "Choose at least one user.");
  const added: number[] = [];
  for (const username of names) {
    const userId = userIdByUsername(username);
    if (!get("SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?", id, userId)) {
      run("INSERT INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, 'member')", id, userId);
      added.push(userId);
    }
  }
  return { added };
});

export const PATCH = route(async (req, { params }: Ctx) => {
  const me = await requireUser();
  const id = intParam((await params).id);
  canManage(id, me.id);
  const body = await jsonBody<{ userId?: number; role?: string }>(req);
  const userId = Number(body.userId);
  const role = String(body.role ?? "member");
  if (!Number.isInteger(userId) || !["admin", "member"].includes(role)) throw new HttpError(400, "Invalid member role.");
  if (!get("SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?", id, userId)) throw new HttpError(404, "Member not found.");
  run("UPDATE conversation_members SET role = ? WHERE conversation_id = ? AND user_id = ? AND role != 'owner'", role, id, userId);
  return { ok: true };
});

export const DELETE = route(async (req, { params }: Ctx) => {
  const me = await requireUser();
  const id = intParam((await params).id);
  canManage(id, me.id);
  const userId = Number(new URL(req.url).searchParams.get("userId"));
  if (!Number.isInteger(userId)) throw new HttpError(400, "Invalid member.");
  run("DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ? AND role != 'owner'", id, userId);
  return { ok: true };
});
