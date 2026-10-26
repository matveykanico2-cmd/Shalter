import { z } from "zod";
import { requestBody } from "../../../../common/lib/zod.js";

// Как server/routes/folders.js.
const MAX_FOLDER_NAME = 32;
const MAX_FOLDER_CHATS = 500;

/** Название без пробелов по краям; не строка или пустое — null. */
function cleanFolderName(raw: unknown): string | null {
  const name = typeof raw === "string" ? raw.trim().slice(0, MAX_FOLDER_NAME) : "";
  return name || null;
}

/** Чаты без повторов; нет поля или null — пустой список, не массив строк — null. */
function cleanChatIds(raw: unknown): string[] | null {
  if (raw == null) return [];
  if (!Array.isArray(raw) || !raw.every((id) => typeof id === "string")) return null;
  return [...new Set(raw as string[])].slice(0, MAX_FOLDER_CHATS);
}

export const createFolderSchema = requestBody({
  name: z
    .unknown().optional()
    .transform(cleanFolderName)
    .refine((name) => name !== null, { error: "Введите название папки" })
    .transform((name) => name!),
  chatIds: z
    .unknown().optional()
    .transform(cleanChatIds)
    .refine((ids) => ids !== null, { error: "Некорректный список чатов" })
    .transform((ids) => ids!),
});
export type CreateFolderDto = z.infer<typeof createFolderSchema>;

/** Нет поля — undefined: PATCH меняет только переданные поля. */
const ifPresent = <T>(fn: (v: unknown) => T) => z.unknown().optional().transform((v) => (v === undefined ? undefined : fn(v)));

// Неверное значение — null, а не ошибка схемы: сначала сервис проверяет, что папка своя (404).
export const patchFolderSchema = requestBody({
  name: ifPresent(cleanFolderName),
  chatIds: ifPresent(cleanChatIds),
  order: ifPresent((v) => (Number.isInteger(v) ? (v as number) : null)),
});
export type PatchFolderDto = z.infer<typeof patchFolderSchema>;
