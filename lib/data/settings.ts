import { readDoc, updateDoc } from "./store";
import type { Settings } from "../types";

const FILE = "settings";

type SettingsMap = Record<string, Settings>;

const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  accent: "#2E56D9",
  fontSize: 15,
  notifications: { previewText: true, sound: true, mutedChatIds: [] },
  privacy: { lastSeen: "everyone", phone: "contacts", photo: "everyone" },
  chatWallpaper: "default",
  autoDownload: true,
};

export async function getSettings(userId: string): Promise<Settings> {
  const all = await readDoc<SettingsMap>(FILE);
  return all[userId] ?? DEFAULT_SETTINGS;
}

export async function updateSettings(userId: string, patch: Partial<Settings>): Promise<Settings> {
  let updated!: Settings;
  await updateDoc<SettingsMap>(FILE, (all) => {
    updated = { ...DEFAULT_SETTINGS, ...all[userId], ...patch } as Settings;
    return { ...all, [userId]: updated };
  });
  return updated;
}
