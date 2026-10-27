import { z } from "zod";
import { raw, requestBody, text } from "../../../../common/lib/zod.js";
import { isSafeUrl } from "../../../../legacy/legacy.js";
import type { BotCommand } from "../domain.js";

// Как server/routes/bots.js. В схеме — только проверки, которые там идут первыми (до поиска
// бота); остальные с теми же текстами — в сервисе, после проверки владельца.

const BOT_NAME_REQUIRED = "Введите имя бота";

// Аватар бота — ссылка http(s), data: или загрузка; пустое значение — без аватара.
const badAvatar = (value: unknown) => value != null && value !== "" && !isSafeUrl(value);

export const createBotSchema = requestBody({
  name: z.string({ error: BOT_NAME_REQUIRED }).refine((v) => !!v.trim(), { error: BOT_NAME_REQUIRED }),
  // Чужие загрузки проверяет сервис: для этого нужен пользователь.
  avatarImage: raw()
    .refine((v) => !badAvatar(v), { error: "Некорректная ссылка на файл" })
    .transform((v) => v as string | null | undefined),
  description: raw().transform((v) => (typeof v === "string" ? v.trim() : "")),
});
export type CreateBotDto = z.infer<typeof createBotSchema>;

export const broadcastSchema = requestBody({ text: text().transform((v) => v.trim()) });
export type BroadcastDto = z.infer<typeof broadcastSchema>;

/** Строка — как есть, иначе поле не задано. */
const stringOrUndefined = () => raw().transform((v) => (typeof v === "string" ? v : undefined));

export const patchBotSchema = requestBody({
  name: stringOrUndefined(),
  // Как пришли: чужие загрузки ищутся и внутри не-строк (usesForeignUpload).
  avatarImage: raw(),
  username: stringOrUndefined(),
  appName: text().transform((v) => v.trim().slice(0, 40)),
  appCode: raw(),
  appUrl: raw(),
  description: raw().transform((v) => (typeof v === "string" ? v.trim().slice(0, 300) : undefined)),
});
export type PatchBotDto = z.infer<typeof patchBotSchema>;

export const openAppSchema = requestBody({
  url: raw().transform((v) => (typeof v === "string" && v.trim() ? v.trim() : null)),
  chatId: raw().transform((v) => (v ? String(v) : null)),
  theme: raw().transform((v) => (v === "dark" ? "dark" : "light")),
});
export type OpenAppDto = z.infer<typeof openAppSchema>;

export const appDataSchema = requestBody({ data: text().transform((v) => v.trim()) });
export type AppDataDto = z.infer<typeof appDataSchema>;

export const commandsSchema = requestBody({
  commands: raw().transform((v): BotCommand[] =>
    (Array.isArray(v) ? (v as unknown[]) : [])
      .map((c) => {
        const item = c as { command?: unknown; description?: unknown } | null;
        return {
          command: String(item?.command ?? "")
            .trim()
            .replace(/^\//, "")
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, "")
            .slice(0, 32),
          description: String(item?.description ?? "").trim().slice(0, 120),
        };
      })
      .filter((c) => c.command)
      .slice(0, 100)
  ),
});
export type CommandsDto = z.infer<typeof commandsSchema>;
