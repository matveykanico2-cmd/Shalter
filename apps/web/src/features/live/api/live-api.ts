import type { liveChatBody, liveCreateBody, liveMessage, liveParticipant, liveStateBody, liveStream } from "@shalter/shared/schemas/live";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";

import { http } from "@/shared/api";

export type LiveStream = z.infer<typeof liveStream>;
export type LiveParticipant = z.infer<typeof liveParticipant>;
export type LiveMessage = z.infer<typeof liveMessage>;
export type LiveRole = LiveParticipant["role"];
export type LiveSource = LiveStream["source"];
export type LiveStateBody = z.infer<typeof liveStateBody>;
export type ChatLive = z.infer<typeof liveChatBody>;

const id = encodeURIComponent;
const baseKey = ["live"] as const;

export const liveQueries = {
  baseKey,
  /** Идёт ли эфир в чате, сколько смотрят и может ли пользователь начать или завершить его. */
  forChat: (chatId: string) =>
    queryOptions({
      queryKey: [...baseKey, "chat", chatId],
      queryFn: ({ signal }) => http.get<ChatLive>(`/api/live/chat/${id(chatId)}`, signal),
    }),
};

export const liveApi = {
  start: (chatId: string, body: { title: string | null; withVideo: boolean; source: LiveSource }) => http.post<z.infer<typeof liveCreateBody>>("/api/live", { chatId, ...body }),
  get: (streamId: string) => http.get<LiveStateBody>(`/api/live/${id(streamId)}`),
  join: (streamId: string) => http.post<LiveStateBody>(`/api/live/${id(streamId)}/join`),
  leave: (streamId: string) => http.post<unknown>(`/api/live/${id(streamId)}/leave`),
  stop: (streamId: string) => http.post<{ stream: LiveStream }>(`/api/live/${id(streamId)}/stop`),
  raiseHand: (streamId: string, raised: boolean) => http.post<unknown>(`/api/live/${id(streamId)}/hand`, { raised }),
  setRole: (streamId: string, userId: string, role: LiveRole) => http.post<unknown>(`/api/live/${id(streamId)}/participants/${id(userId)}/role`, { role }),
  setMuted: (streamId: string, userId: string, muted: boolean) => http.post<unknown>(`/api/live/${id(streamId)}/participants/${id(userId)}/mute`, { muted }),
  sendMessage: (streamId: string, text: string) => http.post<{ message: LiveMessage }>(`/api/live/${id(streamId)}/messages`, { text }),
  editMessage: (streamId: string, messageId: string, text: string) => http.patch<{ message: LiveMessage }>(`/api/live/${id(streamId)}/messages/${id(messageId)}`, { text }),
  deleteMessage: (streamId: string, messageId: string) => http.delete<unknown>(`/api/live/${id(streamId)}/messages/${id(messageId)}`),
  iceServers: () => http.get<{ iceServers: RTCIceServer[] }>("/api/calls/ice-servers"),
};
