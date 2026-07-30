const { readDoc, updateDoc } = require("./store");

const FILE = "settings";

const DEFAULT_SETTINGS = {
  theme: "system",
  accent: "#2E56D9",
  fontSize: 15,
  notifications: { previewText: true, sound: true, mutedChatIds: [] },
  privacy: { lastSeen: "everyone", phone: "contacts", photo: "everyone" },
  chatWallpaper: "default",
  autoDownload: true,
  // Per-chat "clear history for me" timestamps (ISO) — messages at or before
  // this point are hidden from this user's view only. See server/routes/chats.js.
  chatClears: {},
};

async function getSettings(userId) {
  const all = await readDoc(FILE);
  return all[userId] ?? DEFAULT_SETTINGS;
}

async function updateSettings(userId, patch) {
  let updated;
  await updateDoc(FILE, (all) => {
    updated = { ...DEFAULT_SETTINGS, ...all[userId], ...patch };
    return { ...all, [userId]: updated };
  });
  return updated;
}

async function setChatCleared(userId, chatId, iso) {
  return updateSettings(userId, { chatClears: { ...(await getSettings(userId)).chatClears, [chatId]: iso } });
}

module.exports = { getSettings, updateSettings, setChatCleared, DEFAULT_SETTINGS };
