import { Injectable } from "@nestjs/common";
import { and, asc, eq, sql } from "drizzle-orm";
import { InjectDb, type Db } from "../db/db.module.js";
import { usernameListings } from "../db/schema.js";
import type { UsernameListing } from "./model/domain.js";

// Объявления о продаже ников — как server/data/usernameListings.js.
@Injectable()
export class UsernameListingsRepository {
  public constructor(@InjectDb() private readonly db: Db) {}

  /** Открытые, от дешёвых к дорогим. */
  public listOpen(): UsernameListing[] {
    return this.db.select().from(usernameListings).where(eq(usernameListings.status, "open")).orderBy(asc(usernameListings.priceStars)).all();
  }

  public find(id: string): UsernameListing | null {
    return this.db.select().from(usernameListings).where(eq(usernameListings.id, id)).get() ?? null;
  }

  public findOpenByUsername(username: string): UsernameListing | null {
    return (
      this.db
        .select()
        .from(usernameListings)
        .where(and(eq(usernameListings.status, "open"), sql`lower(${usernameListings.username}) = lower(${username})`))
        .get() ?? null
    );
  }

  public create(username: string, sellerId: string, priceStars: number): UsernameListing {
    const listing: UsernameListing = {
      id: `ul_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      username,
      sellerId,
      priceStars,
      status: "open",
      buyerId: null,
      soldAt: null,
      createdAt: new Date().toISOString(),
    };
    this.db.insert(usernameListings).values(listing).run();
    return listing;
  }

  /** soldAt — только у проданных; снятое с продажи (withdrawn) не продавалось. */
  public close(id: string, status: "sold" | "withdrawn", buyerId: string | null = null): UsernameListing | null {
    this.db
      .update(usernameListings)
      .set({ status, buyerId, soldAt: status === "sold" ? new Date().toISOString() : null })
      .where(eq(usernameListings.id, id))
      .run();
    return this.find(id);
  }
}
