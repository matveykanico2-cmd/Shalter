import { notFound } from "next/navigation";
import { getCurrentUserId } from "@/lib/auth";
import { getChat } from "@/lib/data/chats";
import { attachSummaries } from "@/lib/data/chat-summary";
import { listMessages } from "@/lib/data/messages";
import { listUsers } from "@/lib/data/users";
import { publicUsers } from "@/lib/data/sanitize";
import { getBotByUserId } from "@/lib/data/bots";
import { ChatView } from "@/components/chat/ChatView";

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const uid = await getCurrentUserId();
  const chat = await getChat(id);
  if (!uid || !chat || !chat.memberIds.includes(uid)) notFound();

  const [summary] = await attachSummaries([chat], uid);
  const users = await listUsers();
  const members = publicUsers(
    chat.memberIds.map((mid) => users.find((u) => u.id === mid)).filter((u) => u !== undefined)
  );
  const messages = await listMessages(id);
  const otherUserId =
    (chat.type === "dm" || chat.type === "secret" || chat.type === "bot") &&
    chat.memberIds.find((m) => m !== uid);
  const bot = otherUserId ? await getBotByUserId(otherUserId) : undefined;

  return <ChatView key={id} chat={summary} members={members} initialMessages={messages} bot={bot ?? null} />;
}
