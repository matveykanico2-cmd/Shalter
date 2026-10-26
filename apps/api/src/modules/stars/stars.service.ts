import { Injectable } from "@nestjs/common";
import { ADMIN_PHONE, isAdminPhone } from "../../common/config/accounts.js";
import { ApiError } from "../../common/errors/api-error.js";
import { createPendingOrder, findOrCreateDm, getActiveDonationLink, pricing, sendMessageAndBroadcast, uploadAccess } from "../../legacy/legacy.js";
import { ChatsRepository } from "../chats/chats.repository.js";
import { MessagesRepository } from "../messages/messages.repository.js";
import type { Message } from "../messages/model/domain.js";
import { RealtimeService } from "../realtime/realtime.service.js";
import { publicUser } from "../users/lib/user.presenter.js";
import { StarsRepository } from "../users/stars.repository.js";
import { UsersRepository } from "../users/users.repository.js";
import {
  MAX_MESSAGE_PRICE,
  type MessagePriceDto,
  type StarsGrantDto,
  type StarsRequestDto,
  type StarsTransferDto,
} from "./model/schemas/stars.schema.js";

const BOOST_MINUTES = 60;

// Звёзды (/api/stars): баланс, покупка набора, выдача админом, цена входящих, буст и
// удаление чужого сообщения за звёзды, перевод — как server/routes/stars.js.
@Injectable()
export class StarsService {
  public constructor(
    private readonly stars: StarsRepository,
    private readonly users: UsersRepository,
    private readonly chats: ChatsRepository,
    private readonly messages: MessagesRepository,
    private readonly realtime: RealtimeService
  ) {}

  public overview(uid: string) {
    const prices = pricing().getPricing();
    return {
      balance: this.stars.balanceOf(uid),
      userId: uid,
      messagePriceStars: this.users.findById(uid)?.messagePriceStars ?? 0,
      packs: prices.starPacks,
      costs: { boost: prices.starCosts.boost, boostMinutes: BOOST_MINUTES, delete: prices.starCosts.delete, maxMessagePrice: MAX_MESSAGE_PRICE },
    };
  }

  /** Набор звёзд: админу — сразу, с подключёнными донатами — заказ с кодом, иначе заявка админу в личку. */
  public async request(uid: string, { packId }: StarsRequestDto) {
    const pack = pricing().getStarPack(packId);
    if (!pack) throw new ApiError(404, "Такого набора нет");

    const admin = this.users.findByPhone(ADMIN_PHONE);
    if (!admin) throw new ApiError(503, "Администрация Shalter ещё не зарегистрирована в приложении");
    if (admin.id === uid) {
      this.stars.add(uid, pack.stars);
      return { balance: this.stars.balanceOf(uid), granted: true };
    }

    const donation = getActiveDonationLink();
    if (donation) {
      const order = await createPendingOrder({ userId: uid, kind: "stars", amountRub: pack.priceRub, meta: { stars: pack.stars } });
      return { code: order.code, donationUrl: donation.donationUrl, provider: donation.provider, amountRub: pack.priceRub };
    }

    const chat = await findOrCreateDm(uid, admin.id);
    await sendMessageAndBroadcast(chat, uid, `⭐ Хочу купить ${pack.stars} звёзд за ${pack.priceRub}₽. Перевожу на ${ADMIN_PHONE} и жду подтверждения 🙏`);
    return { chatId: chat.id, adminPhone: ADMIN_PHONE };
  }

  /** Начисление или списание админом; получателю — сообщение в личке от админа. */
  public async grant(uid: string, { userId, stars: amount }: StarsGrantDto) {
    if (!isAdminPhone(this.users.findById(uid)?.phone)) throw new ApiError(403, "Недостаточно прав");

    const target = this.users.findById(userId);
    if (!target) throw new ApiError(404, "Пользователь не найден");
    if (!Number.isFinite(amount) || amount === 0) throw new ApiError(400, "Укажите количество звёзд");
    if (amount < 0 && this.stars.balanceOf(target.id) + amount < 0) {
      throw new ApiError(409, "Нельзя списать больше, чем есть на балансе");
    }

    const balance = this.stars.add(target.id, amount);
    const chat = await findOrCreateDm(uid, target.id);
    await sendMessageAndBroadcast(
      chat,
      uid,
      amount > 0 ? `⭐ Вам начислено ${amount} звёзд. Баланс: ${balance}.` : `Списано ${-amount} звёзд. Баланс: ${balance}.`
    );
    return { user: publicUser(this.users.findById(target.id)!), balance };
  }

  /** Цена входящих от незнакомцев; собеседники по личкам перечитывают чат (chat:updated). */
  public setMessagePrice(uid: string, { stars: price }: MessagePriceDto) {
    this.stars.setMessagePrice(uid, price);
    for (const dm of this.chats.findForUser(uid).filter((c) => c.type === "dm")) {
      this.realtime.broadcastToUsers(dm.memberIds, { type: "chat:updated", chat: { id: dm.id } });
    }
    return { messagePriceStars: price };
  }

  /** Выделить сообщение на час. */
  public boost(uid: string, messageId: string) {
    const { message, chat } = this.memberMessage(uid, messageId);
    const cost = pricing().getPricing().starCosts.boost;
    this.pay(uid, cost);
    const until = new Date(Date.now() + BOOST_MINUTES * 60000).toISOString();
    const updated = this.messages.setBoost(message.id, until, uid);
    this.realtime.broadcastToUsers(chat.memberIds, { type: "message:updated", chatId: chat.id, message: updated });
    return { message: updated, balance: this.stars.balanceOf(uid) };
  }

  /** Удалить у обоих чужое сообщение в личке. */
  public delete(uid: string, messageId: string) {
    const { message, chat } = this.memberMessage(uid, messageId);
    if (chat.type !== "dm") throw new ApiError(400, "За звёзды можно удалять только в личной переписке");
    if (message.senderId === uid) throw new ApiError(400, "Своё сообщение удаляется бесплатно");
    if (message.type === "gift") throw new ApiError(400, "Сообщение с подарком удалить нельзя");

    this.pay(uid, pricing().getPricing().starCosts.delete);
    const refs = this.messages.delete(message.id);
    if (refs) uploadAccess().revokeAttachments(refs.chatId, [{ url: refs.attachments ?? "" }, { url: refs.sticker ?? "" }]);
    this.realtime.broadcastToUsers(chat.memberIds, { type: "message:deleted", chatId: chat.id, id: message.id });
    return { ok: true, balance: this.stars.balanceOf(uid) };
  }

  public async transfer(uid: string, { userId: toId, amount, note }: StarsTransferDto) {
    if (!toId || toId === uid) throw new ApiError(400, "Себе переводить незачем");

    const target = this.users.findById(toId);
    if (!target) throw new ApiError(404, "Получатель не найден");
    if (target.isBot) throw new ApiError(400, "Боту звёзды не переведёшь");
    if ((target.blockedUserIds ?? []).includes(uid)) throw new ApiError(403, "Пользователь заблокировал вас");

    if (!this.stars.transfer(uid, toId, amount)) {
      const balance = this.stars.balanceOf(uid);
      throw new ApiError(402, `Не хватает звёзд: на балансе ${balance} ⭐`, { balance });
    }

    try {
      const chat = await findOrCreateDm(uid, toId);
      await sendMessageAndBroadcast(chat, uid, `⭐ Перевод: ${amount} ⭐${note ? `\n${note}` : ""}`);
    } catch {
      // Перевод уже прошёл; сообщение о нём — не главное.
    }
    return { ok: true, amount, balance: this.stars.balanceOf(uid), to: publicUser(target), from: this.users.findById(uid)?.name ?? "" };
  }

  private memberMessage(uid: string, messageId: string): { message: Message; chat: { id: string; type: string; memberIds: string[] } } {
    const message = this.messages.findById(messageId);
    if (!message) throw new ApiError(404, "Сообщение не найдено");
    const chat = this.chats.findById(message.chatId);
    if (!chat || !chat.memberIds.includes(uid)) throw new ApiError(404, "not found");
    return { message, chat };
  }

  private pay(uid: string, cost: number): void {
    if (!this.stars.spend(uid, cost)) throw new ApiError(402, `Не хватает звёзд — нужно ${cost}`, { balance: this.stars.balanceOf(uid) });
  }
}
