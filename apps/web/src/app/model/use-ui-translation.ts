import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { sessionQueries } from "@/entities/session";

import { initUiTranslation } from "@/shared/lib/ui-translate";

/** Язык интерфейса из настроек: не русский — надписи переводятся на лету (shared/lib/ui-translate). */
export function useUiTranslation(language: string | undefined) {
  useEffect(() => {
    if (language !== undefined) initUiTranslation(language);
  }, [language]);
}

/**
 * До входа (экраны входа и регистрации) настроек ещё нет: язык — по стране IP, языку браузера
 * или русский (GET /api/geo/language). Уходя с экрана, перевод выключается — после входа язык
 * берётся из настроек аккаунта.
 */
export function useGuestUiTranslation(enabled: boolean) {
  const language = useQuery({ ...sessionQueries.guestLanguage(), enabled }).data?.language;
  useEffect(() => {
    if (!enabled || !language || language === "ru") return;
    initUiTranslation(language, { guest: true });
    return () => initUiTranslation("ru");
  }, [enabled, language]);
}
