import { useQuery } from "@tanstack/react-query";

import { chatWallpaper, settingsQueries } from "@/entities/settings";

import { wallpaperProps } from "@/shared/ui";

import { ChatTips } from "./chat-tips";
import styles from "./home-view.module.css";

/** Правая часть без открытого чата: на обоях — карточки-подсказки, как в tweb (emptyChatPlaceholder). */
export function HomeView() {
  // Настройки и чаты кладёт в кэш /api/bootstrap — отдельно экран их не запрашивает.
  const settings = useQuery({ ...settingsQueries.current(), enabled: false }).data;
  const wallpaper = wallpaperProps(chatWallpaper(settings, "", null));
  return (
    <div className={`${styles.empty} ${wallpaper.className}`} style={wallpaper.style}>
      <ChatTips />
    </div>
  );
}
