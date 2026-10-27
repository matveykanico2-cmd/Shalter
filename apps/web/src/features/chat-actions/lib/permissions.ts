// Кому какие пункты меню чата — как renderHeader в public/js/views/chatView.js (сервер проверяет то же).
import type { ChatSummary } from "@/entities/chat";
import { isServerModerator, type SelfUser } from "@/entities/session";

/** Служебные аккаунты Shalter — их не удаляют «за нарушение». */
const SERVICE_ACCOUNT_IDS = ["bot_shalter", "bot_helper", "bot_support"];

/** «Удалить за нарушение»: чужая группа или канал, бот (не служебный). */
export function canModerateDelete(chat: ChatSummary, me: SelfUser) {
  if (!isServerModerator(me)) return false;
  if (chat.type === "group" || chat.type === "channel") return chat.ownerId !== me.id;
  const other = chat.otherUser;
  return chat.type === "dm" && !!other?.isBot && !other.isServiceBot && !SERVICE_ACCOUNT_IDS.includes(other.id);
}

/** «Запретить пересылку»: только личка с человеком, не секретная. */
export const canProtect = (chat: ChatSummary) => chat.type === "dm" && !chat.isSaved && !chat.otherUser?.isBot && !chat.secret;
