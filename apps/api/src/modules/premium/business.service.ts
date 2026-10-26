import { Injectable } from "@nestjs/common";
import { isAdminPhone } from "../../common/config/accounts.js";
import { pricing } from "../../legacy/legacy.js";
import { UserSettingsService } from "../users/user-settings.service.js";
import { UsersRepository } from "../users/users.repository.js";
import type { GrantBusinessDto, PlanDto } from "./model/schemas/premium.schema.js";
import { PaidPlansService, type PaidProduct } from "./paid-plans.service.js";

// «Shalter для бизнеса» (/api/business) — как server/routes/business.js: тарифы, заявка на
// оплату и выдача админом. Часы работы и автоответ — в настройках (settings.business).
const BUSINESS_GRANT_DAYS = 30;

@Injectable()
export class BusinessService {
  private readonly product: PaidProduct;

  public constructor(
    private readonly users: UsersRepository,
    private readonly settings: UserSettingsService,
    private readonly plans: PaidPlansService
  ) {
    this.product = {
      kind: "business",
      title: "Shalter для бизнеса",
      icon: "🏢",
      isForever: (u) => !!u.businessForever,
      isActive: (u) => !!u.isBusiness,
      grant: (userId, days) => this.users.grantBusinessDays(userId, days),
      revoke: (userId) => this.users.revokeBusiness(userId),
    };
  }

  public me(uid: string) {
    const me = this.users.findById(uid)!;
    const p = pricing();
    return {
      isBusiness: !!me.isBusiness,
      businessUntil: me.businessUntil,
      businessForever: !!me.businessForever,
      businessAddress: me.businessAddress ?? null,
      businessLat: me.businessLat ?? null,
      businessLng: me.businessLng ?? null,
      isAdmin: isAdminPhone(me.phone),
      plans: p.plansAsMap(p.getPricing().businessPlans),
      business: this.settings.get(uid).business,
    };
  }

  public request(uid: string, dto: PlanDto) {
    return this.plans.request(uid, this.product, pricing().getBusinessPlan(dto.plan));
  }

  public grant(uid: string, dto: GrantBusinessDto) {
    return this.plans.grant(uid, this.product, { userId: dto.userId, grant: dto.business, days: dto.days, forever: dto.forever }, BUSINESS_GRANT_DAYS, {
      granted: (span) => `🏢 Вам выдан Shalter для бизнеса${span}!`,
      revoked: "Ваш Shalter для бизнеса был отключён администрацией.",
    });
  }
}
