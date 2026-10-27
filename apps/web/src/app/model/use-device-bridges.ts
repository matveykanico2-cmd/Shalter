import { useEffect } from "react";
import { type NavigateFunction, useNavigate } from "react-router";

import { startDownloadTracking } from "@/shared/lib/downloads";
import { installNativeDownloads } from "@/shared/lib/native-download";
import { startSystemBarsSync } from "@/shared/lib/system-bars";
import { toast } from "@/shared/ui";

type BridgeWindow = Window & {
  __shalterOpen?: (path: string) => void;
  shalterDesktop?: { openBrowser?: (url: string) => unknown };
};

const SERVER_PAGES = /^\/(s|app|download|knowledge|games|bots|promo|premium|short|oauth-docs|uploads|api)(\/|$|\?)/;

/** Путь внутри приложения: только свой адрес, чужой — null. */
function ownPath(raw: unknown) {
  if (typeof raw !== "string") return null;
  try {
    const u = new URL(raw, location.origin);
    return u.origin === location.origin ? u.pathname + u.search + u.hash : null;
  } catch {
    return null;
  }
}

/**
 * Нажали на push-уведомление, а приложение уже открыто: service worker (public/sw.js) просит
 * перейти к чату здесь же, без перезагрузки страницы, и ждёт ответа в порт — без ответа он
 * перезагрузит вкладку по адресу сам.
 */
function listenServiceWorker(navigate: NavigateFunction) {
  const sw = navigator.serviceWorker;
  if (!sw) return () => {};
  const onMessage = (e: MessageEvent<{ type?: string; path?: string }>) => {
    if (e.data?.type !== "shalter:open") return;
    const path = ownPath(e.data.path);
    if (!path || SERVER_PAGES.test(path)) return;
    void navigate(path);
    e.ports[0]?.postMessage("ok");
  };
  sw.addEventListener("message", onMessage);
  return () => sw.removeEventListener("message", onMessage);
}

/**
 * Приложение для компьютера (Tauri): ссылка «в новой вкладке» в системном WebView никуда не
 * ведёт (WebKit на macOS и Linux такие клики молча глотает), а свою страницу мост открыл бы
 * вместо приложения — окно без кнопки «Назад». Свои страницы (/games, /bots…) открываем
 * отдельным окном оболочки, чужие — window.open, который мост отдаёт браузеру по умолчанию.
 */
function interceptDesktopLinks() {
  const desktop = (window as BridgeWindow).shalterDesktop;
  if (!desktop) return () => {};
  const onClick = (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0) return;
    const a = (e.target as Element | null)?.closest?.<HTMLAnchorElement>("a[href]");
    if (!a || a.target !== "_blank" || a.hasAttribute("download")) return;
    let url: URL;
    try {
      url = new URL(a.href, location.href);
    } catch {
      return;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return;
    e.preventDefault();
    if (url.origin === location.origin && desktop.openBrowser) void desktop.openBrowser(url.href);
    else window.open(url.href, "_blank", "noopener");
  };
  document.addEventListener("click", onClick);
  return () => document.removeEventListener("click", onClick);
}

/**
 * Связь с устройством при запуске: «Загрузки» запоминают скачанное, в Android-приложении — полосы
 * системы в цвет темы и сохранение файлов (WebView сам не скачивает), переход по нажатию на
 * уведомление, ссылки в новом окне в приложении для компьютера.
 */
export function useDeviceBridges() {
  const navigate = useNavigate();
  useEffect(() => {
    const offs = [
      startDownloadTracking(),
      startSystemBarsSync(),
      installNativeDownloads((text) => toast(text)),
      listenServiceWorker(navigate),
      interceptDesktopLinks(),
    ];
    // Переход из нативной части (нажатие на уведомление, звонок на Android) без перезагрузки
    // страницы — MainActivity зовёт window.__shalterOpen(path), как в public/js/app.js.
    const w = window as BridgeWindow;
    w.__shalterOpen = (path) => {
      const own = ownPath(path);
      if (!own) return;
      // Страницы сервера, а не приложения (короткие ссылки /s/…, мини-приложения /app/…), —
      // обычным переходом: роутер приложения их не знает.
      if (SERVER_PAGES.test(own)) window.location.assign(own);
      else void navigate(own);
    };
    offs.push(() => delete w.__shalterOpen);
    return () => offs.forEach((off) => off());
  }, [navigate]);
}
