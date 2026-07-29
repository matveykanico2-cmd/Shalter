import { redirect } from "next/navigation";
import { getCurrentUserId, getSessionUserIds } from "@/lib/auth";
import { getUser } from "@/lib/data/users";
import { publicUser, publicUsers } from "@/lib/data/sanitize";
import { listChatsForUser } from "@/lib/data/chats";
import { attachSummaries } from "@/lib/data/chat-summary";
import { listFoldersFor } from "@/lib/data/folders";
import { Shell } from "@/components/Shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const uid = await getCurrentUserId();
  if (!uid) redirect("/login");
  const user = await getUser(uid);
  if (!user) redirect("/login");
  if (!user.name) redirect("/login");

  const [chats, folders, accountIds] = await Promise.all([
    listChatsForUser(uid),
    listFoldersFor(uid),
    getSessionUserIds(),
  ]);
  const withSummary = await attachSummaries(chats, uid);
  const accountUsers = (await Promise.all(accountIds.map((id) => getUser(id)))).filter((u) => u !== undefined);

  return (
    <Shell user={publicUser(user)} accounts={publicUsers(accountUsers)} chats={withSummary} folders={folders}>
      {children}
    </Shell>
  );
}
