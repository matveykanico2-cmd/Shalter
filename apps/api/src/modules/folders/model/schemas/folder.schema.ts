import { z } from "zod";
import { raw, requestBody } from "../../../../common/lib/zod.js";

// Поля проверяет сервис — со своими текстами ошибок, как server/routes/folders.js; схема
// только оставляет известные поля (PATCH различает «нет поля» и пустое значение).
export const createFolderSchema = requestBody({ name: raw(), chatIds: raw() });
export type CreateFolderDto = z.infer<typeof createFolderSchema>;

export const patchFolderSchema = requestBody({ name: raw(), chatIds: raw(), order: raw() });
export type PatchFolderDto = z.infer<typeof patchFolderSchema>;
