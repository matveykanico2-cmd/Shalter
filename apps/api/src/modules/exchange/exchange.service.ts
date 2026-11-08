import { Injectable } from "@nestjs/common";
import { hasAdminSection } from "../../common/lib/admin-access.js";
import { ApiError } from "../../common/errors/api-error.js";
import { UsersRepository } from "../users/users.repository.js";
import { ExchangeRepository } from "./exchange.repository.js";
import type { CreateCoinDto, CreatorDto, RateDto } from "./model/schemas/exchange.schema.js";

@Injectable()
export class ExchangeService {
  public constructor(private readonly repo: ExchangeRepository, private readonly users: UsersRepository) {}

  private permissions(uid: string) {
    const user = this.users.findById(uid);
    const isAdmin = hasAdminSection(user, "exchange");
    return { isAdmin, canCreate: isAdmin || this.repo.isCreator(uid) };
  }

  private present(coin: NonNullable<ReturnType<ExchangeRepository["coin"]>>) {
    const history = this.repo.history(coin.id);
    const first = history[0]?.rate ?? coin.currentRate;
    const changePercent = first ? ((coin.currentRate - first) / first) * 100 : 0;
    return { ...coin, changePercent: Math.round(changePercent * 100) / 100, history };
  }

  public list(uid: string) {
    return { coins: this.repo.listCoins().map((coin) => this.present(coin)), permissions: this.permissions(uid) };
  }

  public create(uid: string, dto: CreateCoinDto) {
    if (!this.permissions(uid).canCreate) throw new ApiError(403, "Нет права создавать монеты");
    try {
      return { coin: this.present(this.repo.create({ ...dto, userId: uid })) };
    } catch (err) {
      if (String(err).includes("UNIQUE")) throw new ApiError(409, "Монета с таким тикером уже существует");
      throw err;
    }
  }

  public setRate(uid: string, id: string, dto: RateDto) {
    const coin = this.repo.coin(id);
    if (!coin) throw new ApiError(404, "Монета не найдена");
    const p = this.permissions(uid);
    if (!p.isAdmin && (!p.canCreate || coin.createdBy !== uid)) throw new ApiError(403, "Менять курс может администратор или создатель монеты");
    return { coin: this.present(this.repo.setRate(id, dto.rate, uid)!) };
  }

  public creators(uid: string) {
    if (!this.permissions(uid).isAdmin) throw new ApiError(403, "Недостаточно прав");
    return { creators: this.repo.creators() };
  }

  public setCreator(uid: string, dto: CreatorDto) {
    if (!this.permissions(uid).isAdmin) throw new ApiError(403, "Недостаточно прав");
    if (!this.users.findById(dto.userId)) throw new ApiError(404, "Пользователь не найден");
    this.repo.setCreator(dto.userId, dto.enabled, uid);
    return { creators: this.repo.creators() };
  }
}
