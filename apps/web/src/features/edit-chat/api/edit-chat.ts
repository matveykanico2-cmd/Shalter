import type {
  bannedBody,
  chatBody,
  featuresBody,
  inviteCreateBody,
  joinDecisionBody,
  joinRequestsBody,
  permissionsBody,
  setPermissionsBody,
  slowModeBody,
  welcomeBody,
} from "@shalter/shared/schemas/chats";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";

import { http } from "@/shared/api";

const chatPath = (chatId: string) => `/api/chats/${encodeURIComponent(chatId)}`;
const baseKey = (chatId: string) => ["chat-admin", chatId] as const;
// Заявки, баны, права меняют и другие админы, а событий об этом нет — как в старом
// клиенте, при каждом открытии редактора загружаем заново.
const staleTime = 0;

export type ChatPermissions = z.infer<typeof permissionsBody>["permissions"];
export type JoinRequest = z.infer<typeof joinRequestsBody>["requests"][number];
export type BannedUser = z.infer<typeof bannedBody>["users"][number];
export type ChatColor = z.infer<typeof featuresBody>["colors"][number];

export const editChatQueries = {
  baseKey,
  /** Что могут участники группы и подписи к флагам (GET /:id/permissions). */
  permissions: (chatId: string) =>
    queryOptions({
      queryKey: [...baseKey(chatId), "permissions"],
      staleTime,
      queryFn: ({ signal }) => http.get<z.infer<typeof permissionsBody>>(`${chatPath(chatId)}/permissions`, signal),
    }),
  joinRequests: (chatId: string) =>
    queryOptions({
      queryKey: [...baseKey(chatId), "join-requests"],
      staleTime,
      queryFn: async ({ signal }) => (await http.get<z.infer<typeof joinRequestsBody>>(`${chatPath(chatId)}/join-requests`, signal)).requests,
    }),
  banned: (chatId: string) =>
    queryOptions({
      queryKey: [...baseKey(chatId), "banned"],
      staleTime,
      queryFn: async ({ signal }) => (await http.get<z.infer<typeof bannedBody>>(`${chatPath(chatId)}/banned`, signal)).users,
    }),
  /** Цвета, открытые бустами (GET /:id/features). */
  colors: (chatId: string) =>
    queryOptions({
      queryKey: [...baseKey(chatId), "colors"],
      staleTime,
      queryFn: async ({ signal }) => (await http.get<z.infer<typeof featuresBody>>(`${chatPath(chatId)}/features`, signal)).colors,
    }),
};

export type ChatProfilePatch = { title?: string; description?: string; avatarImage?: string | null; avatarColor?: string | null };

export const patchChatProfile = (chatId: string, patch: ChatProfilePatch) => http.patch<z.infer<typeof chatBody>>(chatPath(chatId), patch);

export const setChatPublic = (chatId: string, isPublic: boolean, username: string) =>
  http.post<z.infer<typeof chatBody>>(`${chatPath(chatId)}/public`, { isPublic, username });

/** revoke — старая ссылка перестаёт работать, создаётся новая. */
export const createInviteLink = (chatId: string, revoke: boolean) => http.post<z.infer<typeof inviteCreateBody>>(`${chatPath(chatId)}/invite`, { revoke });

export type ChatSettingsPatch = { approveJoins?: boolean; signMessages?: boolean; anonymousAdmins?: boolean };

export const setChatSettings = (chatId: string, patch: ChatSettingsPatch) => http.post<z.infer<typeof chatBody>>(`${chatPath(chatId)}/settings`, patch);

export const setChatPermissions = (chatId: string, permissions: ChatPermissions) =>
  http.post<z.infer<typeof setPermissionsBody>>(`${chatPath(chatId)}/permissions`, { permissions });

export const setSlowMode = (chatId: string, seconds: number) => http.post<z.infer<typeof slowModeBody>>(`${chatPath(chatId)}/slow-mode`, { seconds });

/** Пустой текст выключает приветствие. */
export const setWelcomeText = (chatId: string, text: string) => http.post<z.infer<typeof welcomeBody>>(`${chatPath(chatId)}/welcome`, { text });

export const decideJoinRequest = (chatId: string, userId: string, approve: boolean) =>
  http.post<z.infer<typeof joinDecisionBody>>(`${chatPath(chatId)}/join-requests/${encodeURIComponent(userId)}`, { approve });

export const unbanMember = (chatId: string, userId: string) => http.post<z.infer<typeof chatBody>>(`${chatPath(chatId)}/members`, { userId, role: "unban" });
