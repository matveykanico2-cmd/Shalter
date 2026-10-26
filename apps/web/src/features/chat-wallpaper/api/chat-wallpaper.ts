import type { chatBody } from "@shalter/shared/schemas/chats";
import type { z } from "zod";

import type { Settings } from "@/entities/settings";

import { http } from "@/shared/api";
import type { Wallpaper } from "@/shared/ui";

const wallpaperPath = (chatId: string) => `/api/chats/${encodeURIComponent(chatId)}/wallpaper`;

/** Фон «только у меня» — сервер отдаёт настройки целиком (wallpaperPersonalBody). */
export const setMyChatWallpaper = (chatId: string, wallpaper: Wallpaper | null) =>
  http.post<{ settings: Settings }>(wallpaperPath(chatId), { wallpaper, forEveryone: false, label: null });

/** Фон «у всех участников» — в чате появится служебное сообщение с label. */
export const setSharedChatWallpaper = (chatId: string, wallpaper: Wallpaper | null, label: string | null) =>
  http.post<z.infer<typeof chatBody>>(wallpaperPath(chatId), { wallpaper, forEveryone: true, label });
