import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { hasAdminSection } from "../../common/lib/admin-access.js";
import { findOrCreateDm, sendMessageAndBroadcast } from "../../legacy/legacy.js";
import { RealtimeService } from "../realtime/realtime.service.js";
import { publicUser } from "../users/lib/user.presenter.js";
import { StarsRepository } from "../users/stars.repository.js";
import { UsersRepository } from "../users/users.repository.js";
import type { PromoConfig } from "./model/domain.js";
import type { CreatePromoDto, RedeemPromoDto, UpdatePromoDto } from "./model/schemas/promotions.schema.js";
import { PromotionsRepository } from "./promotions.repository.js";

const MAX_DAYS = 3650;
const MAX_STARS = 1_000_000;
const MAX_USES = 1_000_000;
const CODE_RE = /^[A-Z0-9_-]{4,32}$/;
const USES_ERROR = "Лимит активаций — целое число больше нуля";

function intIn(value: unknown, max: number): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n <= max ? n : null;
}

/** Конфиг собирается из prize, а не берётся из тела как есть. */
function buildConfig(prize: unknown, raw: unknown): PromoConfig {
  const fields = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (prize === "stars") {
    const amount = intIn(fields.amount, MAX_STARS);
    if (!amount) throw new ApiError(400, "Укажите количество звёзд");
    return { type: "stars", amount };
  }
  const labels: Record<string, string> = { premium: "дней Premium", ads: "дней кабинета рекламы", business: "дней бизнеса" };
  if (typeof prize !== "string" || !Object.hasOwn(labels, prize)) throw new ApiError(400, "Неизвестный тип подарка");
  const days = intIn(fields.days, MAX_DAYS);
  if (!days) throw new ApiError(400, `Укажите количество ${labels[prize]}`);
  return { type: prize as "premium" | "ads" | "business", days };
}

/** undefined — поле не передано, null — без лимита. */
function parseUsesTotal(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n = intIn(value, MAX_USES);
  if (n === null) throw new ApiError(400, USES_ERROR);
  return n;
}

// Промокоды (/api/promotions) — как server/routes/promotions.js: админ создаёт коды на
// Premium, звёзды, кабинет рекламы или бизнес; каждый аккаунт активирует код один раз.
@Injectable()
export class PromotionsService {
  public constructor(
    private readonly promos: PromotionsRepository,
    private readonly users: UsersRepository,
    private readonly stars: StarsRepository,
    private readonly realtime: RealtimeService
  ) {}

  /** Промокод раздаёт то, что иначе продаётся, — поэтому раздел «Цены». */
  private requireAdmin(uid: string): void {
    if (!hasAdminSection(this.users.findById(uid), "pricing")) throw new ApiError(403, "Недостаточно прав");
  }

  public list(uid: string) {
    this.requireAdmin(uid);
    const codes = this.promos.list();
    const names = new Map<string, string>();
    for (const id of new Set(codes.map((p) => p.createdBy))) names.set(id, this.users.findById(id)?.name ?? "неизвестно");
    return { codes: codes.map((p) => ({ ...p, createdByName: names.get(p.createdBy)! })) };
  }

  public create(uid: string, dto: CreatePromoDto) {
    this.requireAdmin(uid);
    const code = String(dto.code ?? "").trim().toUpperCase();
    if (code && !CODE_RE.test(code)) throw new ApiError(400, "Код — от 4 до 32 символов: латинские буквы, цифры, _ и -");
    const config = buildConfig(dto.prize, dto.config);
    const usesTotal = parseUsesTotal(dto.usesTotal);
    const created = this.promos.create({ code, prize: config.type, config, usesTotal: usesTotal ?? null, createdBy: uid });
    if (!created) throw new ApiError(409, `Код ${code} уже существует`);
    return { code: created };
  }

  public delete(uid: string, id: string) {
    this.requireAdmin(uid);
    if (!this.promos.findById(id)) throw new ApiError(404, "Код не найден");
    this.promos.delete(id);
    return { ok: true };
  }

  public update(uid: string, id: string, dto: UpdatePromoDto) {
    this.requireAdmin(uid);
    if (!this.promos.findById(id)) throw new ApiError(404, "Код не найден");
    const usesTotal = parseUsesTotal(dto.usesTotal);
    if (usesTotal !== undefined) this.promos.setUsesTotal(id, usesTotal);
    return { code: this.promos.findById(id)! };
  }

  public async redeem(uid: string, dto: RedeemPromoDto) {
    const code = String(dto.code ?? "").trim();
    if (!code) throw new ApiError(400, "Введите код");
    const result = this.promos.redeem(code, uid);
    if ("error" in result) throw new ApiError(400, result.error);

    const { config } = result;
    let message: string;
    if (config.type === "stars") {
      this.stars.add(uid, config.amount);
      message = `🌟 Вам начислено ${config.amount} ⭐ по промокоду!`;
    } else if (config.type === "premium") {
      this.users.grantPremiumDays(uid, config.days);
      message = `🎉 Вам выдан Shalter Premium на ${config.days} дн. по промокоду!`;
    } else if (config.type === "ads") {
      this.users.grantAdsDays(uid, config.days);
      message = `📢 Вам выдан кабинет рекламы на ${config.days} дн. по промокоду!`;
    } else {
      this.users.grantBusinessDays(uid, config.days);
      message = `💼 Вам выдан Shalter для бизнеса на ${config.days} дн. по промокоду!`;
    }

    // Как покупка Premium за звёзды: запись в «Избранном».
    const chat = await findOrCreateDm(uid, uid);
    await sendMessageAndBroadcast(chat, uid, message);
    this.realtime.broadcastToUsers([uid], { type: "self:updated", user: publicUser(this.users.findById(uid)!) });
    return { delivered: true, message, balance: this.stars.balanceOf(uid) };
  }
}
