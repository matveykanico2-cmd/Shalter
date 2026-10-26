import { useEffect, useState } from "react";

import type { Settings } from "@/entities/settings";

import { hasPasscode } from "@/shared/lib/passcode";

// Свернули приложение дольше этого — при возвращении снова код-пароль (boot в public/js/app.js).
const RELOCK_THRESHOLD_MS = 5000;

/**
 * Что закрывает приложение при запуске: код-пароль этого устройства (и снова — после 5 с в фоне)
 * и «Пароль при запуске» из настроек аккаунта (один раз за загрузку страницы).
 */
export function useAppLock(settings: Settings | undefined) {
  const [passcode, setPasscode] = useState(hasPasscode);
  const [passwordDone, setPasswordDone] = useState(false);
  // Только настройки на момент запуска: включили «Пароль при запуске» сейчас — спросит со следующего.
  const [onLaunch, setOnLaunch] = useState<boolean | null>(null);
  if (onLaunch === null && settings) setOnLaunch(!!settings.requirePasswordOnLaunch);

  useEffect(() => {
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hasPasscode() && Date.now() - hiddenAt >= RELOCK_THRESHOLD_MS) setPasscode(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  return {
    passcode,
    password: !passwordDone && !!onLaunch,
    unlockPasscode: () => setPasscode(false),
    unlockPassword: () => setPasswordDone(true),
  };
}
