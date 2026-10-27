// День рождения в профиле — как birthdayText/isBirthdayToday в public/js/components/profileDialog.js.
import { plural } from "@/shared/lib/presence";

const DATE = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** «3 марта 1990 г. (36 лет)». */
export function birthdayText(iso: string, now = new Date()) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  let age = now.getFullYear() - d.getUTCFullYear();
  if (now.getMonth() < d.getUTCMonth() || (now.getMonth() === d.getUTCMonth() && now.getDate() < d.getUTCDate())) age -= 1;
  const date = DATE.format(d);
  return age >= 0 && age < 150 ? `${date} (${age} ${plural(age, "год", "года", "лет")})` : date;
}

export function isBirthdayToday(iso: string, now = new Date()) {
  const d = new Date(iso);
  return !Number.isNaN(d.getTime()) && d.getUTCMonth() === now.getMonth() && d.getUTCDate() === now.getDate();
}
