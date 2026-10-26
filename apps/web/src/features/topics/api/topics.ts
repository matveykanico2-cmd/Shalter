import type { topicBody } from "@shalter/shared/schemas/topics";
import type { z } from "zod";

import type { Topic } from "@/entities/topic";

import { http } from "@/shared/api";

type TopicBody = z.infer<typeof topicBody>;
type TopicPatch = { title?: string; icon?: string; closed?: boolean };

const topicsPath = (chatId: string) => `/api/chats/${encodeURIComponent(chatId)}/topics`;

export const createTopic = (chatId: string, data: { title: string; icon: string }) => http.post<TopicBody>(topicsPath(chatId), data);

export const updateTopic = (chatId: string, topicId: string, patch: TopicPatch) =>
  http.patch<TopicBody>(`${topicsPath(chatId)}/${encodeURIComponent(topicId)}`, patch);

export const deleteTopic = (chatId: string, topicId: string) => http.delete<unknown>(`${topicsPath(chatId)}/${encodeURIComponent(topicId)}`);

/** Включить или выключить темы в группе (только админ): чат и темы, если включили. */
export const setTopicsEnabled = (chatId: string, enabled: boolean) =>
  http.post<{ chat: { topicsEnabled?: true }; enabled: boolean; topics: Topic[] }>(`${topicsPath(chatId)}/enabled`, { enabled });
