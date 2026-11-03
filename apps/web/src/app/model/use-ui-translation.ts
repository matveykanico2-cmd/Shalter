import { useEffect } from "react";

import { useGuestLanguage } from "@/shared/lib/guest-language";
import { initUiTranslation } from "@/shared/lib/ui-translate";

/** Язык интерфейса из настроек: не русский — надписи переводятся на лету (shared/lib/ui-translate). */
export function useUiTranslation(language: string | undefined) {
  useEffect(() => {
    if (language !== undefined) initUiTranslation(language);
  }, [language]);
}

/**
 * До входа (экраны входа и регистрации) настроек ещё нет: экран на русском, пока человек сам не
 * выберет другой язык кнопкой «Continue in …» (shared/lib/guest-language). Уходя с экрана,
 * перевод выключается — после входа язык берётся из настроек аккаунта.
 */
export function useGuestUiTranslation(enabled: boolean) {
  const language = useGuestLanguage();
  useEffect(() => {
    if (!enabled || language === "ru") return;
    initUiTranslation(language, { guest: true });
    return () => initUiTranslation("ru");
  }, [enabled, language]);
}
