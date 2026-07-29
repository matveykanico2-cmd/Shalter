import { getCurrentUserId } from "@/lib/auth";
import { listChatsForUser } from "@/lib/data/chats";
import { attachSummaries } from "@/lib/data/chat-summary";
import { ArchiveView } from "@/components/ArchiveView";

export default async function ArchivePage() {
  const uid = await getCurrentUserId();
  const chats = uid ? await listChatsForUser(uid) : [];
  const archived = (await attachSummaries(chats, uid ?? "")).filter((c) => c.archived);
  return <ArchiveView initialChats={archived} />;
}
