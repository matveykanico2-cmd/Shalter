// Темы в группах: /api/chats/:id/topics (server/routes/topics.js, rowToTopic в server/data/topics.js).
import { z } from "zod";
import { genId, isoDate } from "./common";
import { chat } from "./chat";

export const topic = z.strictObject({
  id: genId("topic"),
  chatId: z.string(),
  title: z.string(),
  icon: z.string().optional(),
  color: z.string(),
  closed: z.boolean(),
  createdBy: z.string(),
  createdAt: isoDate,
});

/** Тема в списке — со счётчиком сообщений и временем последнего (listTopics). */
export const topicListItem = topic.extend({ messageCount: z.number(), lastMessageAt: isoDate });

export const topicsListBody = z.strictObject({ enabled: z.boolean(), topics: z.array(topicListItem) });
export const topicsEnabledBody = z.strictObject({ chat, enabled: z.boolean(), topics: z.array(topicListItem) });
export const topicBody = z.strictObject({ topic });
