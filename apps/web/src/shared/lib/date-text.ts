// Дата вводом «ДД.ММ.ГГГГ» — как public/js/components/dateField.js (день рождения).
const MIN_YEAR = 1900;

const onlyDigits = (s: string) => s.replace(/\D/g, "").slice(0, 8);

/** Цифры → «ДД.ММ.ГГГГ» по мере ввода. */
export function formatDateDigits(digits: string) {
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
}

export function isoToDateText(iso: string | null | undefined) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
}

/** iso "" — поле пустое; iso null — дата неверна, error объясняет почему. */
export function parseDateText(text: string): { iso: string | null; error: string | null } {
  const digits = onlyDigits(text);
  if (!digits) return { iso: "", error: null };
  if (digits.length < 8) return { iso: null, error: "Впишите дату полностью: ДД.ММ.ГГГГ" };

  const day = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const year = Number(digits.slice(4));
  if (month < 1 || month > 12) return { iso: null, error: "Месяца с таким номером нет" };
  if (year < MIN_YEAR) return { iso: null, error: `Год не раньше ${MIN_YEAR}` };

  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCDate() !== day || date.getUTCMonth() !== month - 1 || date.getUTCFullYear() !== year) {
    return { iso: null, error: "Такого дня в этом месяце нет" };
  }
  if (date.getTime() > Date.now()) return { iso: null, error: "Дата рождения не может быть в будущем" };

  return { iso: `${digits.slice(4)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`, error: null };
}
