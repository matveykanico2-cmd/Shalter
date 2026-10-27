import type { UserSettings } from "../model/domain.js";

const DAY = { closed: false, open: "09:00", close: "18:00" };
const DAY_OFF = { closed: true, open: "09:00", close: "18:00" };

/** Настройки нового пользователя — DEFAULT_SETTINGS из server/data/settings.js (settings.service.spec.ts сверяет). */
export const DEFAULT_SETTINGS = {
  theme: "system",
  accent: "",
  reduceMotion: false,
  fontSize: 15,
  requirePasswordOnLaunch: false,
  pinnedChannelIds: [] as string[],
  notifications: { previewText: true, sound: true, mutedChats: {} },
  privacy: {
    lastSeen: "everyone",
    phone: "contacts",
    discoverByPhone: "everyone",
    photo: "everyone",
    bio: "everyone",
    birthday: "everyone",
    forwards: "everyone",
    invites: "everyone",
    calls: "everyone",
    botMessages: "everyone",
    storiesArchive: "nobody",
    exceptions: {},
  },
  chatWallpaper: "default",
  chatWallpaperImage: null,
  homeWallpaper: false,
  translateLanguage: "ru",
  uiLanguage: "ru",
  autoDownload: true,
  voiceTranscription: false,
  chatClears: {},
  hiddenChats: {},
  chatWallpapers: {},
  drafts: {},
  holidays: { disabled: [], custom: [] },
  business: {
    enabled: false,
    hours: { mon: DAY, tue: DAY, wed: DAY, thu: DAY, fri: DAY, sat: DAY_OFF, sun: DAY_OFF },
    timeZone: null,
    showHours: true,
    greeting: { enabled: false, text: "", attachments: [] },
    away: { enabled: false, text: "", attachments: [] },
    quickReplies: [],
  },
} satisfies UserSettings;

/** Без звука ли чат: навсегда (true) или до даты в mutedChats; истёкший срок — со звуком. */
export function mutedStateFor(settings: Partial<UserSettings> | undefined, chatId: string): { muted: boolean; mutedUntil: string | null } {
  const value = settings?.notifications?.mutedChats?.[chatId];
  if (!value) return { muted: false, mutedUntil: null };
  if (value === true) return { muted: true, mutedUntil: null };
  const until = String(value);
  if (new Date(until).getTime() > Date.now()) return { muted: true, mutedUntil: until };
  return { muted: false, mutedUntil: null };
}

/** Чат заглушён сейчас (навсегда или до mutedUntil). */
export function isQuietNow(settings: Partial<UserSettings> | undefined, chatId: string): boolean {
  const state = mutedStateFor(settings, chatId);
  return state.muted || (!!state.mutedUntil && new Date(state.mutedUntil).getTime() > Date.now());
}
