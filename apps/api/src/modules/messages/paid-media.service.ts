import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { paidMedia, type PaidMediaRecord } from "../../legacy/legacy.js";
import { isStaff } from "../chats/lib/chat-permissions.js";
import type { Chat } from "../chats/model/domain.js";
import { StarsRepository } from "../users/stars.repository.js";
import { MessagesRepository } from "./messages.repository.js";
import type { Message } from "./model/domain.js";

interface PaidAccess {
  paid: PaidMediaRecord;
  message: Message | undefined;
  /** Автор, админ канала или уже купивший. */
  free: boolean;
}

// Платный пост: в чате — заглушка, настоящие вложения — автору, админам канала и купившим.
@Injectable()
export class PaidMediaService {
  public constructor(
    private readonly messages: MessagesRepository,
    private readonly stars: StarsRepository
  ) {}

  /** Настоящие вложения; не купившему — 402 с ценой. Сколько купили — автору и админам канала. */
  public attachments(uid: string, chat: Chat, messageId: string) {
    const { paid, free, message } = this.access(uid, chat, messageId);
    if (!free) throw new ApiError(402, "Пост открывается за звёзды", { stars: paid.stars });
    const canSeeBuyers = message?.senderId === uid || (chat.type === "channel" && isStaff(chat, uid));
    return { attachments: paid.attachments, ...(canSeeBuyers ? { buyers: paidMedia().buyersCount(paid.messageId) } : {}) };
  }

  /** Покупка: звёзды получает владелец канала (как плата за комментарии), в личке и группе — автор. */
  public unlock(uid: string, chat: Chat, messageId: string) {
    const { paid, free, message } = this.access(uid, chat, messageId);
    if (!free) {
      const payee = chat.type === "channel" ? chat.ownerId : message?.senderId;
      if (!payee || !this.stars.transfer(uid, payee, paid.stars)) {
        throw new ApiError(402, `Не хватает звёзд: нужно ${paid.stars} ⭐`, { needStars: paid.stars, balance: this.stars.balanceOf(uid) });
      }
      paidMedia().recordPurchase(paid.messageId, uid);
    }
    return { attachments: paid.attachments, balance: this.stars.balanceOf(uid) };
  }

  private access(uid: string, chat: Chat, messageId: string): PaidAccess {
    const store = paidMedia();
    const paid = store.getPaidMedia(messageId);
    if (!paid || paid.chatId !== chat.id) throw new ApiError(404, "not found");
    const message = this.messages.findById(messageId);
    const free = message?.senderId === uid || (chat.type === "channel" && isStaff(chat, uid)) || store.hasBought(paid.messageId, uid);
    return { paid, message, free };
  }
}
