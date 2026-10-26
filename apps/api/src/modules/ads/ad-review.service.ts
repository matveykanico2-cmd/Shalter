import { Injectable } from "@nestjs/common";
import { ADMIN_PHONE, SYSTEM_BOT_ID } from "../../common/config/accounts.js";
import { ApiError } from "../../common/errors/api-error.js";
import { hasAdminSection } from "../../common/lib/admin-access.js";
import { findOrCreateDm, sendMessageAndBroadcast } from "../../legacy/legacy.js";
import { UsersRepository } from "../users/users.repository.js";
import { AdCampaignsRepository } from "./ad-campaigns.repository.js";
import { PLACEMENTS } from "./lib/ad-campaign.mapper.js";
import type { AdCampaign } from "./model/domain.js";
import type { ReviewDto } from "./model/schemas/ads.schema.js";

// Модерация объявлений (раздел «moderation»): список на проверке, одобрение и отказ, и
// уведомление главного админа о новом объявлении (server/lib/adReview.js).
@Injectable()
export class AdReviewService {
  public constructor(
    private readonly campaigns: AdCampaignsRepository,
    private readonly users: UsersRepository,
  ) {}

  public list(uid: string) {
    this.requireModerator(uid);
    const campaigns = this.campaigns.listForReview().map((c) => {
      const owner = this.users.findById(c.ownerId);
      return { ...c, owner: owner ? { id: owner.id, name: owner.name, username: owner.username || null } : { id: c.ownerId } };
    });
    return { campaigns, placements: PLACEMENTS };
  }

  public async decide(uid: string, id: string, dto: ReviewDto) {
    this.requireModerator(uid);
    const c = this.campaigns.findById(id);
    if (!c) throw new ApiError(404, "Кампания не найдена");
    const { approve, reason } = dto;
    if (!approve && !reason) throw new ApiError(400, "Укажите причину отказа — её увидит рекламодатель");

    const updated = this.campaigns.update(c.id, approve ? { status: "paused", rejectReason: null } : { status: "rejected", rejectReason: reason });

    try {
      const chat = await findOrCreateDm(c.ownerId, SYSTEM_BOT_ID);
      await sendMessageAndBroadcast(
        chat,
        SYSTEM_BOT_ID,
        approve
          ? `✅ Объявление «${c.title || c.text.slice(0, 30)}» проверено и допущено к показу.\n\nВключите его в кабинете рекламы, когда будете готовы.`
          : `⛔ Объявление «${c.title || c.text.slice(0, 30)}» отклонено.\nПричина: ${reason}\n\nИсправьте текст и отправьте на проверку снова.`,
      );
    } catch (err) {
      console.error("ad review notice failed:", err);
    }
    return { campaign: updated };
  }

  /** Главному админу — объявление на проверку от бота Shalter; своё он не получает. Ошибки только в лог. */
  public async notifyAdmin(campaign: AdCampaign | undefined, ownerId: string): Promise<void> {
    try {
      const admin = this.users.findByPhone(ADMIN_PHONE);
      if (!admin || admin.id === ownerId || !campaign) return;
      const owner = this.users.findById(ownerId);
      const chat = await findOrCreateDm(SYSTEM_BOT_ID, admin.id);
      await sendMessageAndBroadcast(
        chat,
        SYSTEM_BOT_ID,
        `📢 Объявление на проверку от ${owner?.name ?? "пользователя"}\n«${campaign.title || "Без названия"}»\n${campaign.text}` +
          (campaign.url ? `\nСсылка: ${campaign.url}` : "") +
          "\n\nПроверить: Настройки → Модерация → Реклама на проверке.",
      );
    } catch (err) {
      console.error("ad review notice failed:", err);
    }
  }

  private requireModerator(uid: string): void {
    if (!hasAdminSection(this.users.findById(uid), "moderation")) throw new ApiError(403, "Недостаточно прав");
  }
}
