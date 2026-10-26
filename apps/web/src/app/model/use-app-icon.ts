import { useEffect, useRef } from "react";

import type { SelfUser } from "@/entities/session";
import type { Settings } from "@/entities/settings";

import { syncAppIcon, syncAppIconFromSettings } from "@/shared/lib/app-icons";

/**
 * Иконка приложения при запуске (boot в public/js/app.js): значок вкладки по выбору, Premium-иконка
 * без Premium — обратно к стандартной (и когда Premium кончился на ходу); выбор из аккаунта — один
 * раз, когда пришли настройки.
 */
export function useAppIcon(user: SelfUser, settings: Settings | undefined) {
  const premium = !!user.isPremium;
  useEffect(() => syncAppIcon({ isPremium: premium }), [premium]);

  const restored = useRef(false);
  useEffect(() => {
    if (!settings || restored.current) return;
    restored.current = true;
    syncAppIconFromSettings(settings.appIcon, { isPremium: premium });
  }, [settings, premium]);
}
