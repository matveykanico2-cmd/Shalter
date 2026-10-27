import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { settingsQueries } from "@/entities/settings";

import { setTimeFormat } from "@/shared/lib/time-format";

// Значения по умолчанию из прошлых версий: при них — цвета и размер из темы (lib/accent.js).
const OLD_DEFAULT_ACCENT = "#2E56D9";
const OLD_DEFAULT_FONT = 15;
const DEFAULT_FONT_SIZE = 16;

/**
 * Тема, акцент, размер текста сообщений и «без анимаций» из настроек — на <html>, как boot()
 * в public/js/app.js. Последнюю тему index.html помнит в localStorage до загрузки настроек.
 */
export function useAppearance(ready: boolean) {
  // До /api/bootstrap не запрашиваем отдельно: настройки придут с ним.
  const settings = useQuery({ ...settingsQueries.current(), enabled: ready }).data;
  const theme = settings?.theme;
  const accent = settings?.accent;
  const fontSize = settings?.fontSize;
  const reduceMotion = settings?.reduceMotion;
  const timeFormat = settings?.timeFormat;

  // 12 или 24 часа — для всех подписей времени (shared/lib/time-format).
  useEffect(() => setTimeFormat(timeFormat === 12 ? 12 : 24), [timeFormat]);

  useEffect(() => {
    if (theme === undefined) return;
    const root = document.documentElement;
    if (theme && theme !== "system") root.setAttribute("data-theme", theme);
    else root.removeAttribute("data-theme");
    try {
      if (theme === "dark" || theme === "light") localStorage.setItem("shalter.theme", theme);
      else localStorage.removeItem("shalter.theme");
    } catch {
      // Хранилище недоступно (приватный режим) — тема придёт с настройками.
    }
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    if (!accent || accent.toUpperCase() === OLD_DEFAULT_ACCENT) root.style.removeProperty("--color-accent");
    else root.style.setProperty("--color-accent", accent);
  }, [accent]);

  useEffect(() => {
    const root = document.documentElement;
    const n = !fontSize || fontSize === OLD_DEFAULT_FONT ? DEFAULT_FONT_SIZE : fontSize;
    if (n === DEFAULT_FONT_SIZE) root.style.removeProperty("--messages-text");
    else root.style.setProperty("--messages-text", `${n}px`);
  }, [fontSize]);

  useEffect(() => {
    document.documentElement.toggleAttribute("data-reduce-motion", !!reduceMotion);
  }, [reduceMotion]);
}
