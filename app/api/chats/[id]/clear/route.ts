import { NextResponse } from "next/server";
import { requireUserId, isResponse } from "@/lib/api-helpers";
import { getChat } from "@/lib/data/chats";
import { deleteMessagesForChat } from "@/lib/data/messages";

export async function POST(_request: Request, ctx: RouteContext<"/api/chats/[id]/clear">) {
  const uid = await requireUserId();
  if (isResponse(uid)) return uid;
  const { id } = await ctx.params;
  const chat = await getChat(id);
  if (!chat || !chat.memberIds.includes(uid)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  await deleteMessagesForChat(id);
  return NextResponse.json({ ok: true });
}
