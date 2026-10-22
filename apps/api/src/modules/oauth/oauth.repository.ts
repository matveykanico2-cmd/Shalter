import { randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { and, desc, eq, gte } from "drizzle-orm";
import { InjectDb, type Db } from "../db/db.module.js";
import { oauthApps, oauthCodes, oauthTokens } from "../db/schema.js";
import type { OAuthApp, OAuthAppRow } from "./model/domain.js";

// Приложения «Входа через Shalter», коды и токены — то же, что server/data/oauthApps.js.
const CODE_TTL_MS = 5 * 60 * 1000;

const randomId = (bytes = 16) => randomBytes(bytes).toString("hex");

const toApp = (row: OAuthAppRow): OAuthApp => ({
  id: row.id,
  name: row.name,
  clientId: row.clientId,
  redirectUri: row.redirectUri,
  ownerId: row.ownerId,
  createdAt: row.createdAt,
});

@Injectable()
export class OAuthRepository {
  public constructor(@InjectDb() private readonly db: Db) {}

  public createApp(ownerId: string, name: string, redirectUri: string): OAuthAppRow {
    const row = {
      id: `oa_${Date.now().toString(36)}_${randomId(4)}`,
      name: name.trim().slice(0, 60),
      clientId: randomId(12),
      clientSecret: randomId(24),
      redirectUri: redirectUri.trim(),
      ownerId,
      createdAt: new Date().toISOString(),
    };
    this.db.insert(oauthApps).values(row).run();
    return row;
  }

  public listByOwner(ownerId: string): OAuthApp[] {
    return this.db.select().from(oauthApps).where(eq(oauthApps.ownerId, ownerId)).orderBy(desc(oauthApps.createdAt)).all().map(toApp);
  }

  public findByClientId(clientId: string): OAuthAppRow | undefined {
    return this.db.select().from(oauthApps).where(eq(oauthApps.clientId, clientId)).get();
  }

  public secretOf(id: string, ownerId: string): { clientId: string; clientSecret: string } | undefined {
    return this.db
      .select({ clientId: oauthApps.clientId, clientSecret: oauthApps.clientSecret })
      .from(oauthApps)
      .where(and(eq(oauthApps.id, id), eq(oauthApps.ownerId, ownerId)))
      .get();
  }

  /** Вместе с приложением уходят его токены и коды. false — нет такого у владельца. */
  public deleteApp(id: string, ownerId: string): boolean {
    const row = this.ownApp(id, ownerId);
    if (!row) return false;
    this.db.delete(oauthApps).where(eq(oauthApps.id, id)).run();
    this.db.delete(oauthTokens).where(eq(oauthTokens.clientId, row.clientId)).run();
    this.db.delete(oauthCodes).where(eq(oauthCodes.clientId, row.clientId)).run();
    return true;
  }

  /**
   * Новый секрет. Его перевыпускают обычно после утечки — тогда и выданные со старым секретом
   * токены скомпрометированы: отзываем все токены приложения.
   */
  public regenerateSecret(id: string, ownerId: string): (OAuthApp & { clientSecret: string }) | undefined {
    const row = this.ownApp(id, ownerId);
    if (!row) return undefined;
    const clientSecret = randomId(24);
    this.db.transaction((tx) => {
      tx.update(oauthApps).set({ clientSecret }).where(eq(oauthApps.id, id)).run();
      tx.delete(oauthTokens).where(eq(oauthTokens.clientId, row.clientId)).run();
    });
    return { ...toApp(this.db.select().from(oauthApps).where(eq(oauthApps.id, id)).get()!), clientSecret };
  }

  public createCode(clientId: string, userId: string, redirectUri: string): string {
    const code = randomId(24);
    this.db
      .insert(oauthCodes)
      .values({ code, clientId, userId, redirectUri, expiresAt: new Date(Date.now() + CODE_TTL_MS).toISOString() })
      .run();
    return code;
  }

  /**
   * Обмен кода; null — код не подходит. Повтор уже обменянного кода (RFC 6749 §4.1.2): код
   * утёк, и обменять его мог не тот, кто должен. Связи «токен ← код» в базе нет, поэтому
   * отзываются все токены этого пользователя в этом приложении, выданные начиная с первого
   * обмена кода, — среди них гарантированно и токен, выданный по нему.
   */
  public redeemCode(code: string, clientId: string, redirectUri: string): { userId: string } | null {
    return this.db.transaction((tx) => {
      const row = tx.select().from(oauthCodes).where(eq(oauthCodes.code, code)).get();
      if (!row) return null;
      if (row.clientId !== clientId) return null;
      if (row.usedAt) {
        tx.delete(oauthTokens)
          .where(and(eq(oauthTokens.clientId, row.clientId), eq(oauthTokens.userId, row.userId), gte(oauthTokens.createdAt, row.usedAt)))
          .run();
        return null;
      }
      if (row.redirectUri !== redirectUri) return null;
      if (new Date(row.expiresAt).getTime() < Date.now()) return null;
      tx.update(oauthCodes).set({ usedAt: new Date().toISOString() }).where(eq(oauthCodes.code, code)).run();
      return { userId: row.userId };
    });
  }

  public issueToken(clientId: string, userId: string): string {
    const token = randomId(32);
    this.db.insert(oauthTokens).values({ token, clientId, userId, createdAt: new Date().toISOString() }).run();
    return token;
  }

  public tokenOwner(token: string): { userId: string; clientId: string } | undefined {
    return this.db.select({ userId: oauthTokens.userId, clientId: oauthTokens.clientId }).from(oauthTokens).where(eq(oauthTokens.token, token)).get();
  }

  private ownApp(id: string, ownerId: string): { clientId: string } | undefined {
    return this.db
      .select({ clientId: oauthApps.clientId })
      .from(oauthApps)
      .where(and(eq(oauthApps.id, id), eq(oauthApps.ownerId, ownerId)))
      .get();
  }
}
