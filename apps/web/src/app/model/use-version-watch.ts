import type { latestBody } from "@shalter/shared/schemas/misc";
import { useEffect } from "react";
import type { z } from "zod";

import { getCall } from "@/features/call";

import { http } from "@/shared/api";
import { checkForUpdate } from "@/shared/lib/app-update";
import { askConfirm, openExternally, toast } from "@/shared/ui";

const CHECK_EVERY_MS = 5 * 60 * 1000;

const dialogOpen = () => !!document.querySelector('[role="dialog"], [role="alertdialog"]');

/**
 * Проверяет новую версию и показывает кнопку «Обновить».
 * Вкладка не перезапускается автоматически: обновление выполняется только после явного нажатия.
 */
export function useVersionWatch() {
  useEffect(() => {
    const check = async () => {
      await checkForUpdate();
    };
    const onVisible = () => document.visibilityState === "visible" && void check();

    document.addEventListener("visibilitychange", onVisible);
    void check();
    const timer = setInterval(() => void check(), CHECK_EVERY_MS);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
}

// ---------- Обновление самого приложения (APK, iOS, десктоп), как public/js/lib/nativeUpdate.js ----------

const SNOOZE_KEY = "shalter.nativeUpdate.snooze";
const SNOOZE_MS = 24 * 60 * 60 * 1000;
const NATIVE_CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

type ShellWindow = Window & {
  shalterDesktop?: { platform?: string; packaging?: string; version?: string; installUpdate?: (url: string) => Promise<string> };
  Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
};

/** Какая оболочка установлена и её версия: Android/iOS — из User-Agent, десктоп — из моста. */
function installed() {
  const w = window as ShellWindow;
  const desktop = w.shalterDesktop;
  if (desktop) {
    // Linux теперь распространяется только как .deb. Старому AppImage предлагаем скачать
    // пакет вручную: его автообновлятор нельзя кормить .deb вместо исполняемого файла.
    const platform = ({ win32: "windows", linux: "linux-deb", darwin: "macos-arm64" } as Record<string, string>)[desktop.platform ?? ""];
    // Сборки до этой версии моста версию не сообщали — значит, они старые.
    return platform ? { platform, version: desktop.version || "0", automatic: desktop.platform !== "linux" || desktop.packaging === "deb" } : null;
  }
  if (!w.Capacitor?.isNativePlatform?.()) return null;
  const platform = w.Capacitor.getPlatform?.();
  if (platform !== "android" && platform !== "ios") return null;
  return { platform, version: /ShalterNative\/([\d.]+)/.exec(navigator.userAgent)?.[1] ?? "0" };
}

export function newer(a: string, b: string) {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  }
  return false;
}

export function nativeUpdateState(latest: Pick<Latest, "version" | "minimumVersion">, installedVersion: string) {
  const available = !!latest.version && newer(latest.version, installedVersion);
  return { available, mandatory: available && !!latest.minimumVersion && newer(latest.minimumVersion, installedVersion) };
}

function snoozed(version: string) {
  try {
    const s = JSON.parse(localStorage.getItem(SNOOZE_KEY) || "null") as { version: string; until: number } | null;
    return s?.version === version && Date.now() < s.until;
  } catch {
    return false;
  }
}

function snooze(version: string) {
  try {
    localStorage.setItem(SNOOZE_KEY, JSON.stringify({ version, until: Date.now() + SNOOZE_MS }));
  } catch {
    // Хранилище недоступно — спросим снова при следующей проверке.
  }
}

type Latest = { version?: string | null; minimumVersion?: string | null; url?: string | null; page?: string | null; size?: number | null };

/** Вышла новая сборка приложения — предлагаем обновиться (как в Telegram). В браузере не работает. */
export function useNativeUpdateCheck() {
  useEffect(() => {
    const app = installed();
    if (!app) return;
    let asking = false;
    const check = async () => {
      if (asking || document.visibilityState !== "visible") return;
      let latest: Latest;
      try {
        latest = (await http.get<z.infer<typeof latestBody>>(`/api/downloads/latest?platform=${encodeURIComponent(app.platform)}`)) as Latest;
      } catch {
        return;
      }
      const state = nativeUpdateState(latest, app.version);
      if (!latest.version || !state.available) return;
      const { mandatory } = state;
      if (!mandatory && snoozed(latest.version)) return;
      // Не перебиваем звонок и открытые окна — спросим при следующей проверке.
      if (getCall() || dialogOpen()) return;
      const url = latest.url ? new URL(latest.url, location.origin).href : app.platform === "ios" ? null : new URL(latest.page || "/download", location.origin).href;
      if (!url) return;
      asking = true;
      try {
        const ok = await askConfirm(
          mandatory
            ? `Нужно обновить Shalter до версии ${latest.minimumVersion}\n\nУстановленная версия ${app.version === "0" ? "слишком старая" : app.version} больше не поддерживается. Чаты и настройки сохранятся.`
            : `Доступна новая версия Shalter ${latest.version}\n\nВ ней исправления и новые возможности. Установите обновление — чаты и настройки сохранятся.`,
          { okLabel: "Обновить", cancelLabel: mandatory ? "Закрыть" : "Позже" }
        );
        const bridge = (window as ShellWindow).shalterDesktop;
        if (!ok && !mandatory) snooze(latest.version);
        else if (app.automatic !== false && bridge?.installUpdate && latest.url) {
          // Приложение для компьютера обновляется само: скачивает сборку и ставит её поверх.
          const sizeMb = latest.size ? ` (${Math.round(latest.size / 1048576)} МБ)` : "";
          toast(`Скачиваем обновление${sizeMb}… Shalter перезапустится сам`, { durationMs: 8000 });
          try {
            if ((await bridge.installUpdate(url)) === "external") toast("Откройте скачанный пакет, чтобы установить обновление");
          } catch (err) {
            toast(`Не удалось обновить автоматически: ${err instanceof Error ? err.message : String(err)}. Открываем страницу загрузки`);
            openExternally(new URL("/download", location.origin).href);
          }
        } else openExternally(url);
      } finally {
        asking = false;
      }
    };
    const first = setTimeout(() => void check(), 15000);
    const timer = setInterval(() => void check(), NATIVE_CHECK_EVERY_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);
}
