import { Injectable } from "@nestjs/common";
import { isAdminPhone, PREMIUM_GRANT_DAYS } from "../../common/config/accounts.js";
import { ApiError } from "../../common/errors/api-error.js";
import { findOrCreateDm, pricing, sendMessageAndBroadcast } from "../../legacy/legacy.js";
import { RealtimeService } from "../realtime/realtime.service.js";
import { publicUser } from "../users/lib/user.presenter.js";
import { StarsRepository } from "../users/stars.repository.js";
import { UsersRepository } from "../users/users.repository.js";
import type { GrantPremiumDto, PlanDto } from "./model/schemas/premium.schema.js";
import { PaidPlansService, type PaidProduct } from "./paid-plans.service.js";

// Shalter Premium (/api/premium) — как server/routes/premium.js: тарифы, покупка за звёзды,
// заявка на оплату и выдача админом.
@Injectable()
export class PremiumService {
  private readonly product: PaidProduct;

  public constructor(
    private readonly users: UsersRepository,
    private readonly stars: StarsRepository,
    private readonly realtime: RealtimeService,
    private readonly plans: PaidPlansService
  ) {
    this.product = {
      kind: "premium",
      title: "Shalter Premium",
      icon: "🎉",
      isForever: (u) => !!u.premiumForever,
      isActive: (u) => !!u.isPremium,
      grant: (userId, days) => this.users.grantPremiumDays(userId, days),
      revoke: (userId) => this.users.revokePremium(userId),
    };
  }

  public me(uid: string) {
    const me = this.users.findById(uid)!;
    const p = pricing();
    return {
      isPremium: !!me.isPremium,
      premiumUntil: me.premiumUntil,
      premiumForever: !!me.premiumForever,
      isAdmin: isAdminPhone(me.phone),
      plans: p.plansAsMap(p.getPricing().premiumPlans, (plan) => ({ stars: p.starsCostFor(plan) })),
      starsBalance: this.stars.balanceOf(uid),
    };
  }

  public async buyWithStars(uid: string, dto: PlanDto) {
    const p = pricing();
    const plan = p.getPremiumPlan(dto.plan);
    const cost = p.starsCostFor(plan);

    const me = this.users.findById(uid)!;
    if (me.premiumForever) throw new ApiError(400, "У вас уже есть Shalter Premium навсегда");
    const extending = !!me.isPremium;

    if (!this.stars.spend(uid, cost)) throw new ApiError(400, `Недостаточно звёзд: нужно ${cost} ⭐`);
    this.users.grantPremiumDays(uid, plan.days);

    const chat = await findOrCreateDm(uid, uid);
    await sendMessageAndBroadcast(chat, uid, `🎉 ${extending ? "Shalter Premium продлён" : "Вам выдан Shalter Premium"} на ${plan.label} за ${cost} ⭐!`);
    this.realtime.broadcastToUsers([uid], { type: "self:updated", user: publicUser(this.users.findById(uid)!) });
    return { delivered: true, stars: cost, balance: this.stars.balanceOf(uid), chatId: chat.id };
  }

  public request(uid: string, dto: PlanDto) {
    return this.plans.request(uid, this.product, pricing().getPremiumPlan(dto.plan));
  }

  public grant(uid: string, dto: GrantPremiumDto) {
    return this.plans.grant(uid, this.product, { userId: dto.userId, grant: dto.premium, days: dto.days, forever: dto.forever }, PREMIUM_GRANT_DAYS, {
      granted: (span) => `🎉 Вам выдан Shalter Premium${span}! Спасибо, что поддерживаете проект.`,
      revoked: "Ваш Shalter Premium был отключён администрацией.",
    });
  }
}
