import { Injectable } from "@nestjs/common";
import { DEFAULT_SETTINGS } from "./lib/settings.defaults.js";
import type { UserSettings } from "./model/domain.js";
import { SettingsRepository } from "./settings.repository.js";

// Чтение и правка настроек пользователя — getSettings, updateSettings и точечные правки про
// чаты из server/data/settings.js. Та же строка той же таблицы: старый код читает то, что пишет Nest.
@Injectable()
export class UserSettingsService {
  public constructor(private readonly repo: SettingsRepository) {}

  /** Сохранённые настройки как есть; нет строки или она битая — значения по умолчанию. */
  public get(userId: string): UserSettings {
    const data = this.repo.findData(userId);
    if (data === undefined) return structuredClone(DEFAULT_SETTINGS);
    try {
      return JSON.parse(data);
    } catch {
      return structuredClone(DEFAULT_SETTINGS);
    }
  }

  /** Слияние по верхнему уровню поверх значений по умолчанию и текущих. */
  public update(userId: string, patch: Partial<UserSettings>): UserSettings {
    const updated = { ...DEFAULT_SETTINGS, ...this.get(userId), ...patch };
    this.repo.save(userId, JSON.stringify(updated));
    return updated;
  }

  public setChatCleared(userId: string, chatId: string, iso: string): UserSettings {
    return this.update(userId, { chatClears: { ...this.get(userId).chatClears, [chatId]: iso } });
  }

  public deleteChatForUser(userId: string, chatId: string, iso: string): UserSettings {
    const current = this.get(userId);
    return this.update(userId, {
      chatClears: { ...current.chatClears, [chatId]: iso },
      hiddenChats: { ...current.hiddenChats, [chatId]: iso },
    });
  }

  public setChatWallpaper(userId: string, chatId: string, wallpaper: unknown): UserSettings {
    const next = { ...this.get(userId).chatWallpapers };
    if (wallpaper) next[chatId] = wallpaper;
    else delete next[chatId];
    return this.update(userId, { chatWallpapers: next });
  }

  public setDraft(userId: string, chatId: string, text: string): UserSettings {
    const next = { ...this.get(userId).drafts };
    if (text) next[chatId] = text;
    else delete next[chatId];
    return this.update(userId, { drafts: next });
  }

  /** «Отметить как непрочитанное» снимается, когда чат открыли или прочитали. */
  public clearUnreadMark(userId: string, chatId: string): void {
    const current = this.get(userId);
    const flags = current.chatFlags?.[chatId];
    if (!flags?.unread) return;
    const { unread: _unread, ...rest } = flags;
    this.update(userId, { chatFlags: { ...current.chatFlags, [chatId]: rest } });
  }
}
