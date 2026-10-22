import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { usesForeignUpload } from "../../legacy/legacy.js";
import { StarsRepository } from "../users/stars.repository.js";
import { UsersRepository } from "../users/users.repository.js";
import { AdCampaignsRepository } from "./ad-campaigns.repository.js";
import { AdReviewService } from "./ad-review.service.js";
import { CPM_MIN, isPlacement, PLACEMENTS, publicCampaign } from "./lib/ad-campaign.mapper.js";
import type { AdCampaign, AdCampaignPatch } from "./model/domain.js";
import type { BudgetDto, CampaignDto, CampaignStatusDto, ServeQuery } from "./model/schemas/ads.schema.js";
import { ProfileImpressionsStore } from "./stores/profile-impressions.store.js";

const MAX_TEXT = 200;
const FOREIGN_FILE = "Некорректная ссылка на файл";

/** Места показа из тела: `placements: [...]` или старое `placement: "id"`; ни одного — null. */
function pickPlacements(dto: CampaignDto): string[] | null {
  const raw: unknown[] = Array.isArray(dto.placements) ? dto.placements : dto.placement != null ? [dto.placement] : [];
  const valid = raw.filter(isPlacement);
  return valid.length ? valid : null;
}

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

  public async create(uid: string, dto: CampaignDto) {
    const text = String(dto.text ?? "").trim().slice(0, MAX_TEXT);
    if (!text) throw new ApiError(400, "Напишите текст объявления");
    const placement = pickPlacements(dto) ?? ["discover"];
    if (usesForeignUpload(uid, [dto.url, dto.imageUrl])) throw new ApiError(400, FOREIGN_FILE);
    const created = this.campaigns.create({
      ownerId: uid,
      title: String(dto.title ?? "").trim().slice(0, 60),
      text,
      url: String(dto.url ?? "").trim().slice(0, 300) || null,
      imageUrl: String(dto.imageUrl ?? "").trim() || null,
      placement,
      cpmStars: Number(dto.cpmStars) || 20,
    });
    await this.review.notifyAdmin(created, uid);
    return { campaign: created };
  }

  /** Правка; новый текст, ссылка или картинка снова отправляют объявление на проверку. */
  public async patch(uid: string, id: string, dto: CampaignDto) {
    const c = this.own(uid, id);
    const patch: AdCampaignPatch = {};
    if (typeof dto.title === "string") patch.title = dto.title.trim().slice(0, 60);
    if (typeof dto.text === "string") {
      patch.text = dto.text.trim().slice(0, MAX_TEXT);
      if (!patch.text) throw new ApiError(400, "Напишите текст объявления");
    }
    if (typeof dto.url === "string") patch.url = dto.url.trim().slice(0, 300) || null;
    if (typeof dto.imageUrl === "string") patch.imageUrl = dto.imageUrl.trim() || null;
    if (usesForeignUpload(uid, [patch.url, patch.imageUrl], [c.url, c.imageUrl])) throw new ApiError(400, FOREIGN_FILE);
    const placements = pickPlacements(dto);
    if (placements) patch.placement = placements;
    if (Number.isFinite(Number(dto.cpmStars))) patch.cpmStars = Math.max(CPM_MIN, Number(dto.cpmStars));
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
    const stars = Math.floor(Number(dto.stars) || 0);
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
    const placement = isPlacement(query.placement) ? query.placement : "discover";
    const owner = placement === "profile" ? String(query.owner || "") : "";
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
