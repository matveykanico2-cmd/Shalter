import type { MenuItem } from "@/shared/ui";

import { askLiveSource } from "./live-store";
import { useChatLive } from "./use-chat-live";

/** «Начать эфир» в меню «Ещё» группы или канала — кто может вести и пока эфир не идёт. */
export function useStartLiveItem({ chat, meId }: { chat: { id: string; type: string; title: string | null }; meId: string }): MenuItem | null {
  const info = useChatLive(chat);
  if (!info?.canHost || info.stream) return null;
  return { icon: "Video", label: "Начать эфир", onClick: () => askLiveSource(chat.id, chat.title, meId) };
}
