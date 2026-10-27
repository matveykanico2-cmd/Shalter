import { Injectable } from "@nestjs/common";
import { ChatsRepository } from "../chats/chats.repository.js";
import { ContactsRepository } from "../users/contacts.repository.js";
import { UsersRepository } from "../users/users.repository.js";

// Кто видит чьи истории — server/lib/storyAudience.js и visibleAuthorIds из server/routes/stories.js.
// Две стороны одного правила: должны совпадать.
@Injectable()
export class StoryAudienceService {
  public constructor(
    private readonly users: UsersRepository,
    private readonly contacts: ContactsRepository,
    private readonly chats: ChatsRepository
  ) {}

  /**
   * Кому видна история автора: те, кого автор сам добавил в контакты, и те, с кем у автора
   * есть личная переписка. Контакт считается со стороны автора: тот, кто просто добавил автора
   * к себе, без его согласия истории не видит. Заблокированным автором — не видна.
   */
  public audienceOf(authorId: string): string[] {
    const blocked = new Set(this.users.findById(authorId)?.blockedUserIds ?? []);
    const contacts = this.contacts.findForOwner(authorId).map((c) => c.userId);
    return [...new Set([authorId, ...contacts, ...this.chats.dmPartnerIds(authorId)])].filter((id) => !blocked.has(id));
  }

  /**
   * Чьи истории видит uid — зеркально audienceOf: авторы, у которых он в контактах, и
   * собеседники по личке, кроме заблокировавших его, плюс каналы. По этому списку
   * проверяются и просмотр, лайки и комментарии по известному id.
   */
  public visibleAuthorIds(uid: string): string[] {
    const channelIds = this.chats
      .findForUser(uid)
      .filter((c) => c.type === "channel")
      .map((c) => c.id);
    const people = [...new Set([...this.contacts.listOwnersOf(uid), ...this.chats.dmPartnerIds(uid)])].filter((id) => id !== uid);
    const authors = this.users
      .findByIds(people)
      .filter((u) => !(u.blockedUserIds ?? []).includes(uid))
      .map((u) => u.id);
    return [...new Set([uid, ...authors, ...channelIds])];
  }
}
