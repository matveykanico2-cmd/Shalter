// Настройки пользователя: server/routes/settings.js и DEFAULT_SETTINGS
// (server/data/settings.js). Объект настроек целиком хранится JSON-ом; PATCH
// сливает верхний уровень с текущими значениями, поэтому ключи, которые пишут
// другие модули (chatFlags, pinnedOrder, ai, appIcon…), появляются по мере
// использования — они .optional().
import { z } from "zod";
import { anyJson } from "./common";

export const privacyLevel = z.enum(["everyone", "contacts", "nobody"]);

const privacyException = z.strictObject({ allow: z.array(z.string()), deny: z.array(z.string()) });

/** settings.privacy после normalizePrivacy (server/lib/privacyRules.js). */
export const privacySettings = z.strictObject({
  lastSeen: privacyLevel,
  phone: privacyLevel,
  discoverByPhone: privacyLevel,
  photo: privacyLevel,
  bio: privacyLevel,
  birthday: privacyLevel,
  forwards: privacyLevel,
  invites: privacyLevel,
  calls: privacyLevel,
  botMessages: privacyLevel,
  storiesArchive: privacyLevel,
  // Есть в PRIVACY_KEYS, но не в значениях по умолчанию.
  messages: privacyLevel.optional(),
  // normalizePrivacy убирает пустой объект исключений целиком.
  exceptions: z.record(z.string(), privacyException).optional(),
});

const dayHours = z.strictObject({ closed: z.boolean(), open: z.string(), close: z.string() });
const autoReply = z.strictObject({ enabled: z.boolean(), text: z.string(), attachments: z.array(anyJson) });

export const businessSettings = z.strictObject({
  enabled: z.boolean(),
  hours: z.strictObject({ mon: dayHours, tue: dayHours, wed: dayHours, thu: dayHours, fri: dayHours, sat: dayHours, sun: dayHours }),
  timeZone: z.string().nullable(),
  showHours: z.boolean(),
  greeting: autoReply,
  away: autoReply,
  quickReplies: z.array(
    z.strictObject({ id: z.string(), shortcut: z.string(), text: z.string(), attachments: z.array(anyJson) })
  ),
});

export const holidaySettings = z.strictObject({
  disabled: z.array(z.string()),
  custom: z.array(z.strictObject({ id: z.string(), title: z.string(), date: z.string().regex(/^\d{2}-\d{2}$/) })),
});

/** Весь объект настроек. Клиентские ключи сервер проверяет по белому списку (routes/settings.js). */
export const settings = z.strictObject({
  theme: z.string(),
  accent: z.string(),
  reduceMotion: z.boolean(),
  fontSize: z.number(),
  requirePasswordOnLaunch: z.boolean(),
  pinnedChannelIds: z.array(z.string()),
  notifications: z.record(z.string(), anyJson),
  privacy: privacySettings,
  chatWallpaper: z.string(),
  chatWallpaperImage: z.string().nullable(),
  homeWallpaper: z.boolean(),
  translateLanguage: z.string(),
  uiLanguage: z.string(),
  autoDownload: z.boolean(),
  voiceTranscription: z.boolean(),
  timeFormat: z.union([z.literal(12), z.literal(24)]),
  chatClears: z.record(z.string(), anyJson),
  hiddenChats: z.record(z.string(), anyJson),
  chatWallpapers: z.record(z.string(), anyJson),
  drafts: z.record(z.string(), anyJson),
  holidays: holidaySettings,
  business: businessSettings,
  appIcon: z.string().regex(/^[a-z0-9-]{1,32}$/).optional(),
  chatFlags: z.record(z.string(), anyJson).optional(),
  pinnedOrder: anyJson.optional(),
  ai: anyJson.optional(),
});

export const holidayCatalog = z.array(z.strictObject({ id: z.string(), title: z.string(), date: z.string() }));

export const settingsGetBody = z.strictObject({ settings, holidayCatalog });
export const settingsPatchBody = z.strictObject({ settings });

export const storageBody = z.strictObject({
  bytesByBucket: z.strictObject({
    photos: z.number().nonnegative(),
    videos: z.number().nonnegative(),
    files: z.number().nonnegative(),
    voice: z.number().nonnegative(),
  }),
});
