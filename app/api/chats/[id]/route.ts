import { NextResponse } from "next/server";
import { requireUserId, isResponse } from "@/lib/api-helpers";
import { getChat, updateChat, deleteChat } from "@/lib/data/chats";
import { deleteMessagesForChat } from "@/lib/data/messages";
import { attachSummaries } from "@/lib/data/chat-summary";
import { listUsers } from "@/lib/data/users";
import { publicUser } from "@/lib/data/sanitize";

export async function GET(_request: Request, ctx: RouteContext<"/api/chats/[id]">) {
  const uid = await requireUserId();
  if (isResponse(uid)) return uid;
  const { id } = await ctx.params;
  const chat = await getChat(id);
  if (!chat || !chat.memberIds.includes(uid)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const [summary] = await attachSummaries([chat], uid);
  const users = await listUsers();
  const members = chat.memberIds
    .map((mid) => users.find((u) => u.id === mid))
    .filter((u) => u !== undefined)
    .map(publicUser);
  return NextResponse.json({ chat: summary, members });
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/chats/[id]">) {
  const uid = await requireUserId();
  if (isResponse(uid)) return uid;
  const { id } = await ctx.params;
  const chat = await getChat(id);
  if (!chat || !chat.memberIds.includes(uid)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const patch = await request.json();
  const updated = await updateChat(id, patch);
  return NextResponse.json({ chat: updated });
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/chats/[id]">) {
  const uid = await requireUserId();
  if (isResponse(uid)) return uid;
  const { id } = await ctx.params;
  const chat = await getChat(id);
  if (!chat || !chat.memberIds.includes(uid)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  await deleteMessagesForChat(id);
  await deleteChat(id);
  return NextResponse.json({ ok: true });
}
