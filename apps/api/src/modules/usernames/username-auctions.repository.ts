import { randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { and, desc, eq, sql } from "drizzle-orm";
import { InjectDb, type Db } from "../db/db.module.js";
import { usernameAuctions } from "../db/schema.js";
import type { AuctionBid, UsernameAuction, UsernameAuctionRow } from "./model/domain.js";

// Аукционы ников — как server/data/usernameAuctions.js. Ставки — JSON-список в строке аукциона,
// последняя — лидирующая.
@Injectable()
export class UsernameAuctionsRepository {
  public constructor(@InjectDb() private readonly db: Db) {}

  public list(): UsernameAuction[] {
    return this.db.select().from(usernameAuctions).orderBy(desc(usernameAuctions.createdAt)).all().map(toAuction);
  }

  public find(id: string): UsernameAuction | undefined {
    const row = this.db.select().from(usernameAuctions).where(eq(usernameAuctions.id, id)).get();
    return row && toAuction(row);
  }

  public findOpenByUsername(username: string): UsernameAuction | undefined {
    const row = this.db
      .select()
      .from(usernameAuctions)
      .where(and(sql`lower(${usernameAuctions.username}) = ${username.toLowerCase()}`, eq(usernameAuctions.status, "open")))
      .get();
    return row && toAuction(row);
  }

  public create(username: string, startPriceStars: number, endsAt: string): UsernameAuction {
    const id = `ua_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
    this.db
      .insert(usernameAuctions)
      .values({ id, username, startPriceStars, bids: "[]", endsAt, status: "open", createdAt: new Date().toISOString() })
      .run();
    return this.find(id)!;
  }

  public addBid(id: string, userId: string, stars: number): UsernameAuction | undefined {
    const auction = this.find(id);
    if (!auction) return undefined;
    const bids: AuctionBid[] = [...auction.bids, { userId, stars, at: new Date().toISOString() }];
    this.db.update(usernameAuctions).set({ bids: JSON.stringify(bids) }).where(eq(usernameAuctions.id, id)).run();
    return this.find(id);
  }

  public settle(id: string, result: { status: string; winnerId?: string; soldForStars?: number }): UsernameAuction | undefined {
    this.db
      .update(usernameAuctions)
      .set({ status: result.status, winnerId: result.winnerId ?? null, soldForStars: result.soldForStars ?? null, settledAt: new Date().toISOString() })
      .where(eq(usernameAuctions.id, id))
      .run();
    return this.find(id);
  }

  public delete(id: string): void {
    this.db.delete(usernameAuctions).where(eq(usernameAuctions.id, id)).run();
  }
}

function toAuction(row: UsernameAuctionRow): UsernameAuction {
  let bids: AuctionBid[];
  try {
    bids = JSON.parse(row.bids ?? "[]");
  } catch {
    bids = [];
  }
  const top = bids[bids.length - 1] ?? null;
  return {
    id: row.id,
    username: row.username,
    startPriceStars: row.startPriceStars,
    bids,
    topBid: top?.stars ?? null,
    topBidderId: top?.userId ?? null,
    currentPriceStars: top?.stars ?? row.startPriceStars,
    endsAt: row.endsAt,
    status: row.status,
    winnerId: row.winnerId ?? undefined,
    soldForStars: row.soldForStars ?? undefined,
    createdAt: row.createdAt,
    settledAt: row.settledAt ?? undefined,
    expired: row.status === "open" && row.endsAt <= new Date().toISOString(),
  };
}
