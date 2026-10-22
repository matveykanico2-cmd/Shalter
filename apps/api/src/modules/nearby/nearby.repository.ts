import { Injectable } from "@nestjs/common";
import { and, eq, gt, isNotNull } from "drizzle-orm";
import { InjectDb, type Db } from "../db/db.module.js";
import { users } from "../db/schema.js";

// Место для «Людей рядом» — колонки nearby* в users, как server/data/nearby.js.
@Injectable()
export class NearbyRepository {
  public constructor(@InjectDb() private readonly db: Db) {}

  public setLocation(userId: string, lat: number, lng: number): void {
    this.db.update(users).set({ nearbyLat: lat, nearbyLng: lng, nearbyUpdatedAt: new Date().toISOString() }).where(eq(users.id, userId)).run();
  }

  public clearLocation(userId: string): void {
    this.db.update(users).set({ nearbyLat: null, nearbyLng: null, nearbyUpdatedAt: null }).where(eq(users.id, userId)).run();
  }

  /** Все, кто поделился местом после cutoff. */
  public listSharedSince(cutoff: string) {
    return this.db
      .select({
        id: users.id,
        name: users.name,
        username: users.username,
        avatarColor: users.avatarColor,
        avatarImage: users.avatarImage,
        nearbyLat: users.nearbyLat,
        nearbyLng: users.nearbyLng,
        blockedUserIds: users.blockedUserIds,
      })
      .from(users)
      .where(and(isNotNull(users.nearbyLat), isNotNull(users.nearbyLng), gt(users.nearbyUpdatedAt, cutoff)))
      .all();
  }
}
