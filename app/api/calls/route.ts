import { NextResponse } from "next/server";
import { requireUserId, isResponse } from "@/lib/api-helpers";
import { listCalls, createCall } from "@/lib/data/calls";
import { getChat } from "@/lib/data/chats";
import { listUsers } from "@/lib/data/users";
import { publicUser } from "@/lib/data/sanitize";
import type { Call } from "@/lib/types";

export async function GET() {
  const uid = await requireUserId();
  if (isResponse(uid)) return uid;
  const [calls, users] = await Promise.all([listCalls(uid), listUsers()]);
  const resolved = calls.map((call) => {
    const other = users.find((u) => call.participantIds.includes(u.id) && u.id !== uid);
    return { ...call, otherUser: other ? publicUser(other) : null };
  });
  return NextResponse.json({ calls: resolved });
}

// Places a call (UI-only — no real WebRTC transport, see spec 12).
export async function POST(request: Request) {
  const uid = await requireUserId();
  if (isResponse(uid)) return uid;
  const { chatId, kind } = (await request.json()) as { chatId: string; kind: "audio" | "video" };
  const chat = await getChat(chatId);
  if (!chat || !chat.memberIds.includes(uid)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const call = await createCall({
    id: `cl_${Date.now()}`,
    chatId,
    kind,
    direction: "outgoing",
    callerId: uid,
    participantIds: chat.memberIds,
    status: "ongoing",
    startedAt: new Date().toISOString(),
    durationSec: 0,
  } satisfies Call);
  return NextResponse.json({ call });
}
