import { route, intParam, jsonBody, HttpError } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { forwardMessage } from "@/lib/server/dm";

export const POST = route(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser();
  const body = await jsonBody<{ conversationId?: number }>(req);
  const conversationId = Number(body.conversationId);
  if (!Number.isInteger(conversationId) || conversationId <= 0) throw new HttpError(400, "Choose a target chat.");
  return { id: forwardMessage(intParam((await params).id), conversationId, me.id) };
});
