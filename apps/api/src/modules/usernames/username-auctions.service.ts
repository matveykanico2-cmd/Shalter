import { Injectable } from "@nestjs/common";
import { isAdminPhone } from "../../common/config/accounts.js";
import { ApiError } from "../../common/errors/api-error.js";
import { normalizePhone } from "../../common/lib/validators.js";
import { checkUsername } from "../../legacy/legacy.js";
import { publicUser } from "../users/lib/user.presenter.js";
import { normalizeUsername } from "../users/lib/username.js";
import type { User } from "../users/model/domain.js";
import { StarsRepository } from "../users/stars.repository.js";
import { UsersRepository } from "../users/users.repository.js";
import { tell } from "./lib/tell.js";
import type { UsernameAuction } from "./model/domain.js";
import type { BidDto, CreateAuctionDto, GrantDto } from "./model/schemas/usernames.schema.js";
import { UsernameAuctionsRepository } from "./username-auctions.repository.js";

// Аукционы ников (/api/usernames) — как server/routes/usernames.js. Создаёт, закрывает,
// отменяет аукционы и выдаёт ники админ; ставят все. Итоги подводятся при первом запросе
// после срока.
const MIN_STEP_STARS = 10;

@Injectable()
export class UsernameAuctionsService {
  // Итоги подводятся из нескольких маршрутов (любой GET списка запускает sweep), и два
  // одновременных запроса раньше списывали звёзды с победителя дважды.
  private readonly settling = new Map<string, Promise<UsernameAuction | undefined>>();

  public constructor(
    private readonly auctions: UsernameAuctionsRepository,
    private readonly users: UsersRepository,
    private readonly stars: StarsRepository
  ) {}

  public async list(userId: string) {
    await this.sweep();
    const me = this.users.findById(userId);
    const auctions = this.auctions.list().map((a) => ({
      ...a,
      topBidder: a.topBidderId ? publicUser(this.users.findById(a.topBidderId)!) : null,
      myBid: a.bids.filter((b) => b.userId === userId).pop()?.stars ?? null,
    }));
    return { auctions, balance: this.stars.balanceOf(userId), minStep: MIN_STEP_STARS, isAdmin: isAdminPhone(me?.phone) };
  }

  public async create(userId: string, dto: CreateAuctionDto) {
    this.requireAdmin(userId);
    const username = normalizeUsername(dto.username);
    const problem = await checkUsername(username, { ignoreAuctions: true });
    if (problem) throw new ApiError(problem.status, problem.error);
    if (this.auctions.findOpenByUsername(username)) throw new ApiError(409, "Этот юзернейм уже на аукционе");

    const startPriceStars = Math.max(0, Math.trunc(Number(dto.startPriceStars) || 0));
    const hours = Math.max(1, Math.min(24 * 30, Math.trunc(Number(dto.hours) || 24)));
    const auction = this.auctions.create(username, startPriceStars, new Date(Date.now() + hours * 3600_000).toISOString());
    return { auction };
  }

  public async bid(userId: string, id: string, dto: BidDto) {
    await this.sweep();
    const auction = this.auctions.find(id);
    if (!auction) throw new ApiError(404, "Аукцион не найден");
    if (auction.status !== "open") throw new ApiError(409, "Аукцион уже завершён");

    const stars = Math.trunc(Number(dto.stars));
    const floor = auction.topBid == null ? auction.startPriceStars : auction.topBid + MIN_STEP_STARS;
    if (!Number.isFinite(stars) || stars < floor) throw new ApiError(400, `Минимальная ставка — ${floor} ⭐`);
    const balance = this.stars.balanceOf(userId);
    if (balance < stars) throw new ApiError(402, `Не хватает звёзд — на балансе ${balance} ⭐`, { balance });
    if (auction.topBidderId === userId) throw new ApiError(409, "Вы и так лидируете");

    const outbid = auction.topBidderId;
    const updated = this.auctions.addBid(auction.id, userId, stars);
    if (outbid && outbid !== userId) {
      await tell(
        outbid,
        `Вашу ставку на @${auction.username} перебили — теперь ${stars} ⭐. Ставки принимаются до ${new Date(auction.endsAt).toLocaleString("ru-RU")}.`
      );
    }
    return { auction: updated, balance: this.stars.balanceOf(userId) };
  }

  public async close(userId: string, id: string) {
    this.requireAdmin(userId);
    const auction = this.auctions.find(id);
    if (!auction) throw new ApiError(404, "Аукцион не найден");
    return { auction: await this.settle(auction) };
  }

  public async remove(userId: string, id: string) {
    this.requireAdmin(userId);
    const auction = this.auctions.find(id);
    if (!auction) throw new ApiError(404, "Аукцион не найден");
    for (const bidderId of new Set(auction.bids.map((b) => b.userId))) {
      await tell(bidderId, `Аукцион @${auction.username} отменён администрацией. Звёзды не списывались.`);
    }
    this.auctions.delete(auction.id);
    return { ok: true };
  }

  public async grant(userId: string, dto: GrantDto) {
    this.requireAdmin(userId);
    const target = dto.phone ? this.users.findByPhone(normalizePhone(dto.phone as string)) : this.users.findById(dto.userId as string);
    if (!target) throw new ApiError(404, "Пользователь с таким номером не найден");

    const username = normalizeUsername(dto.username);
    const problem = await checkUsername(username, { forUserId: target.id, ignoreAuctions: true });
    if (problem) throw new ApiError(problem.status, problem.error);

    const updated = this.users.setUsername(target.id, username)!;
    await tell(target.id, `Администрация Shalter выдала вам юзернейм @${username}.`);
    // Выдача важнее аукциона: открытый аукцион на этот юзернейм отменяется сразу,
    // а не висит до конца, принимая ставки на уже занятое имя.
    const open = this.auctions.findOpenByUsername(username);
    if (open) {
      for (const bidderId of new Set(open.bids.map((b) => b.userId))) {
        await tell(bidderId, `Аукцион @${open.username} отменён: юзернейм больше недоступен. Звёзды не списаны.`);
      }
      this.auctions.settle(open.id, { status: "cancelled" });
    }
    return { user: publicUser(updated) };
  }

  private requireAdmin(userId: string): User {
    const me = this.users.findById(userId);
    if (!isAdminPhone(me?.phone)) throw new ApiError(403, "Недостаточно прав");
    return me!;
  }

  private async sweep(): Promise<void> {
    for (const a of this.auctions.list()) {
      if (a.expired) await this.settle(a);
    }
  }

  private settle(auction: UsernameAuction): Promise<UsernameAuction | undefined> {
    if (auction.status !== "open") return Promise.resolve(auction);
    let running = this.settling.get(auction.id);
    if (!running) {
      running = this.settleOnce(auction).finally(() => this.settling.delete(auction.id));
      this.settling.set(auction.id, running);
    }
    return running;
  }

  // Ник уходит самой высокой ставке, которую удалось оплатить; не хватило звёзд — следующей.
  private async settleOnce(stale: UsernameAuction): Promise<UsernameAuction | undefined> {
    const auction = this.auctions.find(stale.id) ?? stale;
    if (auction.status !== "open") return auction;

    const seen = new Set<string>();
    const ranked = [...auction.bids]
      .sort((a, b) => b.stars - a.stars)
      .filter((b) => (seen.has(b.userId) ? false : seen.add(b.userId)));

    for (const bid of ranked) {
      const bidder = this.users.findById(bid.userId);
      if (!bidder) continue;
      const problem = await checkUsername(auction.username, { forUserId: bidder.id, ignoreAuctions: true });
      if (problem) {
        await tell(bid.userId, `Аукцион @${auction.username} отменён: юзернейм больше недоступен. Звёзды не списаны.`);
        return this.auctions.settle(auction.id, { status: "cancelled" });
      }
      // Ставка 0 ⭐ (аукцион с нулевым стартом) списывать нечего — spend(0) вернул бы false.
      if (bid.stars > 0 && (this.stars.balanceOf(bidder.id) < bid.stars || !this.stars.spend(bidder.id, bid.stars))) {
        await tell(
          bid.userId,
          `Вы выиграли @${auction.username} за ${bid.stars} ⭐, но на балансе не хватило звёзд — юзернейм ушёл следующему участнику.`
        );
        continue;
      }
      this.users.setUsername(bidder.id, auction.username, auction.id);
      await tell(bid.userId, `🏆 Вы выиграли аукцион: теперь ваш юзернейм @${auction.username}. Списано ${bid.stars} ⭐.`);
      return this.auctions.settle(auction.id, { status: "sold", winnerId: bidder.id, soldForStars: bid.stars });
    }

    // Ставки были, но никто не смог оплатить — так же «не продан», как и без ставок.
    return this.auctions.settle(auction.id, { status: "unsold" });
  }
}
