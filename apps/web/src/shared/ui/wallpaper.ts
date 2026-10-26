import type { CSSProperties } from "react";

import styles from "./wallpapers.module.css";

/** Обои: заготовка по id или своё фото (id "custom" + data URL). */
export type Wallpaper = { id: string; image?: string | null };

/** Набор обоев — как WALLPAPER_GROUPS в public/js/lib/wallpapers.js. */
export const WALLPAPER_GROUPS = [
  {
    label: "Общие",
    items: [
      { id: "default", label: "По умолчанию" },
      { id: "dots", label: "Точки" },
      { id: "gradient", label: "Градиент" },
      { id: "forest", label: "Лес" },
      { id: "school", label: "Школа" },
      { id: "university", label: "Универ" },
    ],
  },
  {
    label: "Снег",
    items: [
      { id: "snow-1", label: "Снег 1" },
      { id: "snow-2", label: "Снег 2" },
      { id: "snow-3", label: "Снег 3" },
    ],
  },
  {
    label: "Зима",
    items: [
      { id: "winter-1", label: "Зима 1" },
      { id: "winter-2", label: "Зима 2" },
      { id: "winter-3", label: "Зима 3" },
    ],
  },
  {
    label: "Весна",
    items: [
      { id: "spring-1", label: "Весна 1" },
      { id: "spring-2", label: "Весна 2" },
      { id: "spring-3", label: "Весна 3" },
    ],
  },
  {
    label: "Лето",
    items: [
      { id: "summer-1", label: "Лето 1" },
      { id: "summer-2", label: "Лето 2" },
      { id: "summer-3", label: "Лето 3" },
      { id: "summer-4", label: "Лето 4" },
    ],
  },
  {
    label: "Осень",
    items: [
      { id: "autumn-1", label: "Осень 1" },
      { id: "autumn-2", label: "Осень 2" },
      { id: "autumn-3", label: "Осень 3" },
    ],
  },
  {
    label: "Любовь",
    items: [
      { id: "love-1", label: "Любовь 1" },
      { id: "love-2", label: "Любовь 2" },
      { id: "love-3", label: "Любовь 3" },
      { id: "love-4", label: "Любовь 4" },
    ],
  },
  {
    label: "Космос",
    items: [
      { id: "space-1", label: "Космос 1" },
      { id: "space-2", label: "Космос 2" },
      { id: "space-3", label: "Космос 3" },
    ],
  },
  {
    label: "Праздник",
    items: [
      { id: "holiday-1", label: "Праздник 1" },
      { id: "holiday-2", label: "Праздник 2" },
      { id: "holiday-3", label: "Праздник 3" },
    ],
  },
  {
    label: "Своё",
    items: [{ id: "custom", label: "Своё фото" }],
  },
] as const;

const IDS: readonly string[] = WALLPAPER_GROUPS.flatMap((g) => g.items.map((i) => i.id));

/** Класс и фон для элемента с обоями — как paintWallpaper; неизвестный id — обои по умолчанию. */
export function wallpaperProps(w: Wallpaper | null | undefined): { className: string; style?: CSSProperties } {
  if (w?.id === "custom" && w.image) return { className: styles.custom ?? "", style: { backgroundImage: `url(${w.image})` } };
  return { className: styles[w && IDS.includes(w.id) ? w.id : "default"] ?? "" };
}

/** Значение из настроек или чата (JSON с сервера) — обои, если это они. */
export function asWallpaper(value: unknown): Wallpaper | null {
  if (!value || typeof value !== "object" || typeof (value as Wallpaper).id !== "string") return null;
  const { id, image } = value as Wallpaper;
  return { id, image: typeof image === "string" ? image : null };
}
