import { route, HttpError, jsonBody } from "@/lib/server/http";
import { all, get, run } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";

export const GET = route(async (_req, { params }: { params: Promise<{ username: string }> }) => {
  await requireUser();
  const username = decodeURIComponent((await params).username);
  const user = get<{ id: number }>("SELECT id FROM users WHERE username = ?", username);
  if (!user) throw new HttpError(404, "User not found.");
  return { gifts: all<{ id: number; name: string; emoji: string; price: number; pinned: number; created_at: number; sender_username: string }>("SELECT g.id, g.name, g.emoji, g.price, g.pinned, g.created_at, u.username AS sender_username FROM received_gifts g JOIN users u ON u.id = g.sender_id WHERE g.recipient_id = ? ORDER BY g.pinned DESC, g.id DESC LIMIT 50", user.id).map((gift) => ({ id: gift.id, name: gift.name, emoji: gift.emoji, price: gift.price, pinned: !!gift.pinned, createdAt: gift.created_at, senderUsername: gift.sender_username })) };
});

export const PATCH = route(async (req, { params }: { params: Promise<{ username: string }> }) => {
  const me = await requireUser();
  const username = decodeURIComponent((await params).username);
  const user = get<{ id: number }>("SELECT id FROM users WHERE username = ?", username);
  if (!user || user.id !== me.id) throw new HttpError(403, "Only your own gifts can be changed.");
  const body = await jsonBody<{ id?: number; pinned?: boolean }>(req);
  const id = Number(body.id);
  if (!Number.isInteger(id)) throw new HttpError(400, "Invalid gift.");
  const gift = get("SELECT 1 FROM received_gifts WHERE id = ? AND recipient_id = ?", id, me.id);
  if (!gift) throw new HttpError(404, "Gift not found.");
  run("UPDATE received_gifts SET pinned = ? WHERE id = ? AND recipient_id = ?", body.pinned ? 1 : 0, id, me.id);
  return { ok: true };
});
