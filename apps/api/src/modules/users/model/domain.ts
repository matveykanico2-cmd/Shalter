import type { users } from "../../db/schema.js";
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
