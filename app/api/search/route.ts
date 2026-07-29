import { NextResponse } from "next/server";
import { requireUserId, isResponse } from "@/lib/api-helpers";
import { listChatsForUser } from "@/lib/data/chats";
import { listAllMessages } from "@/lib/data/messages";
import { listUsers } from "@/lib/data/users";
import { publicUsers } from "@/lib/data/sanitize";

export async function GET(request: Request) {
  const uid = await requireUserId();
  if (isResponse(uid)) return uid;
  const q = new URL(request.url).searchParams.get("q")?.trim().toLowerCase() ?? "";
  if (!q) return NextResponse.json({ chats: [], users: [], messages: [] });

  const [chats, users, messages] = await Promise.all([
    listChatsForUser(uid),
    listUsers(),
    listAllMessages(),
  ]);

  const matchedChats = chats.filter((c) => c.title.toLowerCase().includes(q));
  const matchedUsers = users.filter(
    (u) => u.id !== uid && (u.name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q))
  );
  const chatIds = new Set(chats.map((c) => c.id));
  const matchedMessages = messages
    .filter((m) => chatIds.has(m.chatId) && !m.deleted && m.text.toLowerCase().includes(q))
    .slice(-20);

  return NextResponse.json({ chats: matchedChats, users: publicUsers(matchedUsers), messages: matchedMessages });
}
