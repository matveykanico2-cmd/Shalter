import type { User } from "../../users/model/domain.js";

// Сравнение номеров из записной книжки (server/lib/phoneMatch.js): только цифры, 8… = 7….

export function phoneKey(raw: unknown): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 11 && digits.startsWith("8")) return `7${digits.slice(1)}`;
  return digits;
}

/** Пользователи (без ботов) по ключу номера; при совпадении номера — последний. */
export function indexUsersByPhone(users: User[]): Map<string, User> {
  const index = new Map<string, User>();
  for (const user of users) {
    if (user.isBot) continue;
    const key = phoneKey(user.phone);
    if (key) index.set(key, user);
  }
  return index;
}
