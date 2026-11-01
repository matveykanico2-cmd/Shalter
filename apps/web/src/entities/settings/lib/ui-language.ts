import type { Settings } from "../api/settings-queries";

/**
 * Язык интерфейса выбирается по стране IP, пока пользователь не выбрал его сам (как
 * isUiLanguageAuto в apps/api): у настроек без флага русский по умолчанию — «не выбран».
 */
export function isUiLanguageAuto(settings: Pick<Settings, "uiLanguage" | "uiLanguageAuto">): boolean {
  if (typeof settings.uiLanguageAuto === "boolean") return settings.uiLanguageAuto;
  return (settings.uiLanguage || "ru") === "ru";
}
