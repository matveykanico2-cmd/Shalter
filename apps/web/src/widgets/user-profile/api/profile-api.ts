import type { chatBody } from "@shalter/shared/schemas/chats";
import type { blockBody, channelCard, commonChatsBody, pinnableChannelsBody, pinnedChannelsBody, sharedMediaBody } from "@shalter/shared/schemas/users";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";

import { http } from "@/shared/api";

export type SharedMedia = z.infer<typeof sharedMediaBody>;
export type CommonChat = z.infer<typeof commonChatsBody>["chats"][number];
export type ProfileAd = { id: string; title?: string | null; text: string; url?: string | null };

const id = encodeURIComponent;
const baseKey = ["user-profile"] as const;

export const profileQueries = {
  baseKey,
  /** Медиа, файлы, ссылки и голосовые из лички с этим человеком (сервер собирает по всей истории). */
  sharedMedia: (userId: string) =>
    queryOptions({
      queryKey: [...baseKey, "shared-media", userId],
      queryFn: ({ signal }) => http.get<SharedMedia>(`/api/users/${id(userId)}/shared-media`, signal),
      staleTime: 0,
    }),
  /** Общие группы — вкладка «Группы». */
  commonChats: (userId: string) =>
    queryOptions({
      queryKey: [...baseKey, "common-chats", userId],
      queryFn: async ({ signal }) => (await http.get<z.infer<typeof commonChatsBody>>(`/api/users/${id(userId)}/common-chats`, signal)).chats,
    }),
  /** Реклама этого человека с размещением «в профиле». */
  ad: (userId: string) =>
    queryOptions({
      queryKey: [...baseKey, "ad", userId],
      queryFn: async ({ signal }) => (await http.get<{ ad: ProfileAd | null }>(`/api/ads/serve?placement=profile&owner=${id(userId)}`, signal)).ad,
      staleTime: 0,
      retry: false,
    }),
};

export const profileApi = {
  setBlocked: (userId: string, blocked: boolean) => http.post<z.infer<typeof blockBody>>(`/api/users/${id(userId)}/block`, { blocked }),
  addContact: (userId: string, sharePhone: boolean) => http.post<unknown>("/api/contacts", { userId, localName: null, sharePhone }),
  removeContact: (userId: string) => http.delete<unknown>("/api/contacts", { userId }),
  setNote: (userId: string, note: string) => http.post<{ note?: string | null }>("/api/contacts/note", { userId, note }),
  startSecretChat: (userId: string) => http.post<z.infer<typeof chatBody>>("/api/chats/secret", { userId }),
  sendContact: (chatId: string, contact: { userId: string; name: string; phone?: string }) =>
    http.post<unknown>(`/api/chats/${id(chatId)}/messages`, { text: "", attachments: [{ kind: "contact", meta: contact }] }),
  clickAd: (adId: string) => http.post<unknown>(`/api/ads/click/${id(adId)}`, {}),
};

export type AvatarEntry = { url: string; kind: "image" | "video"; poster?: string };
type AvatarsResult = { avatars: AvatarEntry[]; user: Record<string, unknown> & { id: string } };

export const avatarApi = {
  add: (entry: AvatarEntry) => http.post<AvatarsResult>("/api/avatars", entry),
  setMain: (index: number) => http.post<AvatarsResult>(`/api/avatars/${index}/main`),
  remove: (index: number) => http.delete<AvatarsResult>(`/api/avatars/${index}`),
};

export type ChannelCard = z.infer<typeof channelCard>;

export const pinnedChannelsApi = {
  /** Свои публичные каналы, которые можно закрепить в профиле. */
  pinnable: () => http.get<z.infer<typeof pinnableChannelsBody>>("/api/users/me/pinnable-channels"),
  save: (chatIds: string[]) => http.put<z.infer<typeof pinnedChannelsBody>>("/api/users/me/pinned-channels", { chatIds }),
};
