import { randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { SYSTEM_BOT_ID } from "../../common/config/accounts.js";
import { findOrCreateDm, sendMessageAndBroadcast, type LegacyChat } from "../../legacy/legacy.js";
import { MessagesRepository } from "../messages/messages.repository.js";
import { RealtimeService } from "../realtime/realtime.service.js";
import { publicUser } from "../users/lib/user.presenter.js";
import { UsersRepository } from "../users/users.repository.js";
import { UserPrivacyService } from "../users/user-privacy.service.js";
import { GiftsRepository } from "./gifts.repository.js";
import { durationLabel } from "./lib/gift-shelf.js";
import type { Gift, GiftBackground } from "./model/domain.js";

export interface Delivery {
  gift: Gift;
  recipientId: string;
  fromId: string | null;
  /** Кто пишет получателю сообщение с подарком (при анонимном подарке — бот Shalter). */
  announceFromId: string;
  background?: GiftBackground | null;
  anonymous?: boolean;
  note?: string | null;
}

export type DeliveryResult = { ok: false; reason: "sold_out" } | { ok: true; serial: number | null; chat: LegacyChat; duration: string | null };

// Вручение подарка — то же, что server/lib/deliverGift.js (им же в server/ выдаются подарки,
// оплаченные донатом): номер тиража, Premium, запись на полке и сообщение с подарком.
@Injectable()
export class GiftDeliveryService {
  public constructor(
    private readonly gifts: GiftsRepository,
    private readonly users: UsersRepository,
    private readonly privacy: UserPrivacyService,
    private readonly messages: MessagesRepository,
    private readonly realtime: RealtimeService,
  ) {}

  public async deliver({ gift, recipientId, fromId, announceFromId, background = null, anonymous = false, note = null }: Delivery): Promise<DeliveryResult> {
    const sender = fromId ? this.users.findById(fromId) : undefined;
    const fromName = anonymous ? "Аноним" : (sender?.name ?? null);
    // Аватар отправителя таким, каким его видит получатель (приватность фото), — сохраняем
    // в подарок, чтобы он был на полке и в чате, а не только буква.
    const seen = !anonymous && sender ? this.privacy.publicUserFor(sender, recipientId) : null;
    const fromAvatar = seen ? { fromAvatarColor: seen.avatarColor ?? null, fromAvatarImage: seen.avatarImage ?? null } : {};

    let serial: number | null = null;
    if (gift.supply) {
      serial = this.gifts.claimSerial({ id: gift.id, supply: gift.supply }, recipientId, fromId ?? null);
      if (serial == null) return { ok: false, reason: "sold_out" };
    }

    const custom = gift.ownerId || (gift.scene && !gift.priceStars) ? { custom: true } : {};
    if (gift.premiumDays !== 0) this.users.grantPremiumDays(recipientId, gift.premiumDays);
    const entry = {
      id: `rg_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`,
      giftId: gift.id,
      priceRub: gift.priceRub,
      priceStars: gift.priceStars,
      emoji: gift.emoji,
      name: gift.name,
      mediaUrl: gift.mediaUrl,
      scene: gift.scene,
      ...custom,
      ...(background ? { background } : {}),
      ...(anonymous ? { anon: true } : {}),
      ...(note ? { note } : {}),
      fromId: fromId ?? null,
      fromName,
      ...fromAvatar,
      at: new Date().toISOString(),
      ...(serial != null ? { serial, supply: gift.supply } : {}),
    };
    this.users.mutateGiftsReceived(recipientId, (list) => {
      list.push(entry);
      return true;
    });

    const recipient = this.users.findById(recipientId);
    this.realtime.broadcastToUsers([recipientId], { type: "self:updated", user: recipient && publicUser(recipient) });

    const duration = durationLabel(gift.premiumDays);
    const serialLabel = serial != null ? ` (№${serial} из ${gift.supply})` : "";
    const giftAttachment = {
      type: "gift" as const,
      gift: {
        giftId: gift.id,
        emoji: gift.emoji,
        name: gift.name,
        priceRub: gift.priceRub,
        premiumDays: gift.premiumDays,
        durationLabel: duration,
        priceStars: gift.priceStars,
        mediaUrl: gift.mediaUrl,
        scene: gift.scene,
        ...custom,
        ...(background ? { background } : {}),
        ...(anonymous ? { anon: true } : {}),
        ...(note ? { note } : {}),
        // Получателю анонимного подарка отправитель не раскрывается.
        fromId: anonymous ? null : (fromId ?? null),
        fromName,
        ...fromAvatar,
        recipientId,
        ...(serial != null ? { serial, supply: gift.supply, exclusive: true } : {}),
      },
    };

    const announcerId = anonymous ? SYSTEM_BOT_ID : announceFromId;
    const chat = await findOrCreateDm(announcerId, recipientId);
    await sendMessageAndBroadcast(
      chat,
      announcerId,
      `🎁 Вам ${anonymous ? "анонимно " : ""}подарили: ${gift.emoji} «${gift.name}»${serialLabel}!${duration ? ` ${duration} активирован.` : ""}`,
      giftAttachment,
    );

    // Анонимный подарок получателю объявляет бот, но запись нужна и в чате с отправителем:
    // после отправки открывается именно этот чат, и без записи он выглядит пустым. Запись видна
    // только отправителю (visibleToId, у получателя она сразу «удалена у себя»), иначе она
    // раскрыла бы его. Личка без видимых сообщений у получателя в списке не появляется.
    if (anonymous && fromId) {
      const senderChat = await findOrCreateDm(fromId, recipientId);
      const message = this.messages.create({
        id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        chatId: senderChat.id,
        senderId: fromId,
        text: `🎁 Вы отправили анонимный подарок: ${gift.emoji} «${gift.name}»${serialLabel}!`,
        createdAt: new Date().toISOString(),
        readByIds: [fromId],
        visibleToId: fromId,
        deletedForIds: senderChat.memberIds.filter((id) => id !== fromId),
        type: giftAttachment.type,
        gift: { ...giftAttachment.gift, fromId },
      });
      this.realtime.broadcastToUsers([fromId], { type: "message:new", chatId: senderChat.id, message });
    }

    return { ok: true, serial, chat, duration };
  }
}
