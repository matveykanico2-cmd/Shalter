import { Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { genId } from "../../common/lib/gen-id.js";
import { InjectDb, type Db } from "../db/db.module.js";
import { pushSubscriptions } from "../db/schema.js";

// Подписки на уведомления — то же, что server/data/pushSubscriptions.js, на той же таблице;
// по ним шлёт server/push.js.
@Injectable()
export class PushSubscriptionsRepository {
  public constructor(@InjectDb() private readonly db: Db) {}

  /** Битая подписка — null. */
  public listForUser(userId: string): { id: string; userId: string; subscription: { endpoint?: unknown } | null }[] {
    return this.db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId))
      .all()
      .map((row) => {
        let subscription: { endpoint?: unknown } | null;
        try {
          subscription = JSON.parse(row.subscription);
        } catch {
          subscription = null;
        }
        return { id: row.id, userId: row.userId, subscription };
      });
  }

  /** Тот же endpoint у другого пользователя (сменили аккаунт в браузере) — переходит к этому. */
  public add(userId: string, subscription: { endpoint: string } & Record<string, unknown>): void {
    const json = JSON.stringify(subscription);
    this.db
      .insert(pushSubscriptions)
      .values({ id: genId("ps"), userId, endpoint: subscription.endpoint, subscription: json })
      .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId, subscription: json } })
      .run();
  }

  public removeForUser(userId: string, endpoint: string): void {
    this.db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, userId))).run();
  }
}
