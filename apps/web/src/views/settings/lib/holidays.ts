/** «14.02», «14/2» или «2026-02-14» (поле type=date) → «02-14»; иначе null — parseDayMonth. */
export function parseDayMonth(input: string) {
  const raw = String(input ?? "").trim();
  let month: number;
  let day: number;
  const iso = raw.match(/^\d{4}-(\d{2})-(\d{2})$/);
  if (iso) {
    month = Number(iso[1]);
    day = Number(iso[2]);
  } else {
    const dm = raw.match(/^(\d{1,2})[.\-/](\d{1,2})$/);
    if (!dm) return null;
    day = Number(dm[1]);
    month = Number(dm[2]);
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** «02-14» → значение для поля type=date в этом году. */
export const monthDayToInputDate = (mmdd: string) => (/^\d{2}-\d{2}$/.test(mmdd || "") ? `${new Date().getFullYear()}-${mmdd}` : "");
