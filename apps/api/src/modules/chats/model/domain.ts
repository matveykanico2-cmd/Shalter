import type { chatAdminLog, chatMembers, chats } from "../../db/schema.js";
import type { ChatType, Restrictions, toChat } from "../lib/chat.mapper.js";

export type ChatRow = typeof chats.$inferSelect;
export type NewChatRow = typeof chats.$inferInsert;
export type ChatMemberRow = typeof chatMembers.$inferSelect;
export type AdminLogRow = typeof chatAdminLog.$inferSelect;

/** Чат, как его отдаёт server/data/chats.js (rowToChat): с участниками и их ролями. */
export type Chat = ReturnType<typeof toChat>;

/** Новый чат (createChat в server/data/chats.js). Роли без ownerIds — владелец ownerId. */
export interface NewChat {
  id: string;
  type: ChatType;
  title?: string;
  description?: string | null;
  username?: string | null;
  isPublic?: boolean;
  avatarColor?: string;
  avatarImage?: string;
  ownerId?: string;
  memberIds: string[];
  adminIds?: string[];
  pinned: boolean;
  muted: boolean;
  archived: boolean;
  createdAt: string;
  linkedDiscussionChatId?: string;
  /** Секретный чат: свой ключ и привязка к устройству — { userId: device_id }. */
  secret?: boolean;
  secretDevices?: Record<string, string>;
}

/** Правка чата (updateChat в server/data/chats.js); null — очистить поле. */
export interface ChatPatch {
  title?: string;
  description?: string | null;
  username?: string | null;
  isPublic?: boolean;
  avatarColor?: string;
  avatarImage?: string | null;
  ownerId?: string;
  linkedDiscussionChatId?: string | null;
  points?: number;
  autoDeleteSeconds?: number | null;
  inviteCode?: string;
  slowModeSeconds?: number | null;
  commentPriceStars?: number;
  approveJoins?: boolean;
  signMessages?: boolean;
  commentsOff?: boolean;
  anonymousAdmins?: boolean;
  welcomeText?: string | null;
  memberIds?: string[];
  adminIds?: string[];
  moderatorIds?: string[];
  ownerIds?: string[];
  permissions?: Record<string, boolean> | null;
  memberTitles?: Record<string, string>;
  restrictions?: Restrictions;
  votes?: Record<string, string>;
  protectedBy?: string[];
  bannedIds?: string[];
  wallpaper?: unknown;
  allowedReactions?: string[] | null;
}

/** Запись журнала действий администраторов. */
export interface AdminLogEntry {
  id: number;
  actorId: string;
  action: string;
  targetId?: string;
  details?: unknown;
  createdAt: string;
}
