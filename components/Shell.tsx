"use client";

import { usePathname } from "next/navigation";
import { NavRail } from "./NavRail";
import { ChatListPane } from "./ChatListPane";
import { IncomingCallWatcher } from "./IncomingCallWatcher";
import { CurrentUserProvider } from "@/lib/client/CurrentUserContext";
import type { ChatSummary } from "@/lib/data/chat-summary";
import type { Folder, PublicUser } from "@/lib/types";

export function Shell({
  user,
  accounts,
  chats,
  folders,
  children,
}: {
  user: PublicUser;
  accounts: PublicUser[];
  chats: ChatSummary[];
  folders: Folder[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const listVisibleOnMobile = pathname === "/";

  return (
    <CurrentUserProvider user={user} accounts={accounts}>
      <IncomingCallWatcher />
      <div className="flex h-screen w-screen overflow-hidden bg-bg">
        <div className={`${listVisibleOnMobile ? "flex w-full md:w-auto" : "hidden"} md:flex`}>
          <NavRail />
          <ChatListPane initialChats={chats} folders={folders} />
        </div>
        <div className={`${listVisibleOnMobile ? "hidden" : "flex"} min-w-0 flex-1 md:flex`}>{children}</div>
      </div>
    </CurrentUserProvider>
  );
}
