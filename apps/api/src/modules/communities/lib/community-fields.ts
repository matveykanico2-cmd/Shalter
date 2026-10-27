import { isSafeUrl } from "../../../legacy/legacy.js";
import type { Chat } from "../../chats/model/domain.js";

// Поля сообщества из запроса — как в server/routes/communities.js.
export const cleanTitle = (raw: unknown): string => String(raw ?? "").trim().slice(0, 128);
export const cleanDescription = (raw: unknown): string => String(raw ?? "").trim().slice(0, 255);
export const cleanAddMode = (raw: unknown): "all" | "admins" | undefined => (raw === "admins" ? "admins" : raw === "all" ? "all" : undefined);

/** true/false из булева, 0/1 или строки; иначе undefined. */
export function cleanVisible(raw: unknown): boolean | undefined {
  if (raw === false || raw === 0 || raw === "false" || raw === "0") return false;
  if (raw === true || raw === 1 || raw === "true" || raw === "1") return true;
  return undefined;
}

/** Аватар — data-URL, ссылка на загрузку или внешний https; пусто — null, иначе undefined (не принимаем). */
export function cleanAvatarImage(raw: unknown): string | null | undefined {
  if (raw == null || raw === "") return null;
  return typeof raw === "string" && isSafeUrl(raw) ? raw : undefined;
}

/** Владелец или админ чата (модераторов не считаем). */
export const isChatAdmin = (chat: Chat, uid: string): boolean =>
  chat.ownerId === uid || (chat.ownerIds ?? []).includes(uid) || (chat.adminIds ?? []).includes(uid);

export const kindOf = (chat: Chat): string => (chat.type === "channel" ? "Канал" : "Группа");
