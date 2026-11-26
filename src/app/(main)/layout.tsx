import { redirect } from "next/navigation";
import { AppProvider } from "@/components/app-context";
import { Shell } from "@/components/shell";
import type { Me } from "@/lib/types";

// Every page in this group needs a logged-in user.
export default async function MainLayout({ children }: LayoutProps<"/">) {
  const { currentUser } = await import("@/lib/server/auth");
  const user = await currentUser();
  if (!user) redirect("/accounts/login");
  const me: Me = {
    id: user.id,
    username: user.username,
    name: user.name,
    lastName: user.last_name,
    avatar: user.avatar,
    verified: !!user.verified,
    email: user.email,
    phone: user.phone,
    bio: user.bio,
    website: user.website,
    privateAccount: !!user.private_account,
    showActivity: !!user.show_activity,
    allowMessages: !!user.allow_messages,
  };
  return (
    <AppProvider initialMe={me}>
      <Shell>{children}</Shell>
    </AppProvider>
  );
}
