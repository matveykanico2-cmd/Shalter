import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { hasAdminSection } from "../../common/lib/admin-access.js";
import { ChatsRepository } from "../chats/chats.repository.js";
import type { Chat } from "../chats/model/domain.js";
import { UsersRepository } from "../users/users.repository.js";
import { MessagesRepository } from "./messages.repository.js";
import type { Message } from "./model/domain.js";

export interface MessageInChat {
  chat: Chat;
  message: Message;
  /** Не участник, а модератор Shalter (только когда allowModerator). */
  moderator: boolean;
}

// Сообщение из пути /api/chats/:id/messages/:messageId.
@Injectable()
export class MessageAccessService {
  public constructor(
    private readonly chats: ChatsRepository,
    private readonly messages: MessagesRepository,
    private readonly users: UsersRepository
  ) {}

  /** Модератор Shalter (раздел «Модерация» админки). */
  public isServerModerator(uid: string): boolean {
    return hasAdminSection(this.users.findById(uid), "moderation");
  }

  /**
   * Сообщение этого чата, в котором пользователь состоит, иначе 404. allowModerator —
   * модератору Shalter можно и без участия (удаление у всех).
   */
  public messageInChat(chatId: string, messageId: string, uid: string, { allowModerator = false } = {}): MessageInChat {
    const chat = this.chats.findById(chatId);
    const message = this.messages.findById(messageId);
    const member = !!chat && chat.memberIds.includes(uid);
    const moderator = allowModerator && !member && !!chat && this.isServerModerator(uid);
    if (!chat || !message || message.chatId !== chat.id || (!member && !moderator)) throw new ApiError(404, "not found");
    return { chat, message, moderator };
  }
}
