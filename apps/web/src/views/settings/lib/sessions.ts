import type { IconName, SettingsRowColor } from "@/shared/ui";

/** Значок сеанса по устройству — sessionPlatform в public/js/views/settings/index.js. */
export function sessionPlatform(device = ""): { icon: IconName; color: SettingsRowColor } {
  const d = device.toLowerCase();
  if (/iphone|ipad|ios|mac/.test(d)) return { icon: "Phone", color: "blue" };
  if (/android/.test(d)) return { icon: "Phone", color: "green" };
  if (/windows/.test(d)) return { icon: "Monitor", color: "blue" };
  if (/linux|ubuntu/.test(d)) return { icon: "Monitor", color: "orange" };
  return { icon: "Globe", color: "purple" };
}

/** «Firefox, Linux» → приложение и система (sessionAppName). */
export function sessionAppName(device = "") {
  const [app, ...rest] = device.split(",").map((x) => x.trim());
  return { app: app || "Shalter Web", system: rest.join(", ") };
}

/** Размер в Б/КБ/МБ/ГБ/ТБ/ПБ — formatBytes. */
export function formatBytes(bytes: number) {
  const units = ["КБ", "МБ", "ГБ", "ТБ", "ПБ"];
  if (bytes < 1024) return `${bytes} Б`;
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i >= 2 ? 2 : 1)} ${units[i]}`;
}
