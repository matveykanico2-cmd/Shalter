import { z } from "zod";
import { raw, requestBody } from "../../../../common/lib/zod.js";

// Поля проверяют сервисы — со своими текстами ошибок, как server/routes/stickers.js и customEmoji.js.

export const packSchema = requestBody({ name: raw(), stickers: raw() });
export type PackDto = z.infer<typeof packSchema>;

export const emojiSchema = requestBody({ name: raw(), scene: raw() });
export type EmojiDto = z.infer<typeof emojiSchema>;
