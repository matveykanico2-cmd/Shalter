import type { chatTopics } from "../../db/schema.js";

export type TopicRow = typeof chatTopics.$inferSelect;

/** Тема группы (rowToTopic в server/data/topics.js). */
export interface Topic {
  id: string;
  chatId: string;
  title: string;
  icon?: string;
  color: string;
  closed: boolean;
  createdBy: string;
  createdAt: string;
}

/** Тема в списке: со счётчиком сообщений и временем последнего. */
export interface TopicWithStats extends Topic {
  messageCount: number;
  lastMessageAt: string;
}

export interface TopicPatch {
  title?: string;
  icon?: string | null;
  color?: unknown;
  closed?: boolean;
}
