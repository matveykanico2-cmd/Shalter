import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { genId } from "../../common/lib/gen-id.js";
import { usesForeignUpload } from "../../legacy/legacy.js";
import { ChatsRepository } from "../chats/chats.repository.js";
import { UsersRepository } from "../users/users.repository.js";
import { GamesRepository } from "./games.repository.js";
import { builtinCards, builtinGame, BUILTIN_GAMES, isBuiltinId } from "./lib/game.mapper.js";
import { MAX_SCORE } from "./lib/game-rules.js";
import type { Game } from "./model/domain.js";
import type { CreateGameDto, GameMetaDto, ScoreDto } from "./model/schemas/game.schema.js";

// Игры в приложении (/api/games): каталог, свои игры, рекорды — как server/routes/games.js.
const MAX_OWN_GAMES = 50;

@Injectable()
export class GamesService {
  public constructor(
    private readonly games: GamesRepository,
    private readonly chats: ChatsRepository,
    private readonly users: UsersRepository
  ) {}

  /** Игра по id: встроенная (с файлом) или из таблицы; null — нет такой. */
  public find(id: string, withCode = false): Game | null {
    if (isBuiltinId(id)) {
      const g = builtinGame(id);
      if (!g) return null;
      if (!withCode) delete g.code;
      return g;
    }
    return this.games.findById(id, withCode);
  }

  /**
   * Как у Telegram: сначала игра создаётся одними метаданными, код заливается через Game API.
   * Пока кода нет, это черновик — в каталог не попадает, даже опубликованный.
   */
  public catalog(): Game[] {
    return [...builtinCards(), ...this.games.listPublic()];
  }

  /** Поиск по названию и описанию: встроенные, опубликованные и свои (searchGames). */
  public search(q: string, userId: string, limit = 20): Game[] {
    const needle = String(q ?? "").trim().toLowerCase();
    if (!needle) return [];
    const hit = (g: { title: string; description?: string }) => `${g.title} ${g.description ?? ""}`.toLowerCase().includes(needle);
    return [...builtinCards(BUILTIN_GAMES.filter(hit)), ...this.games.search(needle, userId, limit)].slice(0, limit);
  }

  public list(uid: string, q: string) {
    return { games: q ? this.search(q, uid, 50) : this.catalog() };
  }

  public mine(uid: string) {
    return { games: this.games.listByOwner(uid) };
  }

  /** Чужая неопубликованная игра открывается по карточке из чата: id случайный, как ссылка «для своих». */
  public get(id: string) {
    const game = this.find(id, true);
    if (!game) throw new ApiError(404, "Игра не найдена");
    return { game };
  }

  public create(uid: string, dto: CreateGameDto) {
    const { title, code, emoji, description, isPublic } = dto;
    const game = { title, code, emoji, description, isPublic };
    if (usesForeignUpload(uid, game.code)) throw new ApiError(400, "Некорректная ссылка на файл");
    if (this.games.listByOwner(uid).length >= MAX_OWN_GAMES) throw new ApiError(400, "Не больше 50 своих игр");
    return { game: this.games.save({ id: genId("g"), ownerId: uid, ...game }) };
  }

  /** Частичное обновление: поле, которого нет в теле, остаётся прежним. */
  public updateMeta(uid: string, id: string, b: GameMetaDto) {
    const game = this.ownGame(uid, id);
    const title = b.title ?? game.title;
    const emoji = b.emoji ?? game.emoji;
    const description = b.description ?? game.description ?? "";
    const isPublic = b.isPublic ?? !!game.isPublic;
    if (!title) throw new ApiError(400, "Введите название игры");
    return { game: this.games.updateMeta(game.id, { title, description, emoji, isPublic }) };
  }

  /** Токен Game API для своей игры (новый токен отзывает прежний). */
  public issueToken(uid: string, id: string) {
    const game = this.ownGame(uid, id);
    return { token: this.games.issueToken(game.id) };
  }

  public remove(uid: string, id: string) {
    const game = this.ownGame(uid, id);
    this.games.delete(game.id);
    return { ok: true };
  }

  /** Лучший результат игрока (для SDK внутри игры: Shalter.getBest()). */
  public best(uid: string, id: string, chatId: unknown) {
    this.existing(id);
    const scope = this.scopeFor(uid, chatId);
    return { best: this.games.scoreOf(id, scope, uid) ?? 0 };
  }

  public play(id: string) {
    this.existing(id);
    if (!isBuiltinId(id)) this.games.countPlay(id);
    return { ok: true };
  }

  public score(uid: string, id: string, dto: ScoreDto) {
    this.existing(id);
    const { score } = dto;
    if (!Number.isSafeInteger(score) || score < 0 || score > MAX_SCORE) throw new ApiError(400, "Некорректный счёт");
    const scope = this.scopeFor(uid, dto.chatId);
    const global = this.submitScore(id, "", uid, score);
    const local = scope ? this.submitScore(id, scope, uid, score) : null;
    return { best: (local ?? global).best, improved: (local ?? global).improved };
  }

  public scores(uid: string, id: string, chatId: unknown) {
    this.existing(id);
    const scope = this.scopeFor(uid, chatId);
    const rows = this.games.topScores(id, scope);
    const byId = new Map(this.users.findByIds(rows.map((r) => r.userId)).map((u) => [u.id, u]));
    return {
      scores: rows.map((r) => ({
        ...r,
        name: byId.get(r.userId)?.name ?? "Игрок",
        avatarColor: byId.get(r.userId)?.avatarColor,
        avatarImage: byId.get(r.userId)?.avatarImage,
      })),
    };
  }

  /** Сохраняем, только если результат лучше прежнего. */
  public submitScore(gameId: string, scope: string, userId: string, score: number): { best: number; improved: boolean } {
    const prev = this.games.scoreOf(gameId, scope, userId);
    if (prev !== undefined && prev >= score) return { best: prev, improved: false };
    this.games.setScore(gameId, scope, userId, score);
    return { best: score, improved: true };
  }

  private existing(id: string): void {
    if (!this.find(id)) throw new ApiError(404, "Игра не найдена");
  }

  private ownGame(uid: string, id: string): Game {
    const game = this.find(id);
    if (!game || game.ownerId !== uid) throw new ApiError(404, "Игра не найдена");
    return game;
  }

  /** Рекорд: общий (без chatId) и в чате, где отправили карточку игры; чужой чат — 404. */
  private scopeFor(uid: string, chatId: unknown): string {
    if (!chatId) return "";
    const chat = this.chats.findById(String(chatId));
    if (!chat || !chat.memberIds.includes(uid)) throw new ApiError(404, "Чат не найден");
    return chat.id;
  }
}
