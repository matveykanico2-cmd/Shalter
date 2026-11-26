import "server-only";
import { all, db, get, run, now, tx } from "./db";
import { addWelcomeMessage } from "../../../db/welcome.mjs";
import { HttpError } from "./http";
import { firstMedia, userLite } from "./queries";
import type { InvoiceCard, Message, MessageKind, UserLite } from "@/lib/types";

/** Returns the 1:1 conversation between two users, creating it if needed. */
export function conversationBetween(a: number, b: number): number {
  const existing = get<{ id: number }>(
    `SELECT c.id FROM conversations c
     JOIN conversation_members x ON x.conversation_id = c.id AND x.user_id = ?
     JOIN conversation_members y ON y.conversation_id = c.id AND y.user_id = ?
     LIMIT 1`,
    a,
    b,
  );
  if (existing) return existing.id;
  return tx(() => {
    const t = now();
    const { id } = run("INSERT INTO conversations (kind, created_at, updated_at) VALUES ('direct', ?, ?)", t, t);
    run("INSERT INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, 'member'), (?, ?, 'member')", id, a, id, b);
    addWelcomeMessage(db(), id);
    return id;
  });
}

/** Creates a multi-member group conversation. `memberIds` excludes the owner. */
export function conversationGroup(ownerId: number, memberIds: number[], title: string): number {
  const members = [...new Set([ownerId, ...memberIds])];
  if (members.length < 3) throw new HttpError(400, "Choose at least two people for a group chat.");
  return tx(() => {
    const t = now();
    const { id } = run("INSERT INTO conversations (kind, title, owner_id, created_at, updated_at) VALUES ('group', ?, ?, ?, ?)", title.slice(0, 80), ownerId, t, t);
    for (const userId of members) run("INSERT INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, ?)", id, userId, userId === ownerId ? "owner" : "member");
    addWelcomeMessage(db(), id, ownerId);
    return id;
  });
}

/** Creates a broadcast channel. The owner is the only member who may publish for now. */
export function conversationChannel(ownerId: number, title: string): number {
  const clean = title.trim().slice(0, 80);
  if (!clean) throw new HttpError(400, "Channel name is required.");
  return tx(() => {
    const t = now();
    const { id } = run("INSERT INTO conversations (kind, title, owner_id, created_at, updated_at) VALUES ('channel', ?, ?, ?, ?)", clean, ownerId, t, t);
    run("INSERT INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, 'owner')", id, ownerId);
    const discussion = run("INSERT INTO conversations (kind, title, owner_id, created_at, updated_at) VALUES ('group', ?, ?, ?, ?)", `${clean} · Discussion`, ownerId, t, t);
    run("INSERT INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, 'owner')", discussion.id, ownerId);
    run("UPDATE conversations SET linked_conversation_id = ? WHERE id = ?", discussion.id, id);
    return id;
  });
}

export function conversationDetails(conversationId: number, viewerId: number) {
  if (!get("SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?", conversationId, viewerId)) throw new HttpError(404, "Conversation not found.");
  const chat = get<{ kind: "direct" | "group" | "channel"; title: string | null; theme: string; linked_conversation_id: number | null }>("SELECT kind, title, theme, linked_conversation_id FROM conversations WHERE id = ?", conversationId);
  if (!chat) throw new HttpError(404, "Conversation not found.");
  const members = all<{ uid: number; username: string; name: string; avatar: string | null; verified: number; role: string }>(
    `SELECT u.id AS uid, u.username, u.name, u.avatar, u.verified, cm.role
     FROM conversation_members cm JOIN users u ON u.id = cm.user_id WHERE cm.conversation_id = ? ORDER BY cm.role = 'owner' DESC, cm.user_id`, conversationId,
  ).map((member) => ({ ...userLite(member), role: member.role }));
  const settings = get<{ wallpaper: string; muted_until: number | null }>("SELECT wallpaper, muted_until FROM chat_settings WHERE user_id = ? AND conversation_id = ?", viewerId, conversationId);
  return { kind: chat.kind, title: chat.title, theme: chat.theme, wallpaper: settings?.wallpaper ?? "default", mutedUntil: settings?.muted_until ?? null, linkedDiscussionId: chat.linked_conversation_id, members };
}

export function updateConversationTheme(conversationId: number, viewerId: number, theme: string) {
  if (!get("SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?", conversationId, viewerId)) throw new HttpError(404, "Conversation not found.");
  run("UPDATE conversations SET theme = ? WHERE id = ?", theme, conversationId);
}

export function updateChatSettings(conversationId: number, viewerId: number, patch: { wallpaper?: string; mutedUntil?: number | null }) {
  if (!get("SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?", conversationId, viewerId)) throw new HttpError(404, "Conversation not found.");
  const current = get<{ wallpaper: string; muted_until: number | null }>("SELECT wallpaper, muted_until FROM chat_settings WHERE user_id = ? AND conversation_id = ?", viewerId, conversationId);
  const wallpaper = patch.wallpaper ?? current?.wallpaper ?? "default";
  const mutedUntil = patch.mutedUntil === undefined ? current?.muted_until ?? null : patch.mutedUntil;
  run("INSERT INTO chat_settings (user_id, conversation_id, wallpaper, muted_until, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, conversation_id) DO UPDATE SET wallpaper = excluded.wallpaper, muted_until = excluded.muted_until", viewerId, conversationId, wallpaper, mutedUntil, now());
  return { wallpaper, mutedUntil };
}

export function createCall(conversationId: number, initiatorId: number, kind: "audio" | "video") {
  if (!get("SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?", conversationId, initiatorId)) throw new HttpError(404, "Conversation not found.");
  const active = get<{ id: number }>("SELECT id FROM call_sessions WHERE conversation_id = ? AND status IN ('ringing', 'active') ORDER BY id DESC LIMIT 1", conversationId);
  if (active) return active.id;
  return run("INSERT INTO call_sessions (conversation_id, initiator_id, kind, created_at) VALUES (?, ?, ?, ?)", conversationId, initiatorId, kind, now()).id;
}

export function readCall(conversationId: number, viewerId: number, callId?: number) {
  if (!get("SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?", conversationId, viewerId)) throw new HttpError(404, "Conversation not found.");
  return get<{ id: number; initiator_id: number; kind: "audio" | "video"; status: string; offer: string | null; answer: string | null; caller_ice: string; callee_ice: string; created_at: number }>(
    `SELECT id, initiator_id, kind, status, offer, answer, caller_ice, callee_ice, created_at FROM call_sessions
     WHERE conversation_id = ? ${callId ? "AND id = ?" : "AND status IN ('ringing', 'active')"} ORDER BY id DESC LIMIT 1`,
    ...(callId ? [conversationId, callId] : [conversationId]),
  );
}

export function updateCall(callId: number, viewerId: number, patch: { offer?: string; answer?: string; ice?: string; status?: "active" | "ended" }) {
  const call = get<{ conversation_id: number; initiator_id: number }>("SELECT conversation_id, initiator_id FROM call_sessions WHERE id = ?", callId);
  if (!call || !get("SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?", call?.conversation_id, viewerId)) throw new HttpError(404, "Call not found.");
  if (patch.offer && call.initiator_id !== viewerId) throw new HttpError(403, "Only the caller can publish an offer.");
  if (patch.answer && call.initiator_id === viewerId) throw new HttpError(403, "Only the recipient can answer.");
  if (patch.ice) {
    const field = call.initiator_id === viewerId ? "caller_ice" : "callee_ice";
    const current = get<{ value: string }>(`SELECT ${field} AS value FROM call_sessions WHERE id = ?`, callId)?.value ?? "[]";
    const items = JSON.parse(current) as unknown[];
    items.push(JSON.parse(patch.ice));
    run(`UPDATE call_sessions SET ${field} = ? WHERE id = ?`, JSON.stringify(items.slice(-50)), callId);
  }
  if (patch.offer) run("UPDATE call_sessions SET offer = ?, status = 'active' WHERE id = ?", patch.offer, callId);
  if (patch.answer) run("UPDATE call_sessions SET answer = ?, status = 'active' WHERE id = ?", patch.answer, callId);
  if (patch.status === "ended") run("UPDATE call_sessions SET status = 'ended', ended_at = ? WHERE id = ?", now(), callId);
}

/** The highest message id the other participant has read (for "Seen"). */
export function otherLastRead(conversationId: number, viewerId: number): number {
  return (
    get<{ last_read_id: number }>(
      "SELECT last_read_id FROM conversation_members WHERE conversation_id = ? AND user_id != ?",
      conversationId,
      viewerId,
    )?.last_read_id ?? 0
  );
}

/** The other participant, or a 404 when the viewer isn't in this conversation. */
export function otherMember(conversationId: number, viewerId: number): UserLite {
  const membership = get("SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?", conversationId, viewerId);
  if (!membership) {
    const channel = get<{ owner_id: number; kind: string }>("SELECT owner_id, kind FROM conversations WHERE id = ?", conversationId);
    if (channel?.kind === "channel") run("INSERT INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, 'member')", conversationId, viewerId);
    else throw new HttpError(404, "Conversation not found.");
  }
  const r = get<{ uid: number; username: string; name: string; avatar: string | null; verified: number }>(
    `SELECT u.id AS uid, u.username, u.name, u.avatar, u.verified FROM conversation_members cm
     JOIN users u ON u.id = cm.user_id WHERE cm.conversation_id = ? AND cm.user_id != ?`,
    conversationId,
    viewerId,
  );
  if (!r) {
    const channelOwner = get<{ uid: number; username: string; name: string; avatar: string | null; verified: number }>(
      `SELECT u.id AS uid, u.username, u.name, u.avatar, u.verified FROM conversations c JOIN users u ON u.id = c.owner_id WHERE c.id = ? AND c.kind = 'channel'`,
      conversationId,
    );
    if (channelOwner) return userLite(channelOwner);
    throw new HttpError(404, "Conversation not found.");
  }
  return userLite(r);
}

export function sendMessage(
  conversationId: number,
  senderId: number,
  text: string,
  postId: number | null = null,
  replyToId: number | null = null,
) {
  const t = now();
  const { id } = run(
    "INSERT INTO messages (conversation_id, sender_id, kind, text, post_id, reply_to_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    conversationId,
    senderId,
    postId ? "post" : "text",
    text,
    postId,
    replyToId,
    t,
  );
  run("UPDATE conversations SET updated_at = ? WHERE id = ?", t, conversationId);
  run("UPDATE conversation_members SET last_read_id = ? WHERE conversation_id = ? AND user_id = ?", id, conversationId, senderId);
  return id;
}

export function forwardMessage(messageId: number, targetConversationId: number, userId: number) {
  const source = get<{ conversation_id: number; kind: MessageKind; text: string; media_url: string | null; media_kind: "image" | "video" | null }>(
    "SELECT conversation_id, kind, text, media_url, media_kind FROM messages WHERE id = ?",
    messageId,
  );
  if (!source || !get("SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?", source.conversation_id, userId)) throw new HttpError(404, "Message not found.");
  if (!get("SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?", targetConversationId, userId)) throw new HttpError(404, "Target chat not found.");
  if (source.kind === "media" && source.media_url && source.media_kind) return sendMediaMessage(targetConversationId, userId, { url: source.media_url, kind: source.media_kind });
  if (!source.text.trim()) throw new HttpError(400, "This message type cannot be forwarded yet.");
  return sendMessage(targetConversationId, userId, `Forwarded: ${source.text}`);
}

export function sendMediaMessage(conversationId: number, senderId: number, media: { url: string; kind: "image" | "video" }) {
  const t = now();
  const { id } = run(
    "INSERT INTO messages (conversation_id, sender_id, kind, text, media_url, media_kind, created_at) VALUES (?, ?, 'media', '', ?, ?, ?)",
    conversationId,
    senderId,
    media.url,
    media.kind,
    t,
  );
  run("UPDATE conversations SET updated_at = ? WHERE id = ?", t, conversationId);
  run("UPDATE conversation_members SET last_read_id = ? WHERE conversation_id = ? AND user_id = ?", id, conversationId, senderId);
  return id;
}

export function sendVoiceMessage(conversationId: number, senderId: number, voice: { url: string; seconds: number }) {
  const t = now();
  const { id } = run(
    "INSERT INTO messages (conversation_id, sender_id, kind, text, voice_url, voice_seconds, created_at) VALUES (?, ?, 'voice', '', ?, ?, ?)",
    conversationId,
    senderId,
    voice.url,
    Math.max(1, Math.min(600, Math.round(voice.seconds))),
    t,
  );
  run("UPDATE conversations SET updated_at = ? WHERE id = ?", t, conversationId);
  run("UPDATE conversation_members SET last_read_id = ? WHERE conversation_id = ? AND user_id = ?", id, conversationId, senderId);
  return id;
}

export function sendCallMessage(conversationId: number, senderId: number, type: "audio" | "video") {
  const t = now();
  const { id } = run(
    "INSERT INTO messages (conversation_id, sender_id, kind, text, call_type, call_status, created_at) VALUES (?, ?, 'call', '', ?, 'outgoing', ?)",
    conversationId,
    senderId,
    type,
    t,
  );
  run("UPDATE conversations SET updated_at = ? WHERE id = ?", t, conversationId);
  run("UPDATE conversation_members SET last_read_id = ? WHERE conversation_id = ? AND user_id = ?", id, conversationId, senderId);
  return id;
}

export function sendGift(conversationId: number, senderId: number, gift: { id: number; name: string; emoji: string; price: number }) {
  if (!get("SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?", conversationId, senderId)) throw new HttpError(404, "Conversation not found.");
  const t = now();
  const { id } = run("INSERT INTO messages (conversation_id, sender_id, kind, text, gift_id, gift_name, gift_emoji, gift_price, created_at) VALUES (?, ?, 'gift', ?, ?, ?, ?, ?, ?)", conversationId, senderId, `${gift.emoji} ${gift.name}`, gift.id, gift.name, gift.emoji, gift.price, t);
  run("UPDATE conversations SET updated_at = ? WHERE id = ?", t, conversationId);
  run("UPDATE conversation_members SET last_read_id = ? WHERE conversation_id = ? AND user_id = ?", id, conversationId, senderId);
  const recipients = all<{ user_id: number }>("SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id != ?", conversationId, senderId);
  for (const recipient of recipients) run("INSERT INTO received_gifts (gift_id, sender_id, recipient_id, message_id, name, emoji, price, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", gift.id, senderId, recipient.user_id, id, gift.name, gift.emoji, gift.price, t);
  return id;
}

export function sendPoll(conversationId: number, senderId: number, question: string, options: string[]) {
  if (!get("SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?", conversationId, senderId)) throw new HttpError(404, "Conversation not found.");
  const cleanQuestion = question.trim().slice(0, 200);
  const cleanOptions = [...new Set(options.map((option) => option.trim().slice(0, 100)).filter(Boolean))].slice(0, 10);
  if (!cleanQuestion || cleanOptions.length < 2) throw new HttpError(400, "A poll needs a question and at least two options.");
  const t = now();
  const { id } = run(
    "INSERT INTO messages (conversation_id, sender_id, kind, text, poll_question, poll_options, poll_votes, created_at) VALUES (?, ?, 'poll', '', ?, ?, '{}', ?)",
    conversationId,
    senderId,
    cleanQuestion,
    JSON.stringify(cleanOptions),
    t,
  );
  run("UPDATE conversations SET updated_at = ? WHERE id = ?", t, conversationId);
  run("UPDATE conversation_members SET last_read_id = ? WHERE conversation_id = ? AND user_id = ?", id, conversationId, senderId);
  return id;
}

export function votePoll(messageId: number, userId: number, option: number) {
  const poll = get<{ conversation_id: number; poll_options: string | null; poll_votes: string | null }>("SELECT conversation_id, poll_options, poll_votes FROM messages WHERE id = ? AND kind = 'poll'", messageId);
  if (!poll || !get("SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?", poll.conversation_id, userId)) throw new HttpError(404, "Poll not found.");
  const options = JSON.parse(poll.poll_options || "[]") as string[];
  if (!Number.isInteger(option) || option < 0 || option >= options.length) throw new HttpError(400, "Choose a valid poll option.");
  const votes = JSON.parse(poll.poll_votes || "{}") as Record<string, number>;
  votes[String(userId)] = option;
  run("UPDATE messages SET poll_votes = ? WHERE id = ?", JSON.stringify(votes), messageId);
  return { option, votes };
}

/** Unsends (deletes) a message. Only its sender may do this; invoices, receipts and the welcome message stay. */
export function unsendMessage(messageId: number, userId: number) {
  const m = get<{ sender_id: number; kind: MessageKind }>("SELECT sender_id, kind FROM messages WHERE id = ?", messageId);
  if (!m || m.sender_id !== userId) throw new HttpError(404, "Message not found.");
  if (m.kind === "invoice" || m.kind === "receipt") throw new HttpError(400, "Invoices and receipts can't be unsent.");
  if (m.kind === "welcome") throw new HttpError(400, "The welcome message can't be unsent. Edit it in src/config/welcome-message.mjs.");
  run("DELETE FROM messages WHERE id = ?", messageId);
}

export function editMessage(messageId: number, userId: number, text: string) {
  const message = get<{ sender_id: number; kind: MessageKind }>("SELECT sender_id, kind FROM messages WHERE id = ?", messageId);
  if (!message || message.sender_id !== userId) throw new HttpError(404, "Message not found.");
  if (message.kind !== "text") throw new HttpError(400, "Only text messages can be edited.");
  run("UPDATE messages SET text = ?, edited_at = ? WHERE id = ?", text, now(), messageId);
}

export function togglePinMessage(messageId: number, userId: number) {
  const message = get<{ conversation_id: number; pinned_at: number | null }>("SELECT conversation_id, pinned_at FROM messages WHERE id = ?", messageId);
  if (!message || !get("SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?", message.conversation_id, userId)) throw new HttpError(404, "Message not found.");
  const conversation = get<{ kind: string; owner_id: number | null }>("SELECT kind, owner_id FROM conversations WHERE id = ?", message.conversation_id);
  const member = get<{ role: string }>("SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?", message.conversation_id, userId);
  const allowed = conversation?.kind === "direct" || conversation?.owner_id === userId || member?.role === "admin" || member?.role === "owner";
  if (!allowed) throw new HttpError(403, "Only chat moderators can pin messages.");
  if (message.pinned_at) run("UPDATE messages SET pinned_at = NULL, pinned_by = NULL WHERE id = ?", messageId);
  else run("UPDATE messages SET pinned_at = ?, pinned_by = ? WHERE id = ?", now(), userId, messageId);
  return !message.pinned_at;
}

export function toggleReaction(messageId: number, userId: number, emoji: string) {
  const message = get<{ id: number }>("SELECT id FROM messages WHERE id = ?", messageId);
  if (!message) throw new HttpError(404, "Message not found.");
  const existing = get<{ message_id: number }>("SELECT message_id FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?", messageId, userId, emoji);
  if (existing) {
    run("DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?", messageId, userId, emoji);
    return false;
  }
  run("INSERT INTO message_reactions (message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)", messageId, userId, emoji, now());
  return true;
}

/** Ids of every message still in the conversation, so open threads can drop unsent ones. */
export function messageIds(conversationId: number): number[] {
  return all<{ id: number }>("SELECT id FROM messages WHERE conversation_id = ? ORDER BY id", conversationId).map((r) => r.id);
}

type InvoiceRow = {
  id: number;
  number: string;
  kind: "invoice" | "receipt";
  issued_at: number;
  total_fils: number;
  currency: string;
  payment_method: string;
  payment_reference: string;
  paid_at: number | null;
  is_seed: number;
  i_id: number;
  i_username: string;
  i_name: string;
  i_avatar: string | null;
  i_verified: number;
  i_category: string;
  r_id: number;
  r_username: string;
  r_name: string;
  r_avatar: string | null;
  r_verified: number;
};

/** Invoice/receipt cards with their line items, by invoice id. */
export function loadInvoices(ids: number[]): Map<number, InvoiceCard> {
  const out = new Map<number, InvoiceCard>();
  if (!ids.length) return out;
  const marks = ids.map(() => "?").join(",");
  const rows = all<InvoiceRow>(
    `SELECT v.*, i.id AS i_id, i.username AS i_username, i.name AS i_name, i.avatar AS i_avatar,
       i.verified AS i_verified, i.business_category AS i_category,
       r.id AS r_id, r.username AS r_username, r.name AS r_name, r.avatar AS r_avatar, r.verified AS r_verified
     FROM invoices v JOIN users i ON i.id = v.issuer_id JOIN users r ON r.id = v.recipient_id
     WHERE v.id IN (${marks})`,
    ...ids,
  );
  const items = all<{ invoice_id: number; description: string; quantity: number; unit_fils: number }>(
    `SELECT invoice_id, description, quantity, unit_fils FROM invoice_items WHERE invoice_id IN (${marks}) ORDER BY position`,
    ...ids,
  );
  for (const r of rows) {
    out.set(r.id, {
      id: r.id,
      number: r.number,
      kind: r.kind,
      issuer: {
        ...userLite({ uid: r.i_id, username: r.i_username, name: r.i_name, avatar: r.i_avatar, verified: r.i_verified }),
        businessCategory: r.i_category,
      },
      recipient: userLite({ uid: r.r_id, username: r.r_username, name: r.r_name, avatar: r.r_avatar, verified: r.r_verified }),
      issuedAt: r.issued_at,
      items: items
        .filter((i) => i.invoice_id === r.id)
        .map((i) => ({ description: i.description, quantity: i.quantity, unitFils: i.unit_fils })),
      totalFils: r.total_fils,
      currency: r.currency,
      paymentMethod: r.payment_method,
      paymentReference: r.payment_reference,
      paidAt: r.paid_at,
      isSeed: !!r.is_seed,
    });
  }
  return out;
}

/** Messages in time order (the welcome message is dated at the conversation's start even when added later). */
export function loadMessages(conversationId: number, afterId = 0, viewerId: number | null = null): Message[] {
  const rows = all<{
    id: number;
    sender_id: number;
    kind: MessageKind;
    invoice_id: number | null;
    voice_seconds: number | null;
    voice_url: string | null;
    media_url: string | null;
    media_kind: "image" | "video" | null;
    call_type: "audio" | "video" | null;
    call_status: "outgoing" | "missed" | "ended" | null;
    gift_id: number | null;
    gift_name: string | null;
    gift_emoji: string | null;
    gift_price: number | null;
    poll_question: string | null;
    poll_options: string | null;
    poll_votes: string | null;
    reply_to_id: number | null;
    edited_at: number | null;
    pinned_at: number | null;
    text: string;
    post_id: number | null;
    created_at: number;
    p_caption: string | null;
    uid: number | null;
    username: string;
    name: string;
    avatar: string | null;
    verified: number;
    reply_text: string | null;
    reply_sender_id: number | null;
  }>(
    `SELECT m.id, m.sender_id, m.kind, m.invoice_id, m.voice_seconds, m.voice_url, m.media_url, m.media_kind, m.call_type, m.call_status,
       m.gift_id, m.gift_name, m.gift_emoji, m.gift_price, m.poll_question, m.poll_options, m.poll_votes,
       m.reply_to_id, m.edited_at, m.pinned_at, m.text, m.post_id, m.created_at, p.caption AS p_caption,
       u.id AS uid, u.username, u.name, u.avatar, u.verified,
       reply.text AS reply_text, reply.sender_id AS reply_sender_id
     FROM messages m
     LEFT JOIN posts p ON p.id = m.post_id
     LEFT JOIN users u ON u.id = p.user_id
     LEFT JOIN messages reply ON reply.id = m.reply_to_id
     WHERE m.conversation_id = ? AND m.id > ? ORDER BY m.created_at, m.id`,
    conversationId,
    afterId,
  );
  const reactionRows = rows.length
    ? all<{ message_id: number; emoji: string; count: number; reacted: number }>(
        `SELECT message_id, emoji, COUNT(*) AS count,
           MAX(CASE WHEN user_id = ? THEN 1 ELSE 0 END) AS reacted
         FROM message_reactions WHERE message_id IN (${rows.map(() => "?").join(",")}) GROUP BY message_id, emoji`,
        viewerId ?? -1,
        ...rows.map((r) => r.id),
      )
    : [];
  const invoices = loadInvoices(rows.flatMap((r) => (r.invoice_id ? [r.invoice_id] : [])));
  return rows.map((r) => ({
    id: r.id,
    senderId: r.sender_id,
    kind: r.kind,
    text: r.text,
    createdAt: r.created_at,
    invoice: r.invoice_id ? (invoices.get(r.invoice_id) ?? null) : null,
    voiceSeconds: r.voice_seconds,
    voiceUrl: r.voice_url,
    media: r.media_url && r.media_kind ? { url: r.media_url, kind: r.media_kind } : null,
    call: r.call_type && r.call_status ? { type: r.call_type, status: r.call_status } : null,
    gift: r.kind === "gift" && r.gift_emoji && r.gift_name ? { id: r.gift_id, name: r.gift_name, emoji: r.gift_emoji, price: r.gift_price ?? 0 } : null,
    poll: r.kind === "poll" && r.poll_question && r.poll_options ? (() => {
      const options = JSON.parse(r.poll_options) as string[];
      const votes = JSON.parse(r.poll_votes || "{}") as Record<string, number>;
      const counts = options.map(() => 0);
      Object.values(votes).forEach((choice) => { if (Number.isInteger(choice) && choice >= 0 && choice < counts.length) counts[choice] += 1; });
      return { question: r.poll_question, totalVotes: Object.keys(votes).length, options: options.map((text, index) => ({ text, votes: counts[index], voted: votes[String(viewerId)] === index })) };
    })() : null,
    editedAt: r.edited_at,
    pinnedAt: r.pinned_at,
    replyTo: r.reply_to_id && r.reply_text !== null && r.reply_sender_id !== null ? { id: r.reply_to_id, senderId: r.reply_sender_id, text: r.reply_text } : null,
    reactions: reactionRows.filter((x) => x.message_id === r.id).map((x) => ({ emoji: x.emoji, count: x.count, reacted: !!x.reacted })),
    post:
      r.post_id && r.uid
        ? { id: r.post_id, caption: r.p_caption ?? "", thumb: firstMedia(r.post_id), user: userLite({ ...r, uid: r.uid }) }
        : null,
  }));
}
