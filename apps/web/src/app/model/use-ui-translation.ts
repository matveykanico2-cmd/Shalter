import { useEffect } from "react";

import { initUiTranslation } from "@/shared/lib/ui-translate";

/** Язык интерфейса из настроек: не русский — надписи переводятся на лету (shared/lib/ui-translate). */
export function useUiTranslation(language: string | undefined) {
  useEffect(() => {
    if (language !== undefined) initUiTranslation(language);
  }, [language]);
}
