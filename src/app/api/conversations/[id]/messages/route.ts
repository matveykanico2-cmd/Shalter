import { route, intParam, jsonBody, HttpError } from "@/lib/server/http";
import { get, run } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";
import { conversationDetails, loadMessages, messageIds, otherLastRead, otherMember, sendMessage, sendCallMessage, sendPoll } from "@/lib/server/dm";

type Ctx = { params: Promise<{ id: string }> };

// Messages in a conversation; ?after=<message id> returns only newer ones (used for live polling).
// `ids` lists every message still present so open threads can drop ones that were unsent.
export const GET = route(async (req, { params }: Ctx) => {
  const me = await requireUser();
  const id = intParam((await params).id);
  const other = otherMember(id, me.id);
  const search = new URL(req.url).searchParams.get("search")?.trim().slice(0, 80) ?? "";
  if (search) {
    const needle = search.toLocaleLowerCase();
    return { results: loadMessages(id, 0, me.id).filter((message) => message.text.toLocaleLowerCase().includes(needle)).slice(-50) };
  }
  const after = Number(new URL(req.url).searchParams.get("after")) || 0;
  const messages = loadMessages(id, after, me.id);
  if (messages.length)
    run(
      "UPDATE conversation_members SET last_read_id = MAX(last_read_id, ?) WHERE conversation_id = ? AND user_id = ?",
      Math.max(...messages.map((m) => m.id)),
      id,
      me.id,
    );
  return { other, ...conversationDetails(id, me.id), messages, ids: messageIds(id), otherLastReadId: otherLastRead(id, me.id) };
});

export const POST = route(async (req, { params }: Ctx) => {
  const me = await requireUser();
  const id = intParam((await params).id);
  otherMember(id, me.id);
  const body = await jsonBody<{ text?: string; callType?: "audio" | "video"; replyToId?: number; poll?: { question?: string; options?: string[] } }>(req);
  const channel = get<{ kind: string; owner_id: number | null }>("SELECT kind, owner_id FROM conversations WHERE id = ?", id);
  if (channel?.kind === "channel" && channel.owner_id !== me.id) throw new HttpError(403, "Only the channel owner can publish updates.");
  if (body.callType === "audio" || body.callType === "video") {
    const messageId = sendCallMessage(id, me.id, body.callType);
    return { message: loadMessages(id, messageId - 1, me.id).find((m) => m.id === messageId) };
  }
  if (body.poll) {
    const messageId = sendPoll(id, me.id, String(body.poll.question ?? ""), Array.isArray(body.poll.options) ? body.poll.options.map(String) : []);
    return { message: loadMessages(id, messageId - 1, me.id).find((m) => m.id === messageId) };
  }
  const text = String(body.text ?? "").trim().slice(0, 1000);
  if (!text) throw new HttpError(400, "Write a message first.");
  const replyToId = Number(body.replyToId) || null;
  const messageId = sendMessage(id, me.id, text, null, replyToId);
  // Shalter-style channel mechanics: owner posts are mirrored into the linked discussion chat.
  if (channel?.kind === "channel") {
    const linked = get<{ linked_conversation_id: number | null }>("SELECT linked_conversation_id FROM conversations WHERE id = ?", id)?.linked_conversation_id;
    if (linked) sendMessage(linked, me.id, text, null, null);
  }
  return { message: loadMessages(id, messageId - 1, me.id).find((m) => m.id === messageId) };
});
