const db = require("../db");

const DEFAULT_SETTINGS = {
  theme: "system",
  accent: "",
  reduceMotion: false,
  fontSize: 15,
  requirePasswordOnLaunch: false,
  pinnedChannelIds: [],
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
  translateLanguage: "ru",
  uiLanguage: "ru",
  autoDownload: true,
  chatClears: {},
  hiddenChats: {},
  chatWallpapers: {},
  drafts: {},
  holidays: { disabled: [], custom: [] },
  business: {
    enabled: false,
    hours: {
      mon: { closed: false, open: "09:00", close: "18:00" },
      tue: { closed: false, open: "09:00", close: "18:00" },
      wed: { closed: false, open: "09:00", close: "18:00" },
      thu: { closed: false, open: "09:00", close: "18:00" },
      fri: { closed: false, open: "09:00", close: "18:00" },
      sat: { closed: true, open: "09:00", close: "18:00" },
      sun: { closed: true, open: "09:00", close: "18:00" },
    },
    timeZone: null,
    showHours: true,
    greeting: { enabled: false, text: "", attachments: [] },
    away: { enabled: false, text: "", attachments: [] },
    quickReplies: [],
  },
};

async function getSettings(userId) {
  const row = db.prepare("SELECT data FROM settings WHERE userId = ?").get(userId);
  return row ? JSON.parse(row.data) : DEFAULT_SETTINGS;
}

async function updateSettings(userId, patch) {
  const current = await getSettings(userId);
  const updated = { ...DEFAULT_SETTINGS, ...current, ...patch };
  db.prepare(
    `INSERT INTO settings (userId, data) VALUES (?, ?) ON CONFLICT(userId) DO UPDATE SET data = excluded.data`
  ).run(userId, JSON.stringify(updated));
  return updated;
}

async function setChatCleared(userId, chatId, iso) {
  return updateSettings(userId, { chatClears: { ...(await getSettings(userId)).chatClears, [chatId]: iso } });
}

async function deleteChatForUser(userId, chatId, iso) {
  const current = await getSettings(userId);
  return updateSettings(userId, {
    chatClears: { ...current.chatClears, [chatId]: iso },
    hiddenChats: { ...current.hiddenChats, [chatId]: iso },
  });
}

async function setChatWallpaper(userId, chatId, wallpaper) {
  const current = await getSettings(userId);
  const next = { ...current.chatWallpapers };
  if (wallpaper) next[chatId] = wallpaper;
  else delete next[chatId];
  return updateSettings(userId, { chatWallpapers: next });
}

async function setDraft(userId, chatId, text) {
  const current = await getSettings(userId);
  const next = { ...current.drafts };
  if (text) next[chatId] = text;
  else delete next[chatId];
  return updateSettings(userId, { drafts: next });
}

// «Отметить как непрочитанное» снимается, когда чат открыли или прочитали.
async function clearUnreadMark(userId, chatId) {
  const current = await getSettings(userId);
  const flags = current.chatFlags?.[chatId];
  if (!flags?.unread) return;
  const { unread, ...rest } = flags;
  await updateSettings(userId, { chatFlags: { ...current.chatFlags, [chatId]: rest } });
}

function mutedStateFor(settings, chatId) {
  const value = settings?.notifications?.mutedChats?.[chatId];
  if (!value) return { muted: false, mutedUntil: null };
  if (value === true) return { muted: true, mutedUntil: null };
  const until = String(value);
  if (new Date(until).getTime() > Date.now()) return { muted: false, mutedUntil: until };
  return { muted: false, mutedUntil: null };
}

function isQuietNow(settings, chatId) {
  const state = mutedStateFor(settings, chatId);
  return state.muted || (!!state.mutedUntil && new Date(state.mutedUntil).getTime() > Date.now());
}

module.exports = {
  mutedStateFor,
  isQuietNow,
  getSettings,
  updateSettings,
  setChatCleared,
  deleteChatForUser,
  setChatWallpaper,
  setDraft,
  clearUnreadMark,
  DEFAULT_SETTINGS,
};
