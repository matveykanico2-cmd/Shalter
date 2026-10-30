import { z } from "zod";
import { raw, requestBody, requestQuery } from "../../../../common/lib/zod.js";

// Тексты ошибок — как в server/routes/chats.js. В схеме только проверки, которые там идут
// первыми; остальные (после проверки прав, поиска пользователя, загрузки) — в сервисе.

/** Поле правки: нет поля — undefined (не трогать), иначе значение после `fn`. */
const ifPresent = <T>(fn: (value: unknown) => T) => z.unknown().optional().transform((v) => (v === undefined ? undefined : fn(v)));

/** Поле-флаг: `!!x`. */
const flag = () => z.unknown().optional().transform((v) => !!v);

/** Строка — как есть, иначе undefined (`typeof x === "string"`). */
const stringOr = <T>(fn: (value: string) => T) => z.unknown().optional().transform((v) => (typeof v === "string" ? fn(v) : undefined));

const listError = { error: "Нужен список чатов" };
export const pinnedOrderSchema = requestBody({ chatIds: z.array(z.string(listError), listError).max(500, listError) });
export type PinnedOrderDto = z.infer<typeof pinnedOrderSchema>;

// userId сравнивается с uid до поиска пользователя, title и avatarColor уходят в чат как есть.
export const createDmSchema = requestBody({ userId: raw(), title: raw(), avatarColor: raw() });
export type CreateDmDto = z.infer<typeof createDmSchema>;

// userId проверяет сервис: раньше идёт проверка устройства (cookie).
export const createSecretSchema = requestBody({ userId: raw() });
export type CreateSecretDto = z.infer<typeof createSecretSchema>;

const communitySchema = (titleError: string) =>
  requestBody({
    title: z
      .string({ error: titleError })
      .refine((v) => v.trim() !== "", { error: titleError })
      .transform((v) => v.trim()),
    avatarImage: raw(),
    memberIds: z.unknown().optional().transform((v) => (Array.isArray(v) ? (v as unknown[]) : [])),
    adminIds: z.unknown().optional().transform((v) => (Array.isArray(v) ? (v as unknown[]) : [])),
    description: z.unknown().optional().transform((v) => (typeof v === "string" ? v.trim().slice(0, 500) : "")),
    username: z.unknown().optional().transform((v) => String(v ?? "").trim()),
    isPublic: flag(),
  });
export const createChannelSchema = communitySchema("Введите название канала");
export const createGroupSchema = communitySchema("Введите название группы");
export type CreateCommunityDto = z.infer<typeof createChannelSchema>;

export const patchChatSchema = requestBody({
  title: stringOr((v) => v.trim().slice(0, 128)).refine((v) => v !== "", { error: "Название не может быть пустым" }),
  description: stringOr((v) => v.trim().slice(0, 500) || null),
  // «Некорректное изображение» зависит от загрузок пользователя, а срок автоудаления
  // проверяется после изображения — обе проверки в сервисе.
  avatarImage: raw(),
  avatarColor: stringOr((v) => v.slice(0, 32)),
  avatarEmoji: stringOr((v) => {
    const e = v.slice(0, 2);
    if (e && !/^[\p{Emoji}\p{L}\p{N}]+$/u.test(e)) throw new Error("Заставкой может быть смайл, буква или цифра");
    return e || null;
  }),
  avatarType: z.enum(["image", "emoji", "sticker"]).optional(),
  stickerId: z.string().optional(),
  packId: z.string().optional(),
  autoDeleteSeconds: ifPresent((v) => Number(v) || 0),
  pinned: ifPresent((v) => !!v),
  archived: ifPresent((v) => !!v),
  muted: ifPresent((v) => !!v),
  unread: ifPresent((v) => !!v),
});
export type PatchChatDto = z.infer<typeof patchChatSchema>;

export const deleteChatSchema = requestBody({ reason: z.unknown().optional().transform((v) => String(v ?? "").trim().slice(0, 500)) });
export type DeleteChatDto = z.infer<typeof deleteChatSchema>;

export const clearSchema = requestBody({ forEveryone: flag() });
export type ClearDto = z.infer<typeof clearSchema>;

// Фон сохраняется как пришёл (null — сбросить), проверка ссылки — в сервисе.
export const wallpaperSchema = requestBody({
  wallpaper: raw(),
  forEveryone: flag(),
  label: z.unknown().optional().transform((v) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 40) : null)),
});
export type WallpaperDto = z.infer<typeof wallpaperSchema>;

export const draftSchema = requestBody({ text: z.unknown().optional().transform((v) => (typeof v === "string" ? v.slice(0, 8192) : "")) });
export type DraftDto = z.infer<typeof draftSchema>;

export const muteSchema = requestBody({
  hours: z.unknown().optional().transform((v) => Number(v)),
  forever: z.unknown().optional().transform((v) => v === true),
  off: z.unknown().optional().transform((v) => v === true),
}).refine((b) => b.forever || b.off || (Number.isFinite(b.hours) && b.hours > 0), { error: "Укажите срок" });
export type MuteDto = z.infer<typeof muteSchema>;

// Действие нормализует typing().normalizeAction из server/.
export const typingSchema = requestBody({ action: raw() });
export type TypingDto = z.infer<typeof typingSchema>;

export const protectSchema = requestBody({ enabled: flag() });
export type ProtectDto = z.infer<typeof protectSchema>;

export const limitQuerySchema = requestQuery({ limit: z.unknown().optional().transform((v) => Math.min(Math.max(Number(v) || 50, 1), 100)) });
export type LimitQueryDto = z.infer<typeof limitQuerySchema>;
