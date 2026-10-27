// То же, что server/lib/validators.js.
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PHONE_RE = /^\+?\d{10,15}$/;

export function normalizePhone(phone: string | null | undefined): string {
  return (phone ?? "").trim().replace(/[\s()-]/g, "");
}

// Дата рождения «ДД.ММ.ГГГГ» (как просит форма) или «ГГГГ-ММ-ДД» (input type=date) →
// «ГГГГ-ММ-ДД», как она хранится. Невалидная — null.
export function normalizeBirthday(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  const ru = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(raw);
  const iso = ru ? `${ru[3]}-${ru[2]!.padStart(2, "0")}-${ru[1]!.padStart(2, "0")}` : raw;
  return isValidBirthday(iso) ? iso : null;
}

function isValidBirthday(iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (year < 1900) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return false;
  return date.getTime() <= Date.now();
}
