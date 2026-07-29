import { NextResponse } from "next/server";
import { requireUserId, isResponse } from "@/lib/api-helpers";
import { getChat, updateChat } from "@/lib/data/chats";

export async function POST(request: Request, ctx: RouteContext<"/api/chats/[id]/members">) {
  const uid = await requireUserId();
  if (isResponse(uid)) return uid;
  const { id } = await ctx.params;
  const chat = await getChat(id);
  if (!chat || !chat.memberIds.includes(uid)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const isOwnerOrAdmin = chat.ownerId === uid || chat.adminIds?.includes(uid);
  if (!isOwnerOrAdmin) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const { userId, role } = (await request.json()) as { userId: string; role: "kick" | "promote" | "demote" };
  if (userId === chat.ownerId) {
    return NextResponse.json({ error: "Нельзя изменить владельца" }, { status: 400 });
  }

  if (role === "kick") {
    const updated = await updateChat(id, {
      memberIds: chat.memberIds.filter((m) => m !== userId),
      adminIds: chat.adminIds?.filter((m) => m !== userId),
    });
    return NextResponse.json({ chat: updated });
  }
  if (role === "promote") {
    const admins = new Set(chat.adminIds ?? []);
    admins.add(userId);
    const updated = await updateChat(id, { adminIds: [...admins] });
    return NextResponse.json({ chat: updated });
  }
  if (role === "demote") {
    const updated = await updateChat(id, { adminIds: (chat.adminIds ?? []).filter((m) => m !== userId) });
    return NextResponse.json({ chat: updated });
  }
  return NextResponse.json({ error: "unknown role" }, { status: 400 });
}
