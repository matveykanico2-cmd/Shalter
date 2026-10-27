import type { topicListItem } from "@shalter/shared/schemas/topics";
import type { z } from "zod";

/** Тема группы в списке — со счётчиком сообщений и временем последнего. */
export type Topic = z.infer<typeof topicListItem>;
