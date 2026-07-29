import { NextResponse } from "next/server";
import { requireUserId, isResponse } from "@/lib/api-helpers";
import { getMessage, editMessage, deleteMessage } from "@/lib/data/messages";

export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/chats/[id]/messages/[messageId]">
) {
  const uid = await requireUserId();
  if (isResponse(uid)) return uid;
  const { messageId } = await ctx.params;
  const existing = await getMessage(messageId);
  if (!existing || existing.senderId !== uid) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { text } = (await request.json()) as { text: string };
  const message = await editMessage(messageId, text);
  return NextResponse.json({ message });
}

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/chats/[id]/messages/[messageId]">
) {
  const uid = await requireUserId();
  if (isResponse(uid)) return uid;
  const { messageId } = await ctx.params;
  const existing = await getMessage(messageId);
  if (!existing || existing.senderId !== uid) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const message = await deleteMessage(messageId);
  return NextResponse.json({ message });
}
