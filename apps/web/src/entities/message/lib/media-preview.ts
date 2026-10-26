import type { Message } from "../model/types";

/** Что нужно превью с медиа: полное сообщение или цель ответа (у неё вложения без ссылок). */
export type Previewable = Pick<Message, "type" | "text"> & { attachments?: unknown[]; gift?: unknown; sticker?: unknown };

/** Есть ли что показать миниатюрой: вложение или подарок (иначе — обычная строка messagePreview). */
export const hasMediaPreview = (m: Previewable | null | undefined) => !!m && (!!m.attachments?.length || (m.type === "gift" && !!m.gift));
