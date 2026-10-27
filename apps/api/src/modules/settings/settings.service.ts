import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { unsupportedLanguages, usesForeignUpload } from "../../legacy/legacy.js";
import { ChatsRepository } from "../chats/chats.repository.js";
import { MessagesRepository } from "../messages/messages.repository.js";
import { UserSettingsService } from "../users/user-settings.service.js";
import { normalizePrivacy } from "../users/lib/privacy-rules.js";
import { UsersRepository } from "../users/users.repository.js";
import { BUILTIN_HOLIDAYS } from "./lib/holidays.js";
import { mergeNotifications, pickClientKeys, sanitizeBusiness, sanitizeHolidays } from "./lib/settings-sanitize.js";
import type { PatchSettingsDto } from "./model/schemas/settings.schema.js";

const BUCKET_BY_KIND: Record<string, "photos" | "videos" | "files" | "voice"> = {
  image: "photos",
  video: "videos",
  "video-note": "videos",
  file: "files",
  voice: "voice",
};

// Настройки пользователя (/api/settings) — как server/routes/settings.js.
@Injectable()
export class SettingsService {
  public constructor(
    private readonly userSettings: UserSettingsService,
    private readonly users: UsersRepository,
    private readonly chats: ChatsRepository,
    private readonly messages: MessagesRepository
  ) {}

  public get(uid: string) {
    return { settings: this.userSettings.get(uid), holidayCatalog: BUILTIN_HOLIDAYS };
  }

  /** Занятое вложениями место по корзинам во всех чатах пользователя (и чужие вложения тоже). */
  public storage(uid: string) {
    const bytesByBucket = { photos: 0, videos: 0, files: 0, voice: 0 };
    const byKind = this.messages.attachmentBytesByKind(this.chats.findForUser(uid).map((c) => c.id));
    for (const [kind, bytes] of Object.entries(byKind)) {
      const bucket = BUCKET_BY_KIND[kind];
      if (bucket) bytesByBucket[bucket] += bytes;
    }
    return { bytesByBucket };
  }

  public update(uid: string, body: PatchSettingsDto) {
    const patch = pickClientKeys(body);
    if (patch.privacy) patch.privacy = normalizePrivacy(patch.privacy);
    if (patch.notifications) patch.notifications = mergeNotifications(patch.notifications, this.userSettings.get(uid).notifications);
    if (patch.holidays) patch.holidays = sanitizeHolidays(patch.holidays);
    if (patch.business) patch.business = sanitizeBusiness(patch.business, !!this.users.findById(uid)?.isBusiness);
    const languages = unsupportedLanguages();
    if (languages.isUnsupportedLanguage(patch.uiLanguage) || languages.isUnsupportedLanguage(patch.translateLanguage)) {
      throw new ApiError(400, languages.UNSUPPORTED_MESSAGE);
    }
    // Обои, вложения автоответов и т. п.: только свои или и так доступные файлы.
    if (usesForeignUpload(uid, patch, this.userSettings.get(uid))) throw new ApiError(400, "Некорректная ссылка на файл");
    return { settings: this.userSettings.update(uid, patch) };
  }
}
