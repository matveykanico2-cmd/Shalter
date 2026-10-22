import { z } from "zod";
import { raw, requestBody, text } from "../../../../common/lib/zod.js";

// Поля как пришли: проверки и тексты ошибок — в сервисе, как в server/routes/stories.js.
export const createStorySchema = requestBody({ kind: raw(), url: raw(), items: raw() });
export type CreateStoryDto = z.infer<typeof createStorySchema>;

export const storyCommentSchema = requestBody({ text: text(), parentId: raw() });
export type StoryCommentDto = z.infer<typeof storyCommentSchema>;

export const editStoryCommentSchema = requestBody({ text: text() });
export type EditStoryCommentDto = z.infer<typeof editStoryCommentSchema>;
