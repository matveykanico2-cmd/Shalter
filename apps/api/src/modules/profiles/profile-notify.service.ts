import { Injectable } from "@nestjs/common";
import { contacts, privacyRules } from "../../legacy/legacy.js";
import { ChatsRepository } from "../chats/chats.repository.js";
import { RealtimeService } from "../realtime/realtime.service.js";
import { publicUser } from "../users/lib/user.presenter.js";
import type { User } from "../users/model/domain.js";

// Профиль изменился: contact:updated самому себе, собеседникам по личным чатам и ботам и
// тем, у кого он в контактах, — каждому своя версия (имя из контактов, приватность).
// Как notifyProfileChanged в server/lib/notifyProfileChanged.js; его копия там остаётся
// для аватарок, статусов и музыки профиля, пока они в server/.
@Injectable()
export class ProfileNotifyService {
  public constructor(
    private readonly chats: ChatsRepository,
    private readonly realtime: RealtimeService
  ) {}

  public profileChanged(userId: string, user: User): void {
    this.realtime.broadcastToUsers([userId], { type: "contact:updated", user: publicUser(user) });
    const peers = this.dmPeersOf(userId);
    for (const ownerId of contacts().listOwnersOf(userId)) peers.add(ownerId);
    peers.delete(userId);
    for (const viewerId of peers) {
      privacyRules()
        .publicUserFor(user, viewerId)
        .then((visible) => this.realtime.broadcastToUsers([viewerId], { type: "contact:updated", user: visible }))
        .catch((err) => console.error("profile change notify failed:", err));
    }
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
