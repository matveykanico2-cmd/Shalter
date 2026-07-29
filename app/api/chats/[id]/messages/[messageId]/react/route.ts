import { NextResponse } from "next/server";
import { requireUserId, isResponse } from "@/lib/api-helpers";
import { toggleReaction } from "@/lib/data/messages";

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/chats/[id]/messages/[messageId]/react">
) {
  const uid = await requireUserId();
  if (isResponse(uid)) return uid;
  const { messageId } = await ctx.params;
  const { emoji } = (await request.json()) as { emoji: string };
  const message = await toggleReaction(messageId, emoji, uid);
  return NextResponse.json({ message });
}
