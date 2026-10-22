import { Injectable } from "@nestjs/common";
import { ADMIN_PHONE } from "../../common/config/accounts.js";
import { ApiError } from "../../common/errors/api-error.js";
import { hasAdminSection } from "../../common/lib/admin-access.js";
import { createPendingOrder, findOrCreateDm, getActiveDonationLink, sanitizers, sendMessageAndBroadcast } from "../../legacy/legacy.js";
import { publicUser } from "../users/lib/user.presenter.js";
import type { User } from "../users/model/domain.js";
import { StarsRepository } from "../users/stars.repository.js";
import { UsersRepository } from "../users/users.repository.js";
import { GiftCatalogService } from "./gift-catalog.service.js";
import { GiftDeliveryService, type DeliveryResult } from "./gift-delivery.service.js";
import { GiftSendersService } from "./gift-senders.service.js";
import { sanitizeGiftBackground } from "./lib/gift-background.js";
import { conversionValue, giftSlug } from "./lib/gift-catalog.js";
import { findShelfEntry, findShelfIndex, giftNote, soldOutError } from "./lib/gift-shelf.js";
import type { Gift } from "./model/domain.js";
import type { PinGiftDto, SendGiftDto, UserGiftDto } from "./model/schemas/gift.schema.js";

const MAX_USER_GIFTS = 50;
const NOT_ON_SHELF = "Подарок не найден на вашей полке";
const EMPTY_SCENE = "Нарисуйте подарок — добавьте хотя бы одну фигуру";

// Подарки пользователя (server/routes/gifts.js): витрина и покупка за звёзды, заявка админу,
// выдача модератором, полка полученных подарков и свои нарисованные подарки.
@Injectable()
export class GiftsService {
  public constructor(
    private readonly catalog: GiftCatalogService,
    private readonly delivery: GiftDeliveryService,
    private readonly senders: GiftSendersService,
    private readonly users: UsersRepository,
    private readonly stars: StarsRepository,
  ) {}

  public list(uid: string) {
    const gifts = this.catalog.list().map((g) => (g.supply ? { ...g, remaining: this.catalog.remaining(g) } : g));
    return { gifts, balance: this.stars.balanceOf(uid) };
  }

  /** Заявка на подарок за рубли: главному админу — сразу, при подключённых донатах — заказ, иначе — сообщение админу. */
  public async request(uid: string, dto: SendGiftDto) {
    const { recipientId } = dto;
    if (recipientId === uid) throw new ApiError(400, "Нельзя подарить подарок самому себе");
    const gift = this.saleGift(dto.giftId);
    const recipient = recipientId ? this.findUser(recipientId) : undefined;
    if (!recipient) throw new ApiError(404, "Получатель не найден");
    if (gift.supply && this.catalog.remaining(gift)! <= 0) throw new ApiError(410, soldOutError(gift));

    const admin = this.users.findByPhone(ADMIN_PHONE);
    if (!admin) throw new ApiError(503, "Администрация Shalter ещё не зарегистрирована в приложении");

    if (admin.id === uid) {
      const result = await this.delivery.deliver({ gift, recipientId: recipient.id, fromId: uid, announceFromId: uid });
      if (!result.ok) throw new ApiError(410, soldOutError(gift));
      return { chatId: result.chat.id, adminPhone: ADMIN_PHONE, delivered: true, serial: result.serial };
    }

    const donation = getActiveDonationLink();
    if (donation) {
      const order = await createPendingOrder({ userId: uid, kind: "gift", giftId: gift.id, recipientId: recipient.id, amountRub: gift.priceRub });
      return { code: order.code, donationUrl: donation.donationUrl, provider: donation.provider, amountRub: gift.priceRub };
    }

    const chat = await findOrCreateDm(uid, admin.id);
    await sendMessageAndBroadcast(
      chat,
      uid,
      `🎁 Хочу подарить ${gift.emoji} «${gift.name}» за ${gift.priceRub}₽ пользователю ${recipient.name}. Перевожу на ${ADMIN_PHONE} и жду подтверждения 🙏`,
    );
    return { chatId: chat.id, adminPhone: ADMIN_PHONE };
  }

  /** Модератор выдаёт любой подарок каталога бесплатно, и снятый с продажи. */
  public async deliver(uid: string, dto: SendGiftDto) {
    if (!hasAdminSection(this.users.findById(uid), "moderation")) throw new ApiError(403, "Недостаточно прав");
    if (dto.recipientId === uid) throw new ApiError(400, "Нельзя подарить подарок самому себе");
    const gift = this.catalog.get(dto.giftId);
    if (!gift) throw new ApiError(404, "Подарок не найден");
    const recipient = this.findUser(dto.recipientId);
    if (!recipient) throw new ApiError(404, "Получатель не найден");

    const result = await this.delivery.deliver({ gift, recipientId: recipient.id, fromId: uid, announceFromId: uid });
    if (!result.ok) throw new ApiError(410, soldOutError(gift));
    return { user: this.shelfOf(recipient.id, uid), serial: result.serial };
  }

  public async buy(uid: string, dto: SendGiftDto) {
    const { recipientId } = dto;
    if (recipientId === uid) throw new ApiError(400, "Нельзя подарить подарок самому себе");
    const gift = this.saleGift(dto.giftId);
    const recipient = recipientId ? this.findUser(recipientId) : undefined;
    if (!recipient) throw new ApiError(404, "Получатель не найден");
    if ((recipient.blockedUserIds ?? []).includes(uid)) throw new ApiError(403, "Пользователь ограничил вам доступ");
    if (gift.supply && this.catalog.remaining(gift)! <= 0) throw new ApiError(410, soldOutError(gift));

    const price = gift.priceStars;
    if (!this.stars.spend(uid, price)) {
      throw new ApiError(402, `Не хватает звёзд — нужно ${price.toLocaleString("ru-RU")} ⭐`, {
        needStars: price,
        balance: this.stars.balanceOf(uid),
      });
    }

    const result = await this.send(uid, recipient.id, gift, dto);
    if (!result.ok) {
      this.stars.add(uid, price);
      throw new ApiError(410, soldOutError(gift), { balance: this.stars.balanceOf(uid) });
    }
    return { chatId: await this.senderChatId(result, uid, recipient.id), serial: result.serial, delivered: true, balance: this.stars.balanceOf(uid) };
  }

  /** Обмен подарка с полки на звёзды по полной цене. */
  public convert(uid: string, entryId: string) {
    const entry = findShelfEntry(this.users.findById(uid)?.giftsReceived, entryId);
    if (!entry) throw new ApiError(404, NOT_ON_SHELF);
    if (entry.custom || (!entry.priceStars && entry.priceStars !== undefined)) {
      throw new ApiError(400, "Этот подарок нельзя обменять на звёзды");
    }
    const catalogGift = this.catalog.get(entry.giftId ?? "");
    // Premium уже выдан при вручении — иначе обмен на полную цену позволял бы бесконечно
    // «передаривать» Premium за одни и те же звёзды.
    if (catalogGift && catalogGift.premiumDays !== 0) throw new ApiError(400, "Этот подарок нельзя обменять на звёзды");
    const value = conversionValue(
      catalogGift ?? { priceRub: (entry.priceRub as number | undefined) ?? 1, priceStars: entry.priceStars as number | undefined },
    );
    if (!this.removeFromShelf(uid, entryId)) throw new ApiError(404, NOT_ON_SHELF);
    const balance = this.stars.add(uid, value);
    return { balance, gained: value, user: this.shelfOf(uid, uid) };
  }

  public remove(uid: string, entryId: string) {
    if (!this.removeFromShelf(uid, entryId)) throw new ApiError(404, NOT_ON_SHELF);
    return { user: this.shelfOf(uid, uid) };
  }

  public pin(uid: string, entryId: string, dto: PinGiftDto) {
    const pinned = dto.pinned !== false;
    const found = this.users.mutateGiftsReceived(uid, (list) => {
      const entry = list[findShelfIndex(list, entryId)];
      if (!entry) return false;
      if (pinned) entry.pinned = true;
      else delete entry.pinned;
      return true;
    });
    if (!found) throw new ApiError(404, NOT_ON_SHELF);
    return { user: this.shelfOf(uid, uid) };
  }

  public listCustom(uid: string) {
    return { gifts: this.catalog.listUserGifts(uid) };
  }

  public createCustom(uid: string, dto: UserGiftDto) {
    const name = String(dto.name ?? "").trim().slice(0, 60);
    if (!name) throw new ApiError(400, "Назовите подарок");
    const scene = sanitizers().sanitizeScene(dto.scene, { requireLayers: true });
    if (!scene) throw new ApiError(400, EMPTY_SCENE);
    if (this.catalog.listUserGifts(uid).length >= MAX_USER_GIFTS) {
      throw new ApiError(409, `Не больше ${MAX_USER_GIFTS} своих подарков`);
    }
    const id = `ug_${giftSlug(name, 20)}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const gift = this.catalog.createUserGift({ id, ownerId: uid, name, scene, emoji: sanitizers().sceneSummaryEmoji(scene) });
    return { gift };
  }

  public patchCustom(uid: string, id: string, dto: UserGiftDto) {
    const patch: { name?: string; scene?: unknown; emoji?: string } = {};
    if (dto.name !== undefined) {
      const name = String(dto.name).trim().slice(0, 60);
      if (!name) throw new ApiError(400, "Назовите подарок");
      patch.name = name;
    }
    if (dto.scene !== undefined) {
      const scene = sanitizers().sanitizeScene(dto.scene, { requireLayers: true });
      if (!scene) throw new ApiError(400, EMPTY_SCENE);
      patch.scene = scene;
      patch.emoji = sanitizers().sceneSummaryEmoji(scene);
    }
    const gift = this.catalog.updateUserGift(id, uid, patch);
    if (!gift) throw new ApiError(404, "Подарок не найден");
    return { gift };
  }

  public deleteCustom(uid: string, id: string) {
    if (!this.catalog.deleteUserGift(id, uid)) throw new ApiError(404, "Подарок не найден");
    return { ok: true };
  }

  /** Свой нарисованный подарок — бесплатно. */
  public async sendCustom(uid: string, dto: SendGiftDto) {
    if (dto.recipientId === uid) throw new ApiError(400, "Нельзя подарить подарок самому себе");
    const gift = this.catalog.getUserGift(dto.giftId, uid);
    if (!gift) throw new ApiError(404, "Подарок не найден");
    const recipient = this.findUser(dto.recipientId);
    if (!recipient) throw new ApiError(404, "Получатель не найден");
    if ((recipient.blockedUserIds ?? []).includes(uid)) throw new ApiError(403, "Пользователь ограничил вам доступ");
    const result = await this.send(uid, recipient.id, gift, dto);
    if (!result.ok) throw new ApiError(500, "Не удалось отправить подарок");
    return { chatId: await this.senderChatId(result, uid, recipient.id), delivered: true };
  }

  /** Подарок из витрины: есть в каталоге и продаётся. */
  private saleGift(giftId: unknown): Gift {
    const gift = this.catalog.get(giftId);
    if (!gift) throw new ApiError(404, "Подарок не найден");
    if (!this.catalog.isOnSale(gift.id)) throw new ApiError(400, "Этот подарок больше не продаётся");
    return gift;
  }

  /** Подарок от пользователя: с фоном, подписью и, у Premium, анонимно. */
  private send(uid: string, recipientId: string, gift: Gift, dto: SendGiftDto): Promise<DeliveryResult> {
    const anonymous = !!dto.anonymous && !!this.users.findById(uid)?.isPremium;
    return this.delivery.deliver({
      gift,
      recipientId,
      fromId: uid,
      announceFromId: uid,
      background: sanitizeGiftBackground(dto.background),
      anonymous,
      note: giftNote(dto.note),
    });
  }

  // Куда вести отправителя после подарка: его личка с получателем. При анонимном подарке
  // сообщение пишет бот Shalter, но открыть отправителю надо свой чат.
  private async senderChatId(result: DeliveryResult & { ok: true }, uid: string, recipientId: string): Promise<string> {
    if (result.chat.memberIds?.includes(uid)) return result.chat.id;
    return (await findOrCreateDm(uid, recipientId)).id;
  }

  private removeFromShelf(uid: string, entryId: string): boolean {
    return this.users.mutateGiftsReceived(uid, (list) => {
      const idx = findShelfIndex(list, entryId);
      if (idx === -1) return false;
      list.splice(idx, 1);
      return true;
    });
  }

  /** Профиль пользователя с полкой, где у подарков аватары отправителей глазами смотрящего. */
  private shelfOf(userId: string, viewerId: string) {
    const user = this.users.findById(userId);
    return user && this.senders.withGiftSendersOn(publicUser(user), viewerId);
  }

  private findUser(id: unknown): User | undefined {
    return typeof id === "string" ? this.users.findById(id) : undefined;
  }
}
