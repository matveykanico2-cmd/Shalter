import { NextResponse } from "next/server";
import { requireUserId, isResponse } from "@/lib/api-helpers";
import { getChat } from "@/lib/data/chats";
import { markTyping, getTypingUserId } from "@/lib/data/typing";

export async function GET(_request: Request, ctx: RouteContext<"/api/chats/[id]/typing">) {
  const uid = await requireUserId();
  if (isResponse(uid)) return uid;
  const { id } = await ctx.params;
  const chat = await getChat(id);
  if (!chat || !chat.memberIds.includes(uid)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ typingUserId: getTypingUserId(id, uid) });
}

export async function POST(_request: Request, ctx: RouteContext<"/api/chats/[id]/typing">) {
  const uid = await requireUserId();
  if (isResponse(uid)) return uid;
  const { id } = await ctx.params;
  const chat = await getChat(id);
  if (!chat || !chat.memberIds.includes(uid)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  markTyping(id, uid);
  return NextResponse.json({ ok: true });
}
