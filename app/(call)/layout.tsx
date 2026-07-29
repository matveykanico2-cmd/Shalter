import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/auth";
import { CurrentUserProvider } from "@/lib/client/CurrentUserContext";
import { getUser } from "@/lib/data/users";
import { publicUser } from "@/lib/data/sanitize";

export default async function CallLayout({ children }: { children: React.ReactNode }) {
  const uid = await getCurrentUserId();
  if (!uid) redirect("/login");
  const user = await getUser(uid);
  if (!user) redirect("/login");
  return (
    <CurrentUserProvider user={publicUser(user)} accounts={[publicUser(user)]}>
      <div className="h-screen w-screen bg-[#0b0d12]">{children}</div>
    </CurrentUserProvider>
  );
}
