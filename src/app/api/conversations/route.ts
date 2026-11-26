import { route, jsonBody, HttpError } from "@/lib/server/http";
import { all } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";
import { userLite } from "@/lib/server/queries";
import { userIdByUsername } from "@/lib/server/users";
import { conversationBetween, conversationGroup } from "@/lib/server/dm";
import type { Conversation, MessageKind } from "@/lib/types";

export const GET = route(async () => {
  const me = await requireUser();
  const rows = all<{
    id: number;
    kind: "direct" | "group" | "channel";
    title: string | null;
    theme: string;
    member_count: number;
    updated_at: number;
    last_read_id: number;
    uid: number;
    username: string;
    name: string;
    avatar: string | null;
    verified: number;
    m_id: number | null;
    m_text: string | null;
    m_sender: number | null;
    m_kind: MessageKind;
    m_at: number | null;
  }>(
    `SELECT c.id, c.updated_at, me.last_read_id,
       c.kind, c.title, c.theme,
       (SELECT COUNT(*) FROM conversation_members all_members WHERE all_members.conversation_id = c.id) AS member_count,
       u.id AS uid, u.username, u.name, u.avatar, u.verified,
       m.id AS m_id, m.text AS m_text, m.sender_id AS m_sender, m.kind AS m_kind, m.created_at AS m_at
     FROM conversation_members me
     JOIN conversations c ON c.id = me.conversation_id
     JOIN users u ON u.id = CASE WHEN c.kind = 'channel' THEN c.owner_id ELSE (SELECT other.user_id FROM conversation_members other WHERE other.conversation_id = c.id AND other.user_id != me.user_id ORDER BY other.user_id LIMIT 1) END
     LEFT JOIN messages m ON m.id = (SELECT id FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC, id DESC LIMIT 1)
     WHERE me.user_id = ?
     ORDER BY c.updated_at DESC`,
    me.id,
  );
  const conversations: Conversation[] = rows
    // Hide empty threads you opened but never wrote in.
    .filter((r) => r.m_id !== null)
    .map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      theme: r.theme,
      memberCount: r.member_count,
      other: userLite(r),
      updatedAt: r.updated_at,
      lastMessage: {
        text: r.m_text ?? "",
        senderId: r.m_sender!,
        createdAt: r.m_at!,
        kind: r.m_kind,
      },
      unread: r.m_sender !== me.id && r.m_id! > r.last_read_id,
    }));
  return { conversations };
});

// Open a direct chat with { username }, or create a group with { usernames, title }.
export const POST = route(async (req) => {
  const me = await requireUser();
  const body = await jsonBody<{ username?: string; usernames?: string[]; title?: string }>(req);
  const usernames = Array.isArray(body.usernames) ? body.usernames.map((value) => String(value).trim()).filter(Boolean) : [];
  if (usernames.length > 1) {
    const memberIds = usernames.map(userIdByUsername).filter((id) => id !== me.id);
    const title = String(body.title ?? "").trim() || `Group · ${memberIds.length + 1} people`;
    return { id: conversationGroup(me.id, memberIds, title) };
  }
  const username = usernames[0] ?? String(body.username ?? "");
  const other = userIdByUsername(username);
  if (other === me.id) throw new HttpError(400, "You can't message yourself.");
  return { id: conversationBetween(me.id, other) };
});
