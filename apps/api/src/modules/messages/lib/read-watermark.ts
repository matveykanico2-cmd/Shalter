/** markChatRead: запас под границей прочитанного — как READ_WATERMARK_MARGIN_MS в server/data/messages.js. */
export const READ_WATERMARK_MARGIN_MS = 10 * 60 * 1000;

/**
 * С какого createdAt markChatRead ищет непрочитанные (как readScanFrom в server/data/messages.js):
 * граница chat_reads минус запас (сообщения, сохранённые чуть позже своего createdAt), но граница
 * не позже «сейчас» — сообщение с датой из будущего (часы откатились, импорт) иначе навсегда
 * спрятало бы всё, что пришло после. null — границы нет, смотрим весь чат.
 */
export function readScanFrom(watermark: string | null | undefined, nowMs = Date.now()): string | null {
  const at = watermark ? Date.parse(watermark) : NaN;
  if (!Number.isFinite(at)) return null;
  return new Date(Math.min(at, nowMs) - READ_WATERMARK_MARGIN_MS).toISOString();
}
