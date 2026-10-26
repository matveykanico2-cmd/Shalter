import { useEffect } from "react";

import { startDownloadTracking } from "@/shared/lib/downloads";
import { installNativeDownloads } from "@/shared/lib/native-download";
import { startSystemBarsSync } from "@/shared/lib/system-bars";
import { toast } from "@/shared/ui";

/**
 * Связь с устройством при запуске: «Загрузки» запоминают скачанное, в Android-приложении — полосы
 * системы в цвет темы и сохранение файлов (WebView сам не скачивает).
 */
export function useDeviceBridges() {
  useEffect(() => {
    const offs = [startDownloadTracking(), startSystemBarsSync(), installNativeDownloads((text) => toast(text))];
    return () => offs.forEach((off) => off());
  }, []);
}
