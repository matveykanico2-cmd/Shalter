import type { contacts, users } from "../../db/schema.js";
import type { toUser } from "../lib/user.mapper.js";

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;

/** Пользователь, как его отдаёт server/data/users.js (rowToUser): со всеми служебными полями. */
export type User = ReturnType<typeof toUser>;

/** Поля, которые меняет updateUser (PATCHABLE_FIELDS в server/data/users.js), — те, что нужны перенесённым модулям. */
export type UserPatch = Partial<
  Pick<
    NewUserRow,
    | "lastName"
    | "email"
    | "passwordHash"
    | "passwordSalt"
    | "cloudPasswordHash"
    | "cloudPasswordSalt"
    | "cloudPasswordHint"
    | "twoFactorMethod"
    | "premiumUntil"
  >
>;

/** Действующая блокировка: клиент показывает причину и срок. */
export interface BanState {
  banReason: string | null;
  bannedAt: string | null;
  bannedUntil: string | null;
}

/** Поля профиля, которые меняет PATCH /api/users/:id (через updateUser в server/data/users.js). */
export interface ProfilePatch {
  name?: string;
  lastName?: string | null;
  username?: string;
  phone?: string;
  bio?: string;
  avatarColor?: string;
  birthday?: string | null;
  businessAddress?: string | null;
  /** Как пришло в запросе: колонка REAL, SQLite сам приводит числовую строку. */
  businessLat?: unknown;
  businessLng?: unknown;
  nameColor?: string | null;
  profileBanner?: { id: string; url?: string } | null;
}

/** Аватарка из списка профиля: url, вид и превью. */
export interface AvatarEntry {
  url: string;
  kind?: string;
  poster?: string;
  [key: string]: unknown;
}

/** Личные пометки чата в настройках: закреплён, в архиве, без звука, «непрочитанный». */
export interface ChatFlags {
  pinned?: boolean;
  archived?: boolean;
  archivedAt?: string;
  muted?: boolean;
  unread?: boolean;
}

/** Настройки пользователя (таблица settings): один JSON на пользователя, как в server/data/settings.js. */
export interface UserSettings {
  chatFlags?: Record<string, ChatFlags>;
  pinnedOrder?: string[];
  pinnedChannelIds?: string[];
  hiddenChats?: Record<string, string>;
  chatWallpapers?: Record<string, unknown>;
  chatClears?: Record<string, string>;
  drafts?: Record<string, unknown>;
  privacy?: { messages?: string; exceptions?: Record<string, { allow?: string[]; deny?: string[] }>; [key: string]: unknown };
  notifications?: { mutedChats?: Record<string, true | string>; previewText?: boolean; sound?: boolean; [key: string]: unknown };
  [key: string]: unknown;
}

/** Строка контакта как в таблице contacts (server/data/contacts.js); заметка зашифрована. */
export type ContactRow = typeof contacts.$inferSelect;
