// Ник: как normalizeUsername и isUsernameConflict в server/lib/username.js.

/** Без пробелов по краям и «@» в начале. */
export function normalizeUsername(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .replace(/^@/, "");
}

// Уникальный индекс юзернейма сработал при записи (заняли между проверкой и записью).
// Drizzle заворачивает ошибку SQLite в свою — текст SQLite в cause.
export function isUsernameConflict(err: unknown): boolean {
  const messages = [(err as Error)?.message, ((err as { cause?: Error })?.cause)?.message].filter(Boolean).join("\n");
  return /UNIQUE constraint failed/i.test(messages) && /username/i.test(messages);
}
