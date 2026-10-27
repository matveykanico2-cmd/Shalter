import type { call, callListItem, iceServer, signal } from "@shalter/shared/schemas/calls";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";

import { http } from "@/shared/api";

export type Call = z.infer<typeof call>;
export type CallListItem = z.infer<typeof callListItem>;
export type Signal = z.infer<typeof signal>;
export type CallKind = "audio" | "video";
/** Участник звонка — имя и аватар из участников чата или профиля. */
export type CallPeer = { id: string; name: string; avatarColor?: string | null; avatarImage?: string | null };

const id = encodeURIComponent;
type CallBody = { call: Call };

const baseKey = ["calls"] as const;

export const callQueries = {
  baseKey,
  /** История звонков (GET /api/calls): исходящие, входящие, пропущенные. */
  history: () =>
    queryOptions({
      queryKey: [...baseKey, "history"],
      queryFn: async ({ signal }) => (await http.get<{ calls: CallListItem[] }>("/api/calls", signal)).calls,
    }),
};

export const callApi = {
  list: () => http.get<{ calls: CallListItem[] }>("/api/calls"),
  /** ringAll — в группе звонят всем участникам. */
  place: (chatId: string, kind: CallKind, ringAll: boolean) => http.post<CallBody>("/api/calls", { chatId, kind, ringAll }),
  answer: (callId: string) => http.post<unknown>(`/api/calls/${id(callId)}/answer`),
  patch: (callId: string, patch: { status: Call["status"]; durationSec?: number }) => http.patch<CallBody>(`/api/calls/${id(callId)}`, patch),
  leave: (callId: string) => http.post<unknown>(`/api/calls/${id(callId)}/leave`),
  addParticipant: (callId: string, userId: string) => http.post<unknown>(`/api/calls/${id(callId)}/participants`, { userId }),
  removeParticipant: (callId: string, userId: string) => http.delete<unknown>(`/api/calls/${id(callId)}/participants/${id(userId)}`),
  inviteLink: (callId: string) => http.post<{ url: string }>(`/api/calls/${id(callId)}/invite-link`),
  joinByLink: (token: string) => http.post<CallBody>(`/api/calls/join/${id(token)}`),
  /** Голосовой чат группы: идёт ли (call или null), войти, выйти. */
  room: (chatId: string) => http.get<{ call: Call | null }>(`/api/calls/room/${id(chatId)}`),
  joinRoom: (chatId: string) => http.post<CallBody>(`/api/calls/room/${id(chatId)}/join`),
  leaveRoom: (chatId: string) => http.post<unknown>(`/api/calls/room/${id(chatId)}/leave`),
  sendSignal: (callId: string, toUserId: string, kind: string, data: unknown) => http.post<unknown>(`/api/calls/${id(callId)}/signal`, { toUserId, kind, data }),
  pollSignals: (callId: string, after: number) => http.get<{ signals: Signal[] }>(`/api/calls/${id(callId)}/signal?after=${after}`),
  iceServers: () => http.get<{ iceServers: z.infer<typeof iceServer>[] }>("/api/calls/ice-servers"),
  chat: (chatId: string) => http.get<{ chat: { title: string | null; type: string }; members: CallPeer[] }>(`/api/chats/${id(chatId)}`),
  user: (userId: string) => http.get<{ user: CallPeer }>(`/api/users/${id(userId)}`),
};
