import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";

import { permissionsAlreadyAsked,PermissionsDialog } from "@/features/permissions";

import type { SelfUser } from "@/entities/session";
import { settingsQueries } from "@/entities/settings";

import { useAppIcon } from "../model/use-app-icon";
import { useAppLock } from "../model/use-app-lock";
import { useDesktopUnread } from "../model/use-desktop-unread";
import { useDeviceBridges } from "../model/use-device-bridges";
import { useKeyboardShortcuts } from "../model/use-keyboard-shortcuts";
import { useNativeNotify } from "../model/use-native-notify";
import { useServiceWorker } from "../model/use-service-worker";
import { useUiTranslation } from "../model/use-ui-translation";
import { useNativeUpdateCheck, useVersionWatch } from "../model/use-version-watch";

import { HolidayBanner } from "./holiday-banner";
import { PasscodeLockScreen } from "./passcode-lock-screen";
import { PasswordLockScreen } from "./password-lock-screen";
import styles from "./signed-in.module.css";

type Props = {
  user: SelfUser;
  /** Пришёл /api/bootstrap — с ним настройки аккаунта. */
  ready: boolean;
  children: ReactNode;
};

/**
 * Служебное вокруг приложения, как boot() в public/js/app.js: экраны блокировки (код-пароль
 * устройства, «Пароль при запуске»), service worker и push, проверка новой версии, горячие
 * клавиши, мосты приложений, перевод интерфейса, иконка, праздничная плашка, окно разрешений.
 */
export function AppServices({ user, ready, children }: Props) {
  // Настройки кладёт в кэш /api/bootstrap — отдельно не запрашиваем.
  const settings = useQuery({ ...settingsQueries.current(), enabled: ready }).data;
  const lock = useAppLock(settings);
  const locked = lock.passcode || lock.password;
  const [permissions, setPermissions] = useState(false);

  useServiceWorker();
  useVersionWatch();
  useNativeUpdateCheck();
  useKeyboardShortcuts();
  useDesktopUnread();
  useNativeNotify(user.id);
  useDeviceBridges();
  useAppIcon(user, settings);
  useUiTranslation(settings?.uiLanguage);

  // Первый запуск — окно разрешений, чуть погодя (и не поверх экрана блокировки).
  useEffect(() => {
    if (locked || permissionsAlreadyAsked()) return;
    const timer = setTimeout(() => setPermissions(true), 1500);
    return () => clearTimeout(timer);
  }, [locked]);

  return (
    <>
      <div className={locked ? styles.locked : styles.app} hidden={locked} inert={locked}>
        <HolidayBanner />
        {children}
      </div>
      {lock.passcode ? (
        <PasscodeLockScreen onUnlock={lock.unlockPasscode} />
      ) : lock.password ? (
        <PasswordLockScreen onUnlock={lock.unlockPassword} />
      ) : permissions ? (
        <PermissionsDialog onClose={() => setPermissions(false)} />
      ) : null}
    </>
  );
}
