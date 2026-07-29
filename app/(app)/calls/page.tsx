import { getCurrentUserId } from "@/lib/auth";
import { listCalls } from "@/lib/data/calls";
import { listUsers } from "@/lib/data/users";
import { publicUser } from "@/lib/data/sanitize";
import { CallsView } from "@/components/CallsView";

export default async function CallsPage() {
  const uid = await getCurrentUserId();
  const [calls, users] = await Promise.all([listCalls(uid ?? ""), listUsers()]);
  const resolved = calls.map((c) => {
    const other = users.find((u) => c.participantIds.includes(u.id) && u.id !== uid);
    return { ...c, otherUser: other ? publicUser(other) : null };
  });
  return <CallsView initialCalls={resolved} />;
}
