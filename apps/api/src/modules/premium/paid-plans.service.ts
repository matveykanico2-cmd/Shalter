import { Injectable } from "@nestjs/common";
import { ADMIN_PHONE, isAdminPhone } from "../../common/config/accounts.js";
import { ApiError } from "../../common/errors/api-error.js";
import { createPendingOrder, findOrCreateDm, getActiveDonationLink, sendMessageAndBroadcast, type PaidPlan } from "../../legacy/legacy.js";
import { RealtimeService } from "../realtime/realtime.service.js";
import { publicUser } from "../users/lib/user.presenter.js";
import type { User } from "../users/model/domain.js";
import { UsersRepository } from "../users/users.repository.js";

/** Что оформляется: Premium или «Shalter для бизнеса» — тексты и как выдать срок. */
export interface PaidProduct {
  kind: "premium" | "business";
  title: string;
  /** Эмодзи в сообщениях о выдаче. */
  icon: string;
  isForever: (user: User) => boolean;
  isActive: (user: User) => boolean;
  grant: (userId: string, days: number | null) => void;
  revoke: (userId: string) => void;
}

// Общее у Premium и «Shalter для бизнеса» (server/routes/premium.js и business.js): заявка на
// оплату и выдача/отключение админом. Оплата — донатом с кодом заказа, если сервис донатов
// подключён, иначе переводом по номеру админа с сообщением ему в личку.
@Injectable()
export class PaidPlansService {
  public constructor(
    private readonly users: UsersRepository,
    private readonly realtime: RealtimeService
  ) {}

  public async request(uid: string, product: PaidProduct, plan: PaidPlan) {
    const admin = this.users.findByPhone(ADMIN_PHONE);
    if (!admin) throw new ApiError(503, "Администрация Shalter ещё не зарегистрирована в приложении");
    const me = this.users.findById(uid)!;
    if (product.isForever(me)) throw new ApiError(400, `У вас уже есть ${product.title} навсегда`);
    const extending = product.isActive(me);

    // Админ оформляет себе сам — без оплаты, сообщение в «Избранное».
    if (admin.id === uid) {
      product.grant(uid, plan.days);
      const chat = await findOrCreateDm(uid, uid);
      await sendMessageAndBroadcast(
        chat,
        uid,
        `${product.icon} ${extending ? `${product.title} продлён` : `Вам выдан ${product.title}`} на ${plan.label}! Спасибо, что поддерживаете проект.`
      );
      return { chatId: chat.id, adminPhone: ADMIN_PHONE, delivered: true };
    }

    const donation = getActiveDonationLink();
    if (donation) {
      const order = await createPendingOrder({
        userId: uid,
        kind: product.kind,
        amountRub: plan.priceRub,
        meta: { days: plan.days, label: plan.label },
      });
      return { code: order.code, donationUrl: donation.donationUrl, provider: donation.provider, amountRub: plan.priceRub };
    }

    const chat = await findOrCreateDm(uid, admin.id);
    await sendMessageAndBroadcast(
      chat,
      uid,
      `Хочу ${extending ? "продлить" : "оформить"} ${product.title} на ${plan.label} за ${plan.priceRub}₽. Перевожу на ${ADMIN_PHONE} и жду подтверждения 🙏`
    );
    return { chatId: chat.id, adminPhone: ADMIN_PHONE };
  }

  /** Выдача (на days дней или навсегда) или отключение админом; получателю — сообщение и self:updated. */
  public async grant(
    uid: string,
    product: PaidProduct,
    input: { userId: string; grant: boolean; days: number | undefined; forever: boolean },
    defaultDays: number,
    texts: { granted: (span: string) => string; revoked: string }
  ) {
    if (!isAdminPhone(this.users.findById(uid)!.phone)) throw new ApiError(403, "Недостаточно прав");
    const { userId } = input;
    if (!this.users.findById(userId)) throw new ApiError(404, "Пользователь не найден");

    const dayCount = input.days ?? defaultDays;
    if (input.grant) product.grant(userId, input.forever ? null : dayCount);
    else product.revoke(userId);

    const chat = await findOrCreateDm(uid, userId);
    await sendMessageAndBroadcast(chat, uid, input.grant ? texts.granted(input.forever ? " навсегда" : ` на ${dayCount} дней`) : texts.revoked);
    const user = publicUser(this.users.findById(userId)!);
    this.realtime.broadcastToUsers([userId], { type: "self:updated", user });
    return { user };
  }
}
