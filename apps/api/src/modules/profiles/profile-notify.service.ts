import { Injectable } from "@nestjs/common";
import { ChatsRepository } from "../chats/chats.repository.js";
import { RealtimeService } from "../realtime/realtime.service.js";
import { ContactsRepository } from "../users/contacts.repository.js";
import { publicUser } from "../users/lib/user.presenter.js";
import type { User } from "../users/model/domain.js";
import { UserPrivacyService } from "../users/user-privacy.service.js";

// Профиль изменился: contact:updated самому себе, собеседникам по личным чатам и ботам и
// тем, у кого он в контактах, — каждому своя версия (имя из контактов, приватность).
// Как notifyProfileChanged в server/lib/notifyProfileChanged.js; его копия там остаётся
// для аватарок, статусов и музыки профиля, пока они в server/.
@Injectable()
export class ProfileNotifyService {
  public constructor(
    private readonly chats: ChatsRepository,
    private readonly realtime: RealtimeService,
    private readonly contacts: ContactsRepository,
    private readonly privacy: UserPrivacyService
  ) {}

  public profileChanged(userId: string, user: User): void {
    this.realtime.broadcastToUsers([userId], { type: "contact:updated", user: publicUser(user) });
    const peers = this.dmPeersOf(userId);
    for (const ownerId of this.contacts.listOwnersOf(userId)) peers.add(ownerId);
    peers.delete(userId);
    // После ответа маршрута, как в server/: там проекция для каждого считалась асинхронно.
    queueMicrotask(() => {
      for (const viewerId of peers) {
        try {
          this.realtime.broadcastToUsers([viewerId], { type: "contact:updated", user: this.privacy.publicUserFor(user, viewerId) });
        } catch (err) {
          console.error("profile change notify failed:", err);
        }
      }
    });
  }

  // Собеседники по личным чатам и ботам: их «Информация о чате» и список чатов показывают
  // этот профиль, даже если он у них не в контактах.
  private dmPeersOf(userId: string): Set<string> {
    const peers = new Set<string>();
    try {
      for (const chat of this.chats.findForUser(userId)) {
        if (chat.type !== "dm" && chat.type !== "bot") continue;
        for (const id of chat.memberIds) if (id !== userId) peers.add(id);
      }
    } catch (err) {
      console.error("profile change peers lookup failed:", err);
    }
    return peers;
  }
}
