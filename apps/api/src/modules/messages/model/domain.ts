import type { Attachment } from "../../../legacy/legacy.js";
import type { messages } from "../../db/schema.js";

export type MessageRow = typeof messages.$inferSelect;

export interface Reaction {
  emoji: string;
  userIds: string[];
}

/** «Переслано от …»: подпись берётся из исходного сообщения, linkAllowed — можно ли открыть автора. */
export interface ForwardedFrom {
  chatId?: string;
  chatTitle?: string;
  senderId?: string;
  senderName?: string;
  linkAllowed?: boolean;
  [key: string]: unknown;
}

/** Сообщение, как его отдаёт server/data/messages.js (rowToMessage): текст уже расшифрован. */
export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  type: string;
  text: string;
  createdAt: string;
  editedAt?: string;
  pinned: boolean;
  replyToId: string | null;
  forwardedFrom?: ForwardedFrom;
  attachments?: Attachment[];
  keyboard?: unknown;
  gift?: { name?: string } & Record<string, unknown>;
  sticker?: { kind?: string; url?: string; emoji?: string } & Record<string, unknown>;
  customEmoji?: unknown;
  linkPreview?: unknown;
  report?: unknown;
  reactions: Reaction[];
  readByIds: string[];
  deletedForIds: string[];
  mentionedUserIds: string[];
  threadRootId?: string;
  topicId?: string;
  readAt?: string;
  effect?: string;
  visibleToId?: string;
  storyReply?: unknown;
  anchorForPostId?: string;
  discussionAnchorId?: string;
  signedBy?: string;
  anonymous?: true;
  boostedUntil?: string;
  paidStars?: number;
  boostedById?: string;
  views: number;
  commentCount?: number;
}

/** Новое сообщение (addMessage в server/data/messages.js); null и undefined — пусто. */
export interface NewMessage {
  id: string;
  chatId: string;
  senderId: string;
  type?: string;
  text?: string;
  createdAt: string;
  editedAt?: string | null;
  pinned?: boolean;
  replyToId?: string | null;
  forwardedFrom?: ForwardedFrom;
  attachments?: Attachment[];
  keyboard?: unknown;
  gift?: unknown;
  sticker?: unknown;
  customEmoji?: unknown;
  report?: unknown;
  reactions?: Reaction[];
  readByIds?: string[];
  deletedForIds?: string[];
  mentionedUserIds?: string[];
  threadRootId?: string | null;
  topicId?: string | null;
  storyReply?: unknown;
  anchorForPostId?: string | null;
  discussionAnchorId?: string | null;
  signedBy?: string | null;
  views?: number;
  commentCount?: number;
  paidStars?: number;
  anonymous?: boolean;
  effect?: string | null;
  visibleToId?: string | null;
}

/** Страница истории: от старых к новым; hasMore — есть ли сообщения раньше. */
export interface MessagesPage {
  messages: Message[];
  hasMore: boolean;
}

/** Кто прочитал сообщение; readAt — null, если время не записано. */
export interface ReadMark {
  userId: string;
  readAt: string | null;
}

/** Ссылки на файлы удалённого сообщения — для отзыва доступа (revokeAttachments). */
export interface DeletedMessageRefs {
  chatId: string;
  attachments: string | null;
  sticker: string | null;
}

/** Платный пост (таблица paid_media): настоящие вложения и цена, как в server/data/paidMedia.js. */
export interface PaidMediaRecord {
  messageId: string;
  chatId: string;
  stars: number;
  attachments: Attachment[];
  createdAt: string;
}

/** Отложенное сообщение с открытым текстом — как rowToScheduled в server/data/scheduledMessages.js. */
export interface ScheduledMessage {
  id: string;
  chatId: string;
  senderId: string;
  text: string;
  attachments: Attachment[] | undefined;
  replyToId: string | null;
  topicId: string | null;
  repeat: string | null;
  sendAt: string;
  createdAt: string;
}

/** Одна платная звёздная реакция: пользователь и сколько звёзд потратил. */
export interface StarReactionEntry {
  userId: string;
  amount: number;
}
