const db = require("../db");

const DEFAULT_SETTINGS = {
  theme: "system",
  accent: "#2E56D9",
  // "Отключить анимации" in the account menu (public/js/components/navRail.js)
  // — toggles the html[data-reduce-motion] CSS rule in base.css.
  reduceMotion: false,
  fontSize: 15,
  notifications: { previewText: true, sound: true, mutedChatIds: [] },
  privacy: {
    lastSeen: "everyone",
    phone: "contacts",
    photo: "everyone",
    bio: "everyone",
    birthday: "everyone",
    // "Who can add a clickable link back to me when my messages are
    // forwarded" — enforced in messageBubble.js's forwarded-banner rendering
    // (server/routes/messages.js stamps forwardedFrom.linkAllowed at forward
    // time, since that's a snapshot the same way senderName/chatTitle are).
    forwards: "everyone",
    // "Who can add me to groups/channels without an invite link" — enforced
    // in the /:id/members "add" branch (server/routes/chats.js).
    invites: "everyone",
    // "Who can call me" — same everyone/contacts/nobody shape, enforced in
    // POST /api/calls and POST /api/calls/:id/participants (server/routes/
    // calls.js). Defaults to "everyone" so this is non-breaking for every
    // account that existed before this setting did.
    calls: "everyone",
  },
  chatWallpaper: "default",
  // Only meaningful when chatWallpaper === "custom" — a data URL, same
  // client-side-downscaled-before-upload pattern as avatarImage (see
  // public/js/lib/image.js), stored inline since there's no object storage
  // in this app (see AGENTS.md's JSON-column note for per-user settings).
  chatWallpaperImage: null,
  // Target language for the per-message "Перевести" action (messageBubble.js)
  // — a plain ISO 639-1 code passed straight through to the translate API.
  translateLanguage: "ru",
  // Target language for the *interface itself* (public/js/lib/uiTranslate.js)
  // — "ru" means "don't translate," since that's the language the UI is
  // authored in. Unlike translateLanguage, this one triggers a live pass
  // over the app's own DOM through the same Google Translate endpoint.
  uiLanguage: "ru",
  autoDownload: true,
  // Per-chat "clear history for me" timestamps (ISO) — messages at or before
  // this point are hidden from this user's view only. See server/routes/chats.js.
  chatClears: {},
  // Per-chat "delete for me" timestamps (ISO) — the chat itself drops out of
  // this user's chat list (not just its history) unless/until a newer
  // message arrives, at which point it reappears (same as Telegram: deleting
  // a chat for yourself doesn't stop the other side from messaging you
  // again). See server/routes/chats.js.
  hiddenChats: {},
  // Per-chat wallpaper override — { [chatId]: { id, image? } }, same
  // id/image shape as the global chatWallpaper/chatWallpaperImage pair
  // above, just scoped to one conversation (DM, group, or channel). A chat
  // with no entry here falls back to the global wallpaper (see
  // chatView.js's applyWallpaper()). Private to this account only, same as
  // Telegram's own per-chat background — the other side isn't affected.
  chatWallpapers: {},
  // Per-chat unsent-message draft — { [chatId]: text }. Private to this
  // account (same as chatWallpapers), read back into the composer on open
  // and shown in the chat list preview (chatListItem.js's `chat.draft`
  // check — that field was dead code until attachSummaries started
  // populating it from here). Debounce-saved as the user types (see
  // composer.js), cleared the moment a message actually sends.
  drafts: {},
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

// "Delete for me" — clears history *and* drops the chat out of this user's
// list, in one settings write (both timestamps need to agree, or a chat
// could reappear in the list with its old history still cleared, or vice
// versa).
async function deleteChatForUser(userId, chatId, iso) {
  const current = await getSettings(userId);
  return updateSettings(userId, {
    chatClears: { ...current.chatClears, [chatId]: iso },
    hiddenChats: { ...current.hiddenChats, [chatId]: iso },
  });
}

// Sets (or, with wallpaper === null, clears) this user's per-chat wallpaper
// override — read-merge-write so patching one chat's entry doesn't clobber
// every other chat's override (a plain updateSettings({chatWallpapers: {...}})
// call from the route would replace the whole map).
async function setChatWallpaper(userId, chatId, wallpaper) {
  const current = await getSettings(userId);
  const next = { ...current.chatWallpapers };
  if (wallpaper) next[chatId] = wallpaper;
  else delete next[chatId];
  return updateSettings(userId, { chatWallpapers: next });
}

// Sets (or, with an empty/falsy text, clears) this user's draft for one
// chat — same read-merge-write shape as setChatWallpaper.
async function setDraft(userId, chatId, text) {
  const current = await getSettings(userId);
  const next = { ...current.drafts };
  if (text) next[chatId] = text;
  else delete next[chatId];
  return updateSettings(userId, { drafts: next });
}

module.exports = {
  getSettings,
  updateSettings,
  setChatCleared,
  deleteChatForUser,
  setChatWallpaper,
  setDraft,
  DEFAULT_SETTINGS,
};
