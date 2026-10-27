import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { usesForeignUpload } from "../../legacy/legacy.js";
import { ChatsRepository } from "../chats/chats.repository.js";
import { UsersRepository } from "../users/users.repository.js";
import { GamesRepository } from "./games.repository.js";
import { GamesService } from "./games.service.js";
import { MAX_GAME_CODE, MAX_SCORE } from "./lib/game-rules.js";
import type { Game } from "./model/domain.js";
import type { DeleteScoreDto, SetScoreDto, UpdateGameDto } from "./model/schemas/game.schema.js";

// Game API — HTTP-методы для разработчиков игр (как Bot API у ботов): обновлять игру из своего
// CI, читать статистику и рекорды, ставить рекорды со своего сервера. Как server/routes/gameApi.js.
const publicGame = ({ code: _code, ...g }: Game) => g;

@Injectable()
export class GameApiService {
  public constructor(
    private readonly games: GamesRepository,
    private readonly service: GamesService,
    private readonly chats: ChatsRepository,
    private readonly users: UsersRepository
  ) {}

  public getGame(game: Game) {
    return { ok: true, game: publicGame(game), stats: this.games.stats(game.id) };
  }

  public updateGame(game: Game, b: UpdateGameDto) {
    const next = {
      id: game.id,
      ownerId: game.ownerId as string,
      title: b.title ?? game.title,
      description: b.description ?? game.description,
      emoji: b.emoji ?? game.emoji,
      code: b.code ?? (game.code as string),
      isPublic: b.isPublic ?? game.isPublic,
    };
    // Пустое переданное название отклоняет схема; здесь — пустое прежнее.
    if (!next.title) throw new ApiError(400, "title is required");
    // Код проверяется, только если его передали: игру, созданную в приложении без кода, можно
    // сначала переименовать, а код залить позже.
    if (b.code !== undefined && (!next.code.trim() || next.code.length > MAX_GAME_CODE)) throw new ApiError(400, "code: от 1 байта до 512 КБ");
    if (usesForeignUpload(game.ownerId as string, next.code, game.code)) throw new ApiError(400, "Некорректная ссылка на файл");
    return { ok: true, game: publicGame(this.games.save(next)!) };
  }

  public getStats(game: Game) {
    return { ok: true, ...this.games.stats(game.id) };
  }

  /** Параметры — из строки запроса и тела (тело главнее). */
  public getScores(game: Game, q: Record<string, unknown>) {
    const scope = this.scopeOf(q.chatId, q.userId);
    const limit = Math.min(Math.max(Number(q.limit) || 20, 1), 100);
    const rows = this.games.topScores(game.id, scope, limit);
    const names = new Map(this.users.findByIds(rows.map((r) => r.userId)).map((u) => [u.id, { name: u.name, username: u.username }]));
    return { ok: true, scores: rows.map((r, i) => ({ position: i + 1, ...r, ...names.get(r.userId) })) };
  }

  /** Рекорд с сервера разработчика. force — записать, даже если меньше прежнего (сброс накрутки). */
  public setScore(game: Game, dto: SetScoreDto) {
    const { userId, chatId, force, score } = dto;
    if (!userId || !this.users.findById(userId)) throw new ApiError(404, "user not found");
    if (!Number.isSafeInteger(score) || score < 0 || score > MAX_SCORE) throw new ApiError(400, "score: целое от 0");
    const scope = this.scopeOf(chatId, userId);
    const write = (sc: string) => {
      if (!force) return this.service.submitScore(game.id, sc, userId, score);
      this.games.setScore(game.id, sc, userId, score);
      return { best: score, improved: true };
    };
    const global = write("");
    const local = scope ? write(scope) : null;
    return { ok: true, ...(local ?? global) };
  }

  public deleteScore(game: Game, dto: DeleteScoreDto) {
    this.games.deleteScore(game.id, dto.userId);
    return { ok: true };
  }

  /**
   * Таблица рекордов чата — только для участника этого чата (userId — игрок, от имени которого
   * действует сервер игры). Иначе токен любой игры, зная id чата, мог бы засорять чужие таблицы и
   * узнавать, кто в чате состоит. Чужой чат неотличим от несуществующего — тот же 404.
   */
  private scopeOf(chatId: unknown, userId: unknown): string {
    if (!chatId) return "";
    const chat = this.chats.findById(String(chatId));
    if (!chat || !userId || !chat.memberIds.includes(String(userId))) throw new ApiError(404, "chat not found");
    return chat.id;
  }
}
