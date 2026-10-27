import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { publicUser } from "../users/lib/user.presenter.js";
import { normalizeUsername } from "../users/lib/username.js";
import { StarsRepository } from "../users/stars.repository.js";
import { UsersRepository } from "../users/users.repository.js";
import { tell } from "./lib/tell.js";
import type { ListingDto } from "./model/schemas/usernames.schema.js";
import { UsernameAuctionsRepository } from "./username-auctions.repository.js";
import { UsernameListingsRepository } from "./username-listings.repository.js";

// Продажа своего ника за звёзды (/api/usernames/market) — как server/routes/usernames.js.
const MIN_LISTING_STARS = 10;

@Injectable()
export class UsernameMarketService {
  public constructor(
    private readonly listings: UsernameListingsRepository,
    private readonly auctions: UsernameAuctionsRepository,
    private readonly users: UsersRepository,
    private readonly stars: StarsRepository
  ) {}

  /** Открытые объявления; те, чей продавец уже сменил ник, снимаются. */
  public list(userId: string) {
    const alive = [];
    for (const l of this.listings.listOpen()) {
      const seller = this.users.findById(l.sellerId);
      if (!seller || (seller.username ?? "").toLowerCase() !== l.username.toLowerCase()) {
        this.listings.close(l.id, "withdrawn");
        continue;
      }
      alive.push({ ...l, seller: publicUser(seller), mine: l.sellerId === userId });
    }
    return { listings: alive, balance: this.stars.balanceOf(userId) };
  }

  public create(userId: string, { priceStars }: ListingDto) {
    const username = normalizeUsername(this.users.findById(userId)?.username);
    if (!username) throw new ApiError(400, "Сначала займите юзернейм — продавать нечего");

    if (!Number.isFinite(priceStars) || priceStars < MIN_LISTING_STARS) throw new ApiError(400, `Цена — от ${MIN_LISTING_STARS} ⭐`);
    if (this.listings.findOpenByUsername(username)) throw new ApiError(409, "Этот юзернейм уже выставлен");
    if (this.auctions.findOpenByUsername(username)) throw new ApiError(409, "Этот юзернейм сейчас на аукционе");

    return { listing: this.listings.create(username, userId, priceStars) };
  }

  public withdraw(userId: string, id: string) {
    const listing = this.listings.find(id);
    if (!listing || listing.status !== "open") throw new ApiError(404, "Объявление не найдено");
    if (listing.sellerId !== userId) throw new ApiError(403, "Снять объявление может только продавец");
    return { listing: this.listings.close(listing.id, "withdrawn") };
  }

  public async buy(userId: string, id: string) {
    const listing = this.listings.find(id);
    if (!listing || listing.status !== "open") throw new ApiError(404, "Объявление не найдено");
    if (listing.sellerId === userId) throw new ApiError(400, "Это ваше объявление");

    const seller = this.users.findById(listing.sellerId);
    if (!seller || (seller.username ?? "").toLowerCase() !== listing.username.toLowerCase()) {
      this.listings.close(listing.id, "withdrawn");
      throw new ApiError(410, "Продавец больше не владеет этим юзернеймом");
    }
    // Списание и закрытие объявления — без await между ними: иначе два одновременных
    // запроса получали юзернейм оба или бесплатно.
    if (!this.stars.spend(userId, listing.priceStars)) throw new ApiError(402, `Не хватает звёзд: нужно ${listing.priceStars} ⭐`);
    if (this.listings.find(listing.id)?.status !== "open") {
      this.stars.add(userId, listing.priceStars);
      throw new ApiError(409, "Юзернейм уже купили");
    }
    this.listings.close(listing.id, "sold", userId);
    this.stars.add(seller.id, listing.priceStars);

    this.users.setUsername(seller.id, "");
    const buyer = this.users.setUsername(userId, listing.username)!;

    await tell(
      seller.id,
      `💰 Ваш юзернейм @${listing.username} продан за ${listing.priceStars} ⭐.\n\nЗвёзды уже на балансе. Новый юзернейм можно занять в настройках профиля.`,
      "username sale notice"
    );
    await tell(userId, `🎉 Юзернейм @${listing.username} теперь ваш — списано ${listing.priceStars} ⭐.`, "username sale notice");

    return { ok: true, username: listing.username, user: publicUser(buyer), balance: this.stars.balanceOf(userId) };
  }
}
