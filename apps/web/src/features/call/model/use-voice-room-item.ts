import type { ChatSummary } from "@/entities/chat";

import type { MenuItem } from "@/shared/ui";

import type { CallPeer } from "../api/call-api";

import { useStartCall } from "./use-start-call";
import { useVoiceRoom } from "./use-voice-room";

/** «Начать голосовой чат» в меню «Ещё» группы, пока он не идёт. */
export function useVoiceRoomItem({ chat, me }: { chat: ChatSummary; me: CallPeer }): MenuItem | null {
  const start = useStartCall(me);
  const group = chat.type === "group";
  const room = useVoiceRoom(chat.id, group);
  return group && !room ? { icon: "Phone", label: "Начать голосовой чат", onClick: () => void start.joinRoom(chat.id) } : null;
}
