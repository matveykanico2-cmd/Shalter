import type {
  adminsBody,
  banPreviewBody,
  bansBody,
  communityBody,
  communityRequestedBody,
  communityRights,
  joinedBody,
  membersBody,
  requestsBody,
  resolveBody,
} from "@shalter/shared/schemas/communities";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";

import { http } from "@/shared/api";

export type Community = z.infer<typeof communityBody>["community"];
export type CommunityChat = Community["chats"][number];
export type JoinedCommunity = z.infer<typeof joinedBody>["communities"][number];
export type CommunityRights = z.infer<typeof communityRights>;
export type CommunityMember = z.infer<typeof membersBody>["users"][number];
export type CommunityAdmin = z.infer<typeof adminsBody>["admins"][number];
export type CommunityBan = z.infer<typeof bansBody>["users"][number];
export type CommunityRequest = z.infer<typeof requestsBody>["requests"][number];
export type AddMode = Community["addMode"];

type Body = z.infer<typeof communityBody>;
const path = (id: string) => `/api/communities/${encodeURIComponent(id)}`;

/** Запросы сообществ — как api.*Community* в public/js/api.js. */
export const communityApi = {
  create: (body: { title: string; description: string; avatarImage: string | null; addMode: AddMode; chatId?: string; chatVisible?: boolean }) =>
    http.post<Body>("/api/communities", body),
  update: (id: string, patch: { title?: string; description?: string; avatarImage?: string | null; addMode?: AddMode }) => http.patch<Body>(path(id), patch),
  remove: (id: string) => http.delete<unknown>(path(id)),
  join: (id: string) => http.post<Body>(`${path(id)}/join`),
  leave: (id: string) => http.post<unknown>(`${path(id)}/leave`),
  prefs: (id: string, prefs: { pinned?: boolean; collapsed?: boolean }) => http.post<Body>(`${path(id)}/prefs`, prefs),
  mute: (id: string, opts: { hours?: number; forever?: boolean; off?: boolean }) => http.post<unknown>(`${path(id)}/mute`, opts),
  read: (id: string) => http.post<unknown>(`${path(id)}/read`),
  members: (id: string, q = "") => http.get<z.infer<typeof membersBody>>(`${path(id)}/members?q=${encodeURIComponent(q)}`),
  addChat: (id: string, chatId: string, visible = true) => http.post<Body | z.infer<typeof communityRequestedBody>>(`${path(id)}/chats`, { chatId, visible }),
  setChatVisible: (id: string, chatId: string, visible: boolean) => http.patch<Body>(`${path(id)}/chats/${encodeURIComponent(chatId)}`, { visible }),
  removeChat: (id: string, chatId: string) => http.delete<unknown>(`${path(id)}/chats/${encodeURIComponent(chatId)}`),
  requests: (id: string) => http.get<z.infer<typeof requestsBody>>(`${path(id)}/requests`),
  resolveRequest: (id: string, requestId: string, approve: boolean) => http.post<z.infer<typeof resolveBody>>(`${path(id)}/requests/${encodeURIComponent(requestId)}`, { approve }),
  admins: (id: string) => http.get<z.infer<typeof adminsBody>>(`${path(id)}/admins`),
  setAdmin: (id: string, userId: string, rights: CommunityRights) => http.put<unknown>(`${path(id)}/admins/${encodeURIComponent(userId)}`, { rights }),
  removeAdmin: (id: string, userId: string) => http.delete<unknown>(`${path(id)}/admins/${encodeURIComponent(userId)}`),
  bans: (id: string) => http.get<z.infer<typeof bansBody>>(`${path(id)}/bans`),
  banPreview: (id: string, userId: string) => http.get<z.infer<typeof banPreviewBody>>(`${path(id)}/bans/${encodeURIComponent(userId)}/preview`),
  ban: (id: string, userId: string) => http.put<unknown>(`${path(id)}/bans/${encodeURIComponent(userId)}`),
  unban: (id: string, userId: string) => http.delete<unknown>(`${path(id)}/bans/${encodeURIComponent(userId)}`),
  /** Вступить в открытый чат сообщества: сразу или заявкой (approveJoins). */
  joinChat: (chatId: string) => http.post<{ chat: unknown } | { pending: true }>(`/api/chats/${encodeURIComponent(chatId)}/join`),
};

const baseKey = ["communities"] as const;

export const communityQueries = {
  baseKey,
  /** Сообщества, где я участник (GET /api/communities/joined) — строки в списке чатов. */
  joined: () =>
    queryOptions({
      queryKey: [...baseKey, "joined"],
      queryFn: async ({ signal }) => (await http.get<z.infer<typeof joinedBody>>("/api/communities/joined", signal)).communities,
    }),
  /** Сообщество целиком: чаты, права, счётчики (GET /api/communities/:id). */
  detail: (id: string) =>
    queryOptions({
      queryKey: [...baseKey, "detail", id],
      queryFn: async ({ signal }) => (await http.get<Body>(path(id), signal)).community,
      staleTime: 0,
      retry: false,
    }),
};
