import { z } from "zod";
import { requestBody, text } from "../../../../common/lib/zod.js";
import { sanitizers } from "../../../../legacy/legacy.js";

// Как server/routes/stickers.js и customEmoji.js. Стикеры и сцены чистят sanitizeSticker и
// sanitizeScene из server/ (их же зовёт отправка сообщений); всё, что требует базы или прав
// (чужие файлы, владелец пака, раздел админки), проверяют сервисы.

export const MAX_STICKERS = 60;
const MAX_NAME = 40;

// Не больше MAX_STICKERS, некорректные отбрасываются, анимация сцены не хранится.
function sanitizeStickers(input: unknown): Record<string, unknown>[] {
  if (!Array.isArray(input)) return [];
  const { sanitizeSticker } = sanitizers();
  return input
    .slice(0, MAX_STICKERS)
    .map((s) => sanitizeSticker(s))
    .filter((s) => !!s)
    .map(({ anim: _anim, ...rest }) => rest);
}

/** Нет поля — undefined (PATCH меняет только переданные поля). */
const ifPresent = <T>(fn: (v: unknown) => T) => z.unknown().optional().transform((v) => (v === undefined ? undefined : fn(v)));

export const createPackSchema = requestBody({
  name: text()
    .refine((v) => v.trim() !== "", { error: "Назовите пак" })
    .transform((v) => v.trim().slice(0, MAX_NAME)),
  // «Хотя бы один» — после очистки: пак из одних некорректных стикеров не создаётся пустым.
  stickers: z
    .unknown().optional()
    .transform(sanitizeStickers)
    .refine((clean) => clean.length > 0, { error: "Добавьте хотя бы один стикер" }),
});
export type CreatePackDto = z.infer<typeof createPackSchema>;

export const patchPackSchema = requestBody({
  // Пустое название оставляет прежнее (undefined); null — строка "null", как в server/.
  name: ifPresent((v) => String(v).trim().slice(0, MAX_NAME) || undefined),
  stickers: ifPresent(sanitizeStickers),
});
export type PatchPackDto = z.infer<typeof patchPackSchema>;

/** Сцена после sanitizeScene; null — пустая или некорректная (ошибка — в сервисе, после проверки прав). */
const cleanScene = (scene: unknown): Record<string, unknown> | null =>
  (sanitizers().sanitizeScene(scene, { requireLayers: true }) as Record<string, unknown> | undefined) || null;

export const createEmojiSchema = requestBody({
  name: text().transform((v) => v.trim().slice(0, MAX_NAME)),
  scene: z.unknown().optional().transform(cleanScene),
});
export type CreateEmojiDto = z.infer<typeof createEmojiSchema>;

export const patchEmojiSchema = requestBody({
  name: ifPresent((v) => String(v).trim().slice(0, MAX_NAME)),
  scene: ifPresent(cleanScene),
});
export type PatchEmojiDto = z.infer<typeof patchEmojiSchema>;
