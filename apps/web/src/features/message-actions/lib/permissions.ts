// Кому что можно с сообщением — как MessageBubble и обработчики в
// public/js/views/chatView.js (сервер проверяет то же самое).
import { type ChatSummary, isChatAdmin, isChatModerator } from "@/entities/chat";
import { isCallLogMessage, type Message } from "@/entities/message";
import type { SelfUser } from "@/entities/session";

export const isServerModerator = (me: SelfUser) => !!me.isDeveloper || (me.adminSections ?? []).includes("moderation");

const isStaff = (chat: ChatSummary, meId: string) => isChatAdmin(chat, meId) || isChatModerator(chat, meId);

/** Пересылать и копировать нельзя: секретный чат или личка с запретом. */
export const isProtectedChat = (chat: ChatSummary) => (chat.type === "dm" && (chat.protectedBy ?? []).length > 0) || !!chat.secret;

export const canPin = (chat: ChatSummary, meId: string) => chat.type === "dm" || isStaff(chat, meId);

export const canEdit = (m: Message, meId: string) =>
  m.senderId === meId && m.type !== "sticker" && m.type !== "gift" && !isCallLogMessage(m) && !m.forwardedFrom;

/** Подарок удалить нельзя никому (server/routes/messages.js). */
export const canDelete = (m: Message) => m.type !== "gift";

export function deleteOptions(chat: ChatSummary, m: Message, me: SelfUser) {
  const isDm = chat.type === "dm";
  const mine = m.senderId === me.id || (!isDm && isChatAdmin(chat, me.id)) || isChatModerator(chat, me.id);
  return { canDeleteForEveryone: mine || isDm || isStaff(chat, me.id) || isServerModerator(me), someoneElses: !mine };
}

/** Реакции в чате: null — любые, массив — только эти (пустой — выключены). */
export function allowedReactions(chat: ChatSummary): string[] | null {
  return Array.isArray(chat.allowedReactions) ? (chat.allowedReactions as string[]) : null;
}

export const canReact = (chat: ChatSummary, m: Message) => m.type !== "gift" && !isCallLogMessage(m) && allowedReactions(chat)?.length !== 0;

/** «Перевести» — у текста, кроме стикера, подарка и опроса (его текст — вопрос). */
export const canTranslate = (m: Message) =>
  m.type !== "sticker" && m.type !== "gift" && !!m.text?.trim() && !m.attachments?.some((a) => (a as { kind?: string }).kind === "poll");

/** Сводка длиннее 400 знаков; в секретном и защищённом чате — нет. */
export const SUMMARY_MIN_CHARS = 400;
export const canSummarize = (m: Message, protectedContent: boolean) => m.type !== "gift" && (m.text ?? "").length >= SUMMARY_MIN_CHARS && !protectedContent;
