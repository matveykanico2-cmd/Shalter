import { useEffect } from "react";
import { useNavigate } from "react-router";

import { startDownloadTracking } from "@/shared/lib/downloads";
import { installNativeDownloads } from "@/shared/lib/native-download";
import { startSystemBarsSync } from "@/shared/lib/system-bars";
import { toast } from "@/shared/ui";

/**
 * Связь с устройством при запуске: «Загрузки» запоминают скачанное, в Android-приложении — полосы
 * системы в цвет темы и сохранение файлов (WebView сам не скачивает).
 */
export function useDeviceBridges() {
  const navigate = useNavigate();
  useEffect(() => {
    const offs = [startDownloadTracking(), startSystemBarsSync(), installNativeDownloads((text) => toast(text))];
    // Переход из нативной части (нажатие на уведомление, звонок на Android) без перезагрузки
    // страницы — MainActivity зовёт window.__shalterOpen(path), как в public/js/app.js.
    const w = window as Window & { __shalterOpen?: (path: string) => void };
    w.__shalterOpen = (path) => void navigate(path);
    offs.push(() => delete w.__shalterOpen);
    return () => offs.forEach((off) => off());
  }, [navigate]);
}
