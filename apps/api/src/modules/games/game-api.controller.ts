import { All, Body, Controller, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { GameApiService } from "./game-api.service.js";
import { CurrentGame, GameTokenGuard } from "./guards/game-token.guard.js";
import type { Game } from "./model/domain.js";
import {
  deleteScoreSchema,
  setScoreSchema,
  updateGameSchema,
  type DeleteScoreDto,
  type SetScoreDto,
  type UpdateGameDto,
} from "./model/schemas/game.schema.js";

// Методы чтения — любым HTTP-методом (router.all в server/routes/gameApi.js).
@Controller("api/game-api")
@UseGuards(GameTokenGuard)
export class GameApiController {
  public constructor(private readonly api: GameApiService) {}

  @All("getGame")
  @HttpCode(200)
  public getGame(@CurrentGame() game: Game) {
    return this.api.getGame(game);
  }

  @Post("updateGame")
  @HttpCode(200)
  public updateGame(@CurrentGame() game: Game, @Body(new ZodValidationPipe(updateGameSchema)) dto: UpdateGameDto) {
    return this.api.updateGame(game, dto);
  }

  @All("getStats")
  @HttpCode(200)
  public getStats(@CurrentGame() game: Game) {
    return this.api.getStats(game);
  }

  @All("getScores")
  @HttpCode(200)
  public getScores(@CurrentGame() game: Game, @Req() req: Request) {
    const body = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
    return this.api.getScores(game, { ...(req.query as Record<string, unknown>), ...body });
  }

  @Post("setScore")
  @HttpCode(200)
  public setScore(@CurrentGame() game: Game, @Body(new ZodValidationPipe(setScoreSchema)) dto: SetScoreDto) {
    return this.api.setScore(game, dto);
  }

  @Post("deleteScore")
  @HttpCode(200)
  public deleteScore(@CurrentGame() game: Game, @Body(new ZodValidationPipe(deleteScoreSchema)) dto: DeleteScoreDto) {
    return this.api.deleteScore(game, dto);
  }
}
