import { Injectable } from "@nestjs/common";
import { ContactsRepository } from "./contacts.repository.js";
import { applyContactName, privacyAllows, privacyAllowsLazy } from "./lib/privacy-rules.js";
import { publicUser } from "./lib/user.presenter.js";
import type { User } from "./model/domain.js";
import { UserSettingsService } from "./user-settings.service.js";

// Приватность с чтением настроек и контактов — allowsUser, recordsReadTime и publicUserFor
// из server/lib/privacyRules.js. Сами правила — lib/privacy-rules.ts.
@Injectable()
export class UserPrivacyService {
  public constructor(
    private readonly userSettings: UserSettingsService,
    private readonly contacts: ContactsRepository
  ) {}

  /** Пускает ли правило key владельца ownerId зрителя viewerId; себя — всегда. */
  public allowsUser(ownerId: string, key: string, viewerId: string): boolean {
    if (ownerId === viewerId) return true;
    const { privacy } = this.userSettings.get(ownerId);
    return privacyAllowsLazy(privacy, key, viewerId, () => this.contacts.contactIdsOf(ownerId).has(viewerId));
  }

  /**
   * Время прочтения пишем только в личке и только если читатель показывает
   * собеседнику, когда был в сети, — как в Telegram.
   */
  public recordsReadTime(chat: { type: string; memberIds: string[] } | null | undefined, readerId: string): boolean {
    if (chat?.type !== "dm") return false;
    const other = chat.memberIds.find((id) => id !== readerId);
    return !!other && this.allowsUser(readerId, "lastSeen", other);
  }

  /**
   * publicUser с учётом приватности того, чей профиль смотрят: время визита, фото,
   * «о себе» и день рождения — как в GET /users/:id; имя — из контактов смотрящего.
   */
  public publicUserFor(user: User, viewerId: string): ReturnType<typeof publicUser> & Record<string, unknown> {
    const visible: ReturnType<typeof publicUser> & Record<string, unknown> = publicUser(user);
    if (user.id === viewerId) return visible;
    const { privacy } = this.userSettings.get(user.id);
    const isContact = this.contacts.contactIdsOf(user.id).has(viewerId);
    applyContactName(
      visible,
      this.contacts.findForOwner(viewerId).find((c) => c.userId === user.id),
      isContact
    );
    const canSee = (key: string) => privacyAllows(privacy, key, viewerId, isContact);
    const hidden: Record<string, unknown> = visible;
    const blocked = (user.blockedUserIds ?? []).includes(viewerId);
    if (blocked || !canSee("lastSeen")) {
      delete hidden.lastSeen;
      visible.online = false;
    }
    if (blocked || !canSee("photo")) {
      delete hidden.avatarImage;
      delete hidden.avatarImages;
    }
    if (blocked || !canSee("bio")) delete hidden.bio;
    if (blocked || !canSee("birthday")) delete hidden.birthday;
    return visible;
  }

  public publicUsersFor(users: User[], viewerId: string): ReturnType<UserPrivacyService["publicUserFor"]>[] {
    return users.map((u) => this.publicUserFor(u, viewerId));
  }
}
