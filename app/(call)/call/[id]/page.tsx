import { notFound } from "next/navigation";
import { getCall } from "@/lib/data/calls";
import { getChat } from "@/lib/data/chats";
import { listUsers } from "@/lib/data/users";
import { publicUsers } from "@/lib/data/sanitize";
import { getCurrentUserId } from "@/lib/auth";
import { CallScreen } from "@/components/CallScreen";

export default async function CallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const uid = await getCurrentUserId();
  const call = await getCall(id);
  if (!uid || !call || !call.participantIds.includes(uid)) notFound();
  const chat = await getChat(call.chatId);
  const users = await listUsers();
  const participants = publicUsers(
    call.participantIds.map((pid) => users.find((u) => u.id === pid)).filter((u) => u !== undefined)
  );

  return <CallScreen call={call} chatTitle={chat?.title ?? "Звонок"} participants={participants} />;
}
