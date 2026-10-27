import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { ChatsRepository } from "./chats.repository.js";
import type { Chat } from "./model/domain.js";

// Доступ к чату по id из пути.
@Injectable()
export class ChatAccessService {
  public constructor(private readonly chats: ChatsRepository) {}

  /** Чат, в котором пользователь состоит, иначе 404 — как будто чата нет. */
  public memberChat(chatId: string, uid: string): Chat {
    const chat = this.chats.findById(chatId);
    if (!chat || !chat.memberIds.includes(uid)) throw new ApiError(404, "not found");
    return chat;
  }

  /**
   * Секретный чат доступен только с «своего» устройства: у создателя — где создан, у
   * собеседника — где он открыл его первым. С других устройств чата как будто нет.
   */
  public checkSecretDevice(chatId: string, uid: string, deviceId: string | undefined): void {
    if (!this.chats.isSecret(chatId)) return;
    const chat = this.chats.findById(chatId);
    if (!chat?.memberIds.includes(uid) || !this.chats.claimSecretDevice(chat.id, uid, deviceId)) {
      throw new ApiError(404, "not found");
    }
  }
}
