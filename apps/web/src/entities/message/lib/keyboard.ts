// Кнопки бота под сообщением (message.keyboard, normalizeKeyboard в server/lib/botMessaging.js).
export type KeyboardButton = { text: string; url?: string; app?: string; action?: string; style?: "primary" | "success" | "danger" };

/** Ряды кнопок; что сервер не мог прислать — отбрасываем. */
export function keyboardOf(raw: unknown): KeyboardButton[][] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(Array.isArray)
    .map((row: unknown[]) =>
      row.filter((b): b is KeyboardButton => !!b && typeof b === "object" && typeof (b as KeyboardButton).text === "string" && !!(b as KeyboardButton).text)
    )
    .filter((row) => row.length);
}
