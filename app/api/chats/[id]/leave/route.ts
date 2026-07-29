import { NextResponse } from "next/server";
import { requireUserId, isResponse } from "@/lib/api-helpers";
import { getChat, updateChat, deleteChat } from "@/lib/data/chats";
import { deleteMessagesForChat } from "@/lib/data/messages";

// Leaving a group/channel removes you from the member list; if you were
// the last member, the chat (and its history) is cleaned up entirely.
export async function POST(_request: Request, ctx: RouteContext<"/api/chats/[id]/leave">) {
  const uid = await requireUserId();
  if (isResponse(uid)) return uid;
  const { id } = await ctx.params;
  const chat = await getChat(id);
  if (!chat || !chat.memberIds.includes(uid)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const memberIds = chat.memberIds.filter((m) => m !== uid);
  const adminIds = chat.adminIds?.filter((m) => m !== uid);

  if (memberIds.length === 0) {
    await deleteMessagesForChat(id);
    await deleteChat(id);
    return NextResponse.json({ ok: true, deleted: true });
  }

  await updateChat(id, {
    memberIds,
    adminIds,
    ownerId: chat.ownerId === uid ? memberIds[0] : chat.ownerId,
  });
  return NextResponse.json({ ok: true, deleted: false });
}
