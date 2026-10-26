// Подпись под названием чата — как renderHeader в public/js/views/chatView.js.
import type { ChatMember, ChatSummary, Typing } from "@/entities/chat";

import { plural, statusLabel } from "@/shared/lib/presence";

/** public/js/lib/chatAction.js */
export const CHAT_ACTION_LABELS: Record<string, string> = {
  typing: "печатает",
  choose_sticker: "выбирает стикер",
  upload_photo: "отправляет фото",
  record_video: "записывает видео",
  upload_video: "отправляет видео",
  record_voice: "записывает голосовое",
  upload_voice: "отправляет голосовое",
  upload_document: "отправляет файл",
  record_video_note: "записывает кружок",
  upload_video_note: "отправляет кружок",
};

type Subtitle = { text: string; tone: "typing" | "online" | "muted" };

/** botUsers — сколько людей пользуется ботом (GET /api/bots/audience/:id). */
export function chatSubtitle(chat: ChatSummary, members: readonly ChatMember[], meId: string, typing: Typing, now = new Date(), botUsers: number | null = null): Subtitle {
  const isDm = chat.type === "dm";
  const other = chat.otherUser;
  if (typing) {
    const label = CHAT_ACTION_LABELS[typing.action] ?? CHAT_ACTION_LABELS.typing!;
    if (isDm) return { text: `${label}…`, tone: "typing" };
    const typist = members.find((u) => u.id === typing.userId);
    if (typist) return { text: `${typist.name} ${label}…`, tone: "typing" };
  }
  if (chat.isSaved) return { text: "", tone: "muted" };
  if (chat.type === "bot" || (isDm && other?.isBot)) {
    return { text: botUsers == null ? "бот" : `бот · ${botUsers} ${plural(botUsers, "пользователь", "пользователя", "пользователей")}`, tone: "muted" };
  }
  if (isDm && other) {
    const label = statusLabel(other, now);
    return { text: label ?? "был(а) недавно", tone: label === "в сети" ? "online" : "muted" };
  }
  if (chat.type === "group") {
    const n = members.length || chat.memberIds.length;
    const base = `${n} ${plural(n, "участник", "участника", "участников")}`;
    const online = members.filter((u) => u.id !== meId && u.online).length;
    return { text: online > 0 ? `${base}, ${online} в сети` : base, tone: "muted" };
  }
  if (chat.type === "channel") {
    const n = chat.membersCount ?? members.length;
    return { text: `${n} ${plural(n, "подписчик", "подписчика", "подписчиков")}`, tone: "muted" };
  }
  return { text: "", tone: "muted" };
}
