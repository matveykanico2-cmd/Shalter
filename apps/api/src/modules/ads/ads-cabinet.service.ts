import { Injectable } from "@nestjs/common";
import { ADMIN_PHONE, isAdminPhone } from "../../common/config/accounts.js";
import { ApiError } from "../../common/errors/api-error.js";
import { createPendingOrder, findOrCreateDm, getActiveDonationLink, pricing, sendMessageAndBroadcast, usesForeignUpload } from "../../legacy/legacy.js";
import { publicUser } from "../users/lib/user.presenter.js";
import { UsersRepository } from "../users/users.repository.js";
import { sanitizeAdAttachments } from "./lib/ad-attachments.js";
import type { AdContentDto, GrantAdsDto } from "./model/schemas/ads.schema.js";

const AD_TEXT_MAX = 200;

/** Цена и срок кабинета рекламы — их меняет админ (server/data/pricing.js). */
const adsPricing = () => pricing().getPricing().ads as { priceRub: number; days: number };

// Кабинет рекламы в профиле (server/routes/ads.js): заявка на него, объявление и выдача админом.
@Injectable()
export class AdsCabinetService {
  public constructor(private readonly users: UsersRepository) {}

  public me(uid: string) {
    const me = this.users.findById(uid)!;
    const { priceRub, days } = adsPricing();
    return {
      isAdsActive: !!me.isAdsActive,
      adsUntil: me.adsUntil,
      adsForever: !!me.adsForever,
      adText: me.adText,
      adUrl: me.adUrl,
      adAttachments: me.adAttachments,
      priceRub,
      days,
    };
  }

  /** Заявка на кабинет: главному админу — сразу, при подключённых донатах — заказ, иначе — сообщение админу. */
  public async request(uid: string) {
    const admin = this.users.findByPhone(ADMIN_PHONE);
    if (!admin) throw new ApiError(503, "Администрация Shalter ещё не зарегистрирована в приложении");
    const { priceRub, days } = adsPricing();

    if (admin.id === uid) {
      this.users.grantAdsDays(uid, days);
      const chat = await findOrCreateDm(uid, uid);
      await sendMessageAndBroadcast(chat, uid, `📢 Вам выдан кабинет рекламы на ${days} дней! Настройте объявление в Настройки → Реклама.`);
      return { chatId: chat.id, adminPhone: ADMIN_PHONE, priceRub, delivered: true };
    }

    const donation = getActiveDonationLink();
    if (donation) {
      const order = await createPendingOrder({ userId: uid, kind: "ads", amountRub: priceRub, meta: { days } });
      return { code: order.code, donationUrl: donation.donationUrl, provider: donation.provider, amountRub: priceRub };
    }

    const chat = await findOrCreateDm(uid, admin.id);
    await sendMessageAndBroadcast(chat, uid, `📢 Хочу оформить кабинет рекламы на ${days} дней за ${priceRub}₽. Перевожу на ${ADMIN_PHONE} и жду подтверждения 🙏`);
    return { chatId: chat.id, adminPhone: ADMIN_PHONE, priceRub };
  }

  public setContent(uid: string, dto: AdContentDto) {
    const me = this.users.findById(uid)!;
    if (!me.isAdsActive) throw new ApiError(403, "Кабинет рекламы не активен");

    const { text, attachments } = dto;
    // Ссылку обрезаем до проверки: « https://…» — та же ссылка, что и без пробела.
    const url = typeof dto.url === "string" ? dto.url.trim() : dto.url;
    if (typeof text !== "string" || !text.trim()) throw new ApiError(400, "Введите текст объявления");
    if (url && (typeof url !== "string" || !/^https?:\/\//.test(url))) throw new ApiError(400, "Ссылка должна начинаться с http:// или https://");

    const adAttachments = sanitizeAdAttachments(attachments);
    if (usesForeignUpload(uid, [url, adAttachments], [me.adUrl, me.adAttachments])) throw new ApiError(400, "Некорректная ссылка на файл");
    const updated = this.users.setAdContent(uid, {
      adText: text.trim().slice(0, AD_TEXT_MAX),
      adUrl: (url as string) || null,
      adAttachments,
    });
    return { user: updated && publicUser(updated) };
  }

  /** Админ по номеру выдаёт кабинет (на срок или навсегда) или отключает его. */
  public async grant(uid: string, dto: GrantAdsDto) {
    if (!isAdminPhone(this.users.findById(uid)?.phone)) throw new ApiError(403, "Недостаточно прав");

    const { userId, active, days, forever } = dto;
    const target = typeof userId === "string" ? this.users.findById(userId) : undefined;
    if (!target) throw new ApiError(404, "Пользователь не найден");

    const grant = active !== false;
    const dayCount = Number(days) > 0 ? Math.floor(Number(days)) : adsPricing().days;
    if (grant) this.users.grantAdsDays(target.id, forever ? null : dayCount);
    else this.users.revokeAds(target.id);

    const chat = await findOrCreateDm(uid, target.id);
    await sendMessageAndBroadcast(
      chat,
      uid,
      grant
        ? `📢 Вам выдан кабинет рекламы${forever ? " навсегда" : ` на ${dayCount} дней`}! Настройте объявление в Настройки → Реклама.`
        : "Ваш кабинет рекламы был отключён администрацией.",
    );
    const user = this.users.findById(target.id);
    return { user: user && publicUser(user) };
  }
}
