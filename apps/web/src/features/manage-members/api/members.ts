import type { chatBody } from "@shalter/shared/schemas/chats";
import type { z } from "zod";

import { http } from "@/shared/api";

/** promote/demote, mod/unmod, owner/unowner, transfer, add, kick, ban. */
export type MemberRole = "promote" | "demote" | "mod" | "unmod" | "owner" | "unowner" | "transfer" | "add" | "kick" | "ban";

const chatPath = (chatId: string) => `/api/chats/${encodeURIComponent(chatId)}`;

export const setMemberRole = (chatId: string, userId: string, role: MemberRole) =>
  http.post<z.infer<typeof chatBody>>(`${chatPath(chatId)}/members`, { userId, role });

/** Пустой тег — обычная роль. */
export const setMemberTitle = (chatId: string, userId: string, title: string) =>
  http.post<z.infer<typeof chatBody>>(`${chatPath(chatId)}/title`, { userId, title });

/** until: ISO-время, "forever" или null — снова может писать. */
export const restrictMember = (chatId: string, userId: string, until: string | null) =>
  http.post<z.infer<typeof chatBody>>(`${chatPath(chatId)}/restrict`, { userId, until });

export const MEMBER_PERMISSION_FIELDS = [
  { id: "sendMessages", label: "Отправлять сообщения" },
  { id: "sendMedia", label: "Отправлять фото и файлы" },
  { id: "sendStickers", label: "Отправлять стикеры и подарки" },
  { id: "sendPolls", label: "Создавать опросы" },
  { id: "addMembers", label: "Добавлять участников" },
  { id: "pinMessages", label: "Закреплять сообщения" },
  { id: "createTopics", label: "Создавать темы" },
  { id: "setOwnTag", label: "Ставить себе тег" },
  { id: "commentPosts", label: "Оставлять комментарии" },
  { id: "publishPosts", label: "Публиковать в канале" },
  { id: "editMessages", label: "Редактировать свои сообщения" },
  { id: "deleteMessages", label: "Удалять свои сообщения" },
] as const;
export type MemberPermission = (typeof MEMBER_PERMISSION_FIELDS)[number]["id"];
export type MemberPermissions = Record<MemberPermission, boolean>;
export const setMemberPermissions = (chatId: string, userId: string, permissions: MemberPermissions) =>
  http.post<z.infer<typeof chatBody>>(`${chatPath(chatId)}/member-permissions`, { userId, permissions });

