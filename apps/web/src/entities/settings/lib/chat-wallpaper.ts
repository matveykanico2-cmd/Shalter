import { asWallpaper, type Wallpaper } from "@/shared/ui";

import type { Settings } from "../api/settings-queries";

/** Обои чата: свои для этого чата, иначе общие (поставил кто-то «у всех»), иначе обои из настроек — как applyWallpaper (chatView.js). */
export function chatWallpaper(settings: Settings | undefined, chatId: string, shared: unknown): Wallpaper {
  return (
    asWallpaper(settings?.chatWallpapers?.[chatId]) ??
    asWallpaper(shared) ?? { id: settings?.chatWallpaper ?? "default", image: settings?.chatWallpaperImage }
  );
}
