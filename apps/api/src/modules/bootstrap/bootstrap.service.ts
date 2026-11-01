import { Injectable } from "@nestjs/common";
import type { Request } from "express";
import { chatSummary } from "../../legacy/legacy.js";
import { ChatsRepository } from "../chats/chats.repository.js";
import { FoldersRepository } from "../folders/folders.repository.js";
import { UiLanguageService } from "../ui-language/ui-language.service.js";
import { ContactsRepository } from "../users/contacts.repository.js";
import { UserSettingsService } from "../users/user-settings.service.js";

const BOOTSTRAP_LANGUAGE_WAIT_MS = 1000;

// Первый экран клиента одним запросом — как server/routes/bootstrap.js.
@Injectable()
export class BootstrapService {
  public constructor(
    private readonly chats: ChatsRepository,
    private readonly folders: FoldersRepository,
    private readonly contacts: ContactsRepository,
    private readonly userSettings: UserSettingsService,
    private readonly uiLanguage: UiLanguageService
  ) {}

  /** Настройки, чаты со сводками без скрытых (как GET /api/chats), папки и id контактов. */
  public async load(uid: string, deviceId: string | null, req: Request) {
    // Автоязык интерфейса следует за страной IP; геосервис ждём не дольше секунды (иначе — в следующий раз).
    await this.uiLanguage.refresh(uid, req, BOOTSTRAP_LANGUAGE_WAIT_MS);
    const settings = this.userSettings.get(uid);
    const chats = this.chats.findListForUser(uid, deviceId);
    const folders = this.folders.findForOwner(uid);
    const contactIds = this.contacts.findForOwner(uid).map((c) => c.userId);
    const summary = chatSummary();
    return {
      settings,
      chats: summary.withoutHidden(await summary.attachSummaries(chats, uid), settings.hiddenChats),
      folders,
      contactIds,
    };
  }
}
