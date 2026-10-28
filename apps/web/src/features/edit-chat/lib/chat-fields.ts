import type { chat } from "@shalter/shared/schemas/chat";
import type { z } from "zod";

import type { ChatSummary } from "@/entities/chat";

type Chat = z.infer<typeof chat>;

// Сервер не присылает выключенные флаги (поле пропадает из JSON), поэтому поля
// переносим поимённо: отсутствующее в ответе — undefined, а не прежнее «вкл».
const FIELDS = [
  "title",
  "description",
  "avatarImage",
  "avatarColor",
  "avatarEmoji",
  "isPublic",
  "username",
  "inviteCode",
  "approveJoins",
  "signMessages",
  "anonymousAdmins",
  "commentsOff",
  "allowedReactions",
  "linkedDiscussionChatId",
  "commentPriceStars",
  "permissions",
  "slowModeSeconds",
  "welcomeText",
  "memberIds",
  "membersCount",
  "bannedIds",
] as const satisfies readonly (keyof Chat & keyof ChatSummary)[];

/** Настройки из ответа сервера — для кэша списка и карточки чата. */
export function chatSettingsPatch(updated: Chat): Partial<ChatSummary> {
  return Object.fromEntries(FIELDS.map((k) => [k, updated[k]])) as Partial<ChatSummary>;
}

/** Реакции, разрешённые под постами канала, или null — любые. */
export const allowedReactions = (chat: ChatSummary) =>
  Array.isArray(chat.allowedReactions) ? chat.allowedReactions.filter((e): e is string => typeof e === "string") : null;
