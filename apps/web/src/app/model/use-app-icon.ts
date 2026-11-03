import { useEffect } from "react";

import type { SelfUser } from "@/entities/session";

import { syncAppIcon } from "@/shared/lib/app-icons";

/**
 * Иконка приложения при запуске (boot в public/js/app.js): значок вкладки по выбору этого
 * устройства, Premium-иконка без Premium — обратно к стандартной (и когда Premium кончился на ходу).
 */
export function useAppIcon(user: SelfUser) {
  const premium = !!user.isPremium;
  useEffect(() => syncAppIcon({ isPremium: premium }), [premium]);
}
