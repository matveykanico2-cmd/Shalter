import { NextResponse } from "next/server";
import { requireUserId, isResponse } from "@/lib/api-helpers";
import { togglePin } from "@/lib/data/messages";

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/chats/[id]/messages/[messageId]/pin">
) {
  const uid = await requireUserId();
  if (isResponse(uid)) return uid;
  const { messageId } = await ctx.params;
  const { pinned } = (await request.json()) as { pinned: boolean };
  const message = await togglePin(messageId, pinned);
  return NextResponse.json({ message });
}
