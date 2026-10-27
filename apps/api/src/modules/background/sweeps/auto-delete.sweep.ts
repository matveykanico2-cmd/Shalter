import { Injectable } from "@nestjs/common";
import { uploadAccess } from "../../../legacy/legacy.js";
import { ChatsRepository } from "../../chats/chats.repository.js";
import { MessagesRepository } from "../../messages/messages.repository.js";
import { RealtimeService } from "../../realtime/realtime.service.js";
import type { Sweep } from "../model/sweep.js";

// Автоудаление сообщений по сроку чата — server/lib/autoDelete.js: раз в минуту.
@Injectable()
export class AutoDeleteSweep implements Sweep {
  public readonly name = "auto-delete";
  public readonly intervalMs = 60_000;
  public readonly failMessage = "auto-delete sweep failed:";

  public constructor(
    private readonly chats: ChatsRepository,
    private readonly messages: MessagesRepository,
    private readonly realtime: RealtimeService
  ) {}

  public once(now: Date): void {
    for (const chat of this.chats.findAll()) {
      if (!chat.autoDeleteSeconds) continue;
      const cutoff = new Date(now.getTime() - chat.autoDeleteSeconds * 1000).toISOString();
      const { ids, refs } = this.messages.deleteExpired(chat.id, cutoff);
      if (ids.length) uploadAccess().revokeAttachments(chat.id, refs);
      for (const id of ids) this.realtime.broadcastToUsers(chat.memberIds, { type: "message:deleted", chatId: chat.id, id });
    }
  }
}
