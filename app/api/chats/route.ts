import { NextResponse } from "next/server";
import { requireUserId, isResponse } from "@/lib/api-helpers";
import { listChatsForUser, createChat, listChats } from "@/lib/data/chats";
import { attachSummaries } from "@/lib/data/chat-summary";
import type { Chat } from "@/lib/types";

export async function GET() {
  const uid = await requireUserId();
  if (isResponse(uid)) return uid;
  const chats = await listChatsForUser(uid);
  const withSummary = await attachSummaries(chats, uid);
  return NextResponse.json({ chats: withSummary });
}

// Start a new DM (or return the existing one) — used from Contacts.
export async function POST(request: Request) {
  const uid = await requireUserId();
  if (isResponse(uid)) return uid;
  const { userId, title, avatarColor } = (await request.json()) as {
    userId: string;
    title: string;
    avatarColor: string;
  };

  const existing = (await listChats()).find(
    (c) => c.type === "dm" && c.memberIds.includes(uid) && c.memberIds.includes(userId)
  );
  if (existing) return NextResponse.json({ chat: existing });

  const chat = await createChat({
    id: `c_${Date.now()}`,
    type: "dm",
    title,
    avatarColor,
    memberIds: [uid, userId],
    pinned: false,
    muted: false,
    archived: false,
    createdAt: new Date().toISOString(),
  } satisfies Chat);

  return NextResponse.json({ chat });
}
