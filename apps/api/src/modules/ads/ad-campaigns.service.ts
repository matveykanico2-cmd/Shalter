import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { usesForeignUpload } from "../../legacy/legacy.js";
import { StarsRepository } from "../users/stars.repository.js";
import { UsersRepository } from "../users/users.repository.js";
import { AdCampaignsRepository } from "./ad-campaigns.repository.js";
import { AdReviewService } from "./ad-review.service.js";
import { CPM_MIN, PLACEMENTS, publicCampaign } from "./lib/ad-campaign.mapper.js";
import type { AdCampaign, AdCampaignPatch } from "./model/domain.js";
import type { BudgetDto, CampaignStatusDto, CreateCampaignDto, PatchCampaignDto, ServeQuery } from "./model/schemas/ads.schema.js";
import { ProfileImpressionsStore } from "./stores/profile-impressions.store.js";

const FOREIGN_FILE = "Некорректная ссылка на файл";

// Рекламные кампании за звёзды (server/routes/ads.js): кабинет рекламодателя, показ и клики.
@Injectable()
export class AdCampaignsService {
  public constructor(
    private readonly campaigns: AdCampaignsRepository,
    private readonly review: AdReviewService,
    private readonly impressions: ProfileImpressionsStore,
    private readonly users: UsersRepository,
    private readonly stars: StarsRepository,
  ) {}

  public list(uid: string) {
    return { campaigns: this.campaigns.listByOwner(uid), balanceStars: this.stars.balanceOf(uid), placements: PLACEMENTS, cpmMin: CPM_MIN };
  }

  public async create(uid: string, dto: CreateCampaignDto) {
    if (usesForeignUpload(uid, [dto.url, dto.imageUrl])) throw new ApiError(400, FOREIGN_FILE);
    const created = this.campaigns.create({
      ownerId: uid,
      title: dto.title,
      text: dto.text,
      url: String(dto.url ?? "").trim().slice(0, 300) || null,
      imageUrl: String(dto.imageUrl ?? "").trim() || null,
      placement: dto.placement,
      cpmStars: dto.cpmStars,
    });
    await this.review.notifyAdmin(created, uid);
    return { campaign: created };
  }

  /** Правка; новый текст, ссылка или картинка снова отправляют объявление на проверку. */
  public async patch(uid: string, id: string, dto: PatchCampaignDto) {
    const c = this.own(uid, id);
    const patch: AdCampaignPatch = {};
    if (dto.title !== undefined) patch.title = dto.title;
    if (dto.text !== undefined) {
      if (!dto.text) throw new ApiError(400, "Напишите текст объявления");
      patch.text = dto.text;
    }
    if (dto.url !== undefined) patch.url = dto.url;
    if (dto.imageUrl !== undefined) patch.imageUrl = dto.imageUrl;
    if (usesForeignUpload(uid, [patch.url, patch.imageUrl], [c.url, c.imageUrl])) throw new ApiError(400, FOREIGN_FILE);
    if (dto.placement) patch.placement = dto.placement;
    if (dto.cpmStars !== undefined) patch.cpmStars = dto.cpmStars;
    const touchesCreative = "text" in patch || "url" in patch || "imageUrl" in patch;
    if (touchesCreative && c.status !== "review") {
      patch.status = "review";
      patch.rejectReason = null;
    }
    const updated = this.campaigns.update(c.id, patch);
    if (patch.status === "review") await this.review.notifyAdmin(updated, uid);
    return { campaign: updated };
  }

  public delete(uid: string, id: string) {
    this.campaigns.delete(this.own(uid, id).id);
    return { ok: true };
  }

  public addBudget(uid: string, id: string, dto: BudgetDto) {
    const c = this.own(uid, id);
    const { stars } = dto;
    if (stars <= 0) throw new ApiError(400, "Сколько звёзд добавить?");
    if (!this.stars.spend(uid, stars)) throw new ApiError(402, "Не хватает звёзд на балансе");
    const updated = this.campaigns.update(c.id, { budgetStars: c.budgetStars + stars });
    return { campaign: updated, balanceStars: this.stars.balanceOf(uid) };
  }

  public async setStatus(uid: string, id: string, dto: CampaignStatusDto) {
    const c = this.own(uid, id);
    const want = dto.status;

    if (want === "review") {
      if (!c.text.trim()) throw new ApiError(400, "Пустое объявление не проверяют");
      const updated = this.campaigns.update(c.id, { status: "review", rejectReason: null });
      await this.review.notifyAdmin(updated, uid);
      return { campaign: updated };
    }
    // Пауза — только для уже допущенного объявления: иначе непроверенное или отклонённое
    // через paused → active обходило бы модерацию.
    if (want === "paused") {
      if (c.status !== "active" && c.status !== "paused" && c.status !== "finished") {
        throw new ApiError(400, "Сначала отправьте объявление на проверку");
      }
      return { campaign: this.campaigns.update(c.id, { status: "paused" }) };
    }
    if (want === "active") {
      if (c.status !== "paused" && c.status !== "finished") throw new ApiError(400, "Сначала отправьте объявление на проверку");
      if (c.remainingStars <= 0) throw new ApiError(402, "Бюджет израсходован — пополните его");
      return { campaign: this.campaigns.update(c.id, { status: "active" }) };
    }
    throw new ApiError(400, "Неизвестное состояние");
  }

  public stats(uid: string, id: string) {
    const c = this.own(uid, id);
    return { campaign: c, daily: this.campaigns.daily(c.id) };
  }

  /** Объявление для места показа; profile — своя кампания владельца страницы (owner). */
  public serve(uid: string, query: ServeQuery) {
    const { placement } = query;
    const owner = placement === "profile" ? query.owner : "";
    if (placement === "profile" && !owner) return { ad: null };
    // Как в Telegram: подписчики Premium не видят спонсорских объявлений.
    if (placement !== "profile" && this.users.findById(uid)?.isPremium) return { ad: null, premium: true };
    const c = owner ? this.campaigns.pickForOwner(placement, owner) : this.campaigns.pickForPlacement(placement, uid);
    if (!c) return { ad: null };
    // Свой профиль рекламодатель смотрит бесплатно.
    const bill = c.ownerId !== uid && (!owner || this.impressions.shouldBill(uid, c.id));
    if (bill) this.campaigns.recordImpression(c.id, c.cpmStars);
    return { ad: publicCampaign(c) };
  }

  public click(uid: string, id: string) {
    const c = this.campaigns.findById(id);
    if (!c) throw new ApiError(404, "not found");
    // Клики владельца по своему баннеру (например, в профиле) не портят CTR.
    if (c.ownerId !== uid) this.campaigns.recordClick(c.id);
    return { ok: true, url: c.url };
  }

  private own(uid: string, id: string): AdCampaign {
    const c = this.campaigns.findById(id);
    if (!c || c.ownerId !== uid) throw new ApiError(404, "Кампания не найдена");
    return c;
  }
}
