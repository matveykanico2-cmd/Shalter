import { Injectable } from "@nestjs/common";
import { isPrimaryAdmin } from "../../common/config/accounts.js";
import { ApiError } from "../../common/errors/api-error.js";
import { collectServerStats, mailCheck, pricing } from "../../legacy/legacy.js";
import { RealtimeService } from "../realtime/realtime.service.js";
import { UsersRepository } from "../users/users.repository.js";
import { AdminAccessService } from "./admin-access.service.js";
import type { PricingDto, SectionsDto } from "./model/schemas/admin.schema.js";

// Сервер (раздел «server»), цены (раздел «pricing») и разделы админки, которые выдаёт главный
// админ (server/routes/admin.js). Нагрузку, почту и цены считает server/ через мост.
@Injectable()
export class AdminServerService {
  public constructor(
    private readonly access: AdminAccessService,
    private readonly users: UsersRepository,
    private readonly realtime: RealtimeService,
  ) {}

  public async mailStatus(uid: string) {
    this.access.require(uid, "server");
    const mail = mailCheck();
    const [check, dns] = await Promise.all([mail.verifySmtp(), mail.buildDnsAdvice()]);
    return {
      from: process.env.MAIL_FROM || "Shalter <no-reply@your-domain.example>",
      configured: check.configured === true,
      ok: check.ok === true,
      error: check.error ?? null,
      directEnabled: process.env.MAIL_DIRECT !== "0",
      dns,
    };
  }

  public server(uid: string) {
    this.access.require(uid, "server");
    return collectServerStats();
  }

  public getPricing(uid: string) {
    this.access.require(uid, "pricing");
    const p = pricing();
    return { pricing: p.getPricing(), defaults: p.DEFAULTS };
  }

  public updatePricing(uid: string, dto: PricingDto) {
    this.access.require(uid, "pricing");
    const result = pricing().updatePricing(dto);
    if (result.error !== undefined) throw new ApiError(400, result.error);
    return { pricing: result.value };
  }

  public resetPricing(uid: string) {
    this.access.require(uid, "pricing");
    return { pricing: pricing().resetPricing() };
  }

  /** Разделы админки выдаёт только главный админ; человек видит изменение сразу (self:updated). */
  public setSections(uid: string, id: string, dto: SectionsDto) {
    const me = this.users.findById(uid);
    if (!me || !isPrimaryAdmin(me.phone)) throw new ApiError(403, "Недостаточно прав");
    const target = this.access.target(id);
    const updated = this.users.setAdminSections(target.id, dto.sections)!;
    const user = { id: updated.id, adminSections: updated.adminSections };
    this.realtime.broadcastToUsers([target.id], { type: "self:updated", user });
    return { user };
  }
}
