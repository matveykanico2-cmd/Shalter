// Валидация запросов стикерпаков (/api/stickers/packs) и кастомных эмодзи (/api/custom-emoji).
// Максимальный размер файла и форматы проверяются сервером при загрузке (server/lib/uploadLimits.js),
// а здесь — структурно: файл уже загружен через /api/uploads и имеет расширение PNG/WebP.
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { requestBody, optionalText, text } from "../../../../common/lib/zod.js";
import { sanitizers } from "../../../../legacy/legacy.js";

/** Максимум стикеров в одном паке (вынесено в конфиг). */
export const MAX_STICKERS_PER_PACK = 30;
/** Максимальная длина названия / описания пака. */
export const MAX_PACK_NAME = 60;
export const MAX_PACK_DESCRIPTION = 200;
/** Максимум эмодзи у стикера. */
export const MAX_EMOJI = 8;

const STICKER_ID_RE = /^st_[0-9a-f]{8}$/;
const PACK_ID_RE = /^sp_[a-z0-9]+_[a-z0-9]{1,8}$/;

const ifPresent = <T>(fn: (v: unknown) => T) => z.unknown().optional().transform((v) => (v === undefined ? undefined : fn(v)));

export const stickerItem = z.strictObject({
  id: z.string().regex(STICKER_ID_RE),
  packId: z.string().regex(PACK_ID_RE),
  url: z.string().regex(/^\/uploads\//),
  emoji: z.string().min(1).max(MAX_EMOJI),
  position: z.number().int().nonnegative(),
  createdAt: z.string(),
});
export type StickerItem = z.infer<typeof stickerItem>;

export const createPackSchema = requestBody({
  name: text()
    .refine((v) => v.trim() !== "", { error: "Назовите пак" })
    .transform((v) => v.trim().slice(0, MAX_PACK_NAME)),
  description: optionalText().transform((v) => (v == null || v === "" ? null : v.slice(0, MAX_PACK_DESCRIPTION))),
});
export type CreatePackDto = z.infer<typeof createPackSchema>;

export const patchPackSchema = requestBody({
  name: ifPresent((v) => (v == null ? undefined : String(v).trim().slice(0, MAX_PACK_NAME) || undefined)),
  description: ifPresent((v) => (v == null || v === "" ? null : String(v).slice(0, MAX_PACK_DESCRIPTION))),
});
export type PatchPackDto = z.infer<typeof patchPackSchema>;

export const addStickerSchema = requestBody({
  file: z
    .string()
    .refine((v) => /^\/uploads\//.test(v), { error: "Сначала загрузите файл" })
    .refine((v) => /\.(png|webp)$/i.test(v), { error: "Стикер должен быть PNG или WebP" }),
  emoji: z.string().min(1).max(MAX_EMOJI),
  position: z.unknown().optional().transform((v) => (v == null ? undefined : Number(v))),
});
export type AddStickerDto = z.infer<typeof addStickerSchema>;

export const updateStickerSchema = requestBody({
  emoji: ifPresent((v) => (v == null ? undefined : String(v).slice(0, MAX_EMOJI))),
  position: z.unknown().optional().transform((v) => (v == null ? undefined : Number(v))),
});
export type UpdateStickerDto = z.infer<typeof updateStickerSchema>;

export const stickerIdParam = z.string().regex(STICKER_ID_RE);
export type StickerIdParam = z.infer<typeof stickerIdParam>;

export const packIdParam = z.string().regex(PACK_ID_RE);
export type PackIdParam = z.infer<typeof packIdParam>;

// --- кастомные эмодзи (отдельная функция /api/custom-emoji) ------------------

const cleanScene = (scene: unknown): Record<string, unknown> | null =>
  (sanitizers().sanitizeScene(scene, { requireLayers: true }) as Record<string, unknown> | undefined) || null;

export const createEmojiSchema = requestBody({
  name: text().transform((v) => v.trim().slice(0, MAX_PACK_NAME)),
  scene: z.unknown().optional().transform(cleanScene),
});
export type CreateEmojiDto = z.infer<typeof createEmojiSchema>;

export const patchEmojiSchema = requestBody({
  name: ifPresent((v) => (v == null ? undefined : String(v).trim().slice(0, MAX_PACK_NAME) || undefined)),
  scene: ifPresent(cleanScene),
});
export type PatchEmojiDto = z.infer<typeof patchEmojiSchema>;
