import { createHash, randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { InjectDb, type Db } from "../db/db.module.js";
import { gameScores, games, gameTokens } from "../db/schema.js";
import { toGame } from "./lib/game.mapper.js";
import type { Game, GameDraft, GameRow, GameScoreRow } from "./model/domain.js";

// Игры, рекорды и токены Game API — таблицы games, game_scores, game_tokens, как
// server/data/games.js (Bot API в server/ пишет в те же таблицы через него).
const HAS_CODE = sql`trim(${games.code}) != ''`;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

@Injectable()
export class GamesRepository {
  public constructor(@InjectDb() private readonly db: Db) {}

  public findById(id: string, withCode = false): Game | null {
    const row = this.db.select().from(games).where(eq(games.id, id)).get();
    return row ? toGame(row, withCode) : null;
  }

  /** Опубликованные игры с кодом: черновики без кода в каталог не попадают. */
  public listPublic(): Game[] {
    return this.db
      .select()
      .from(games)
      .where(and(eq(games.isPublic, 1), HAS_CODE))
      .orderBy(desc(games.plays), desc(games.updatedAt))
      .limit(100)
      .all()
      .map((r) => toGame(r));
  }

  /**
   * Опубликованные с кодом и свои, по названию и описанию. lower_ru (server/db.js) — JS
   * toLowerCase: встроенный lower() SQLite сворачивает только ASCII. % и _ ищутся как символы.
   */
  public search(needle: string, userId: string, limit: number): Game[] {
    const like = `%${needle.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    return this.db
      .all<GameRow>(sql`
        SELECT * FROM games
        WHERE ((isPublic = 1 AND trim(code) != '') OR ownerId = ${userId})
          AND (lower_ru(title) LIKE ${like} ESCAPE '\\' OR lower_ru(description) LIKE ${like} ESCAPE '\\')
        ORDER BY plays DESC LIMIT ${limit}`)
      .map((r) => toGame(r));
  }

  public listByOwner(ownerId: string): Game[] {
    return this.db
      .select()
      .from(games)
      .where(eq(games.ownerId, ownerId))
      .orderBy(desc(games.updatedAt))
      .all()
      .map((r) => toGame(r));
  }

  /** Новая игра или замена полей существующей (saveGame); возвращает её с кодом. */
  public save(game: GameDraft): Game | null {
    const now = new Date().toISOString();
    const isPublic = game.isPublic ? 1 : 0;
    this.db
      .insert(games)
      .values({ ...game, isPublic, plays: 0, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: games.id,
        set: { title: game.title, description: game.description, emoji: game.emoji, code: game.code, isPublic, updatedAt: now },
      })
      .run();
    return this.findById(game.id, true);
  }

  public updateMeta(id: string, meta: { title: string; description: string; emoji: string; isPublic: boolean }): Game | null {
    this.db
      .update(games)
      .set({ ...meta, isPublic: meta.isPublic ? 1 : 0, updatedAt: new Date().toISOString() })
      .where(eq(games.id, id))
      .run();
    return this.findById(id);
  }

  /** Игра вместе с рекордами и токеном Game API. */
  public delete(id: string): void {
    this.db.delete(games).where(eq(games.id, id)).run();
    this.db.delete(gameScores).where(eq(gameScores.gameId, id)).run();
    this.db.delete(gameTokens).where(eq(gameTokens.gameId, id)).run();
  }

  public countPlay(id: string): void {
    this.db.update(games).set({ plays: sql`${games.plays} + 1` }).where(eq(games.id, id)).run();
  }

  public scoreOf(gameId: string, scope: string, userId: string): number | undefined {
    return this.db
      .select({ score: gameScores.score })
      .from(gameScores)
      .where(and(eq(gameScores.gameId, gameId), eq(gameScores.scope, scope), eq(gameScores.userId, userId)))
      .get()?.score;
  }

  public setScore(gameId: string, scope: string, userId: string, score: number): void {
    const updatedAt = new Date().toISOString();
    this.db
      .insert(gameScores)
      .values({ gameId, scope, userId, score, updatedAt })
      .onConflictDoUpdate({ target: [gameScores.gameId, gameScores.scope, gameScores.userId], set: { score, updatedAt } })
      .run();
  }

  public deleteScore(gameId: string, userId: string): void {
    this.db.delete(gameScores).where(and(eq(gameScores.gameId, gameId), eq(gameScores.userId, userId))).run();
  }

  public topScores(gameId: string, scope: string, limit = 20): GameScoreRow[] {
    return this.db
      .select({ userId: gameScores.userId, score: gameScores.score, updatedAt: gameScores.updatedAt })
      .from(gameScores)
      .where(and(eq(gameScores.gameId, gameId), eq(gameScores.scope, scope)))
      .orderBy(desc(gameScores.score), asc(gameScores.updatedAt))
      .limit(limit)
      .all();
  }

  public stats(gameId: string): { plays: number; players: number; topScore: number } {
    const row = this.db.get<{ players: number | null; top: number | null }>(
      sql`SELECT count(DISTINCT userId) AS players, max(score) AS top FROM game_scores WHERE gameId = ${gameId} AND scope = ''`
    );
    const plays = this.db.select({ plays: games.plays }).from(games).where(eq(games.id, gameId)).get()?.plays ?? 0;
    return { plays, players: row?.players ?? 0, topScore: row?.top ?? 0 };
  }

  /** Новый токен Game API (старый перестаёт работать). Возвращается один раз, в базе — хэш. */
  public issueToken(gameId: string): string {
    const token = `game_${randomBytes(24).toString("hex")}`;
    const tokenHash = hashToken(token);
    const createdAt = new Date().toISOString();
    this.db.insert(gameTokens).values({ gameId, tokenHash, createdAt }).onConflictDoUpdate({ target: gameTokens.gameId, set: { tokenHash, createdAt } }).run();
    return token;
  }

  public gameIdByToken(token: string): string | undefined {
    return this.db.select({ gameId: gameTokens.gameId }).from(gameTokens).where(eq(gameTokens.tokenHash, hashToken(token))).get()?.gameId;
  }
}
