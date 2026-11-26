import { route, intParam, jsonBody, HttpError } from "@/lib/server/http";
import { all, get, now, run } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";
import { userLite } from "@/lib/server/queries";

function manage(id: number, userId: number) {
  const community = get<{ id: number; is_private: number; owner_id: number }>("SELECT id, is_private, owner_id FROM communities WHERE id = ?", id);
  if (!community) throw new HttpError(404, "Community not found.");
  const member = get<{ role: string }>("SELECT role FROM community_members WHERE community_id = ? AND user_id = ?", id, userId);
  if (!member || (community.owner_id !== userId && member.role !== "admin")) throw new HttpError(403, "Community moderation access is required.");
  return community;
}

export const GET = route(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser();
  const id = intParam((await params).id);
  const community = get<{ id: number; name: string; slug: string; description: string; birthday: string | null; owner_id: number; is_private: number }>("SELECT id, name, slug, description, birthday, owner_id, is_private FROM communities WHERE id = ?", id);
  if (!community) throw new HttpError(404, "Community not found.");
  if (community.is_private && !get("SELECT 1 FROM community_members WHERE community_id = ? AND user_id = ?", id, me.id)) throw new HttpError(403, "This community is private.");
  const members = all<{ uid: number; username: string; name: string; avatar: string | null; verified: number; role: string; joined_at: number }>("SELECT u.id AS uid, u.username, u.name, u.avatar, u.verified, cm.role, cm.joined_at FROM community_members cm JOIN users u ON u.id = cm.user_id WHERE cm.community_id = ? ORDER BY cm.role = 'owner' DESC, cm.role = 'admin' DESC, cm.joined_at", id);
  return { community: { ...community, isPrivate: !!community.is_private, members: members.map((member) => ({ ...userLite(member), role: member.role, joinedAt: member.joined_at })) } };
});

export const POST = route(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser();
  const id = intParam((await params).id);
  const community = get<{ id: number; is_private: number; owner_id: number }>("SELECT id, is_private, owner_id FROM communities WHERE id = ?", id);
  if (!community) throw new HttpError(404, "Community not found.");
  if (community.is_private && community.owner_id !== me.id) throw new HttpError(403, "This community is private.");
  const existing = get("SELECT 1 FROM community_members WHERE community_id = ? AND user_id = ?", id, me.id);
  if (existing) run("DELETE FROM community_members WHERE community_id = ? AND user_id = ?", id, me.id);
  else run("INSERT INTO community_members (community_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)", id, me.id, now());
  return { joined: !existing };
});

export const PATCH = route(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser();
  const id = intParam((await params).id);
  const community = manage(id, me.id);
  const body = await jsonBody<{ userId?: number; role?: string }>(req);
  const userId = Number(body.userId);
  const role = String(body.role ?? "member");
  if (!Number.isInteger(userId) || !["admin", "member"].includes(role)) throw new HttpError(400, "Invalid member role.");
  if (userId === community.owner_id) throw new HttpError(400, "The owner role cannot be changed.");
  run("UPDATE community_members SET role = ? WHERE community_id = ? AND user_id = ?", role, id, userId);
  return { ok: true };
});

export const DELETE = route(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser();
  const id = intParam((await params).id);
  const community = manage(id, me.id);
  const userId = Number(new URL(req.url).searchParams.get("userId"));
  if (!Number.isInteger(userId) || userId === community.owner_id) throw new HttpError(400, "Invalid member.");
  run("DELETE FROM community_members WHERE community_id = ? AND user_id = ?", id, userId);
  return { ok: true };
});
