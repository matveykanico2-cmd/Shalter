import { CanActivate, createParamDecorator, ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { ApiError } from "../../../common/errors/api-error.js";
import { GamesRepository } from "../games.repository.js";
import { GamesService } from "../games.service.js";
import type { Game } from "../model/domain.js";

declare global {
  namespace Express {
    interface Request {
      /** Игра, чей токен Game API пришёл в Authorization (GameTokenGuard). */
      game?: Game;
    }
  }
}

// Game API: Authorization: Bearer game_… (токен — в редакторе игры → «API-токен»). Без токена
// или с чужим — 401, как в server/routes/gameApi.js.
@Injectable()
export class GameTokenGuard implements CanActivate {
  public constructor(
    private readonly games: GamesRepository,
    private readonly service: GamesService
  ) {}

  public canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;
    if (!token) throw new ApiError(401, "Missing Authorization: Bearer <game token>");
    const gameId = /^game_[a-f0-9]{48}$/.test(token) ? this.games.gameIdByToken(token) : undefined;
    const game = gameId ? this.service.find(gameId, true) : null;
    if (!game) throw new ApiError(401, "Invalid game token");
    req.game = game;
    return true;
  }
}

/** Игра, которую проверил GameTokenGuard. */
export const CurrentGame = createParamDecorator((_data: unknown, context: ExecutionContext): Game => {
  return context.switchToHttp().getRequest<Request>().game!;
});
