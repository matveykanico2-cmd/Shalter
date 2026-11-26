import { route, intParam, jsonBody, HttpError } from "@/lib/server/http";
import { get } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";
import { loadMessages, sendGift } from "@/lib/server/dm";

export const POST = route(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser();
  const conversationId = intParam((await params).id);
  const body = await jsonBody<{ giftId?: number }>(req);
  const gift = get<{ id: number; name: string; emoji: string; price: number }>("SELECT id, name, emoji, price FROM gift_catalog WHERE id = ? AND active = 1", Number(body.giftId));
  if (!gift) throw new HttpError(404, "Gift not found.");
  const messageId = sendGift(conversationId, me.id, gift);
  return { message: loadMessages(conversationId, messageId - 1, me.id).find((message) => message.id === messageId) };
});
