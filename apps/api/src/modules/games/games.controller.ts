import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { GamesService } from "./games.service.js";
import {
  createGameSchema,
  gameMetaSchema,
  gamesQuerySchema,
  scoreSchema,
  type CreateGameDto,
  type GameMetaDto,
  type GamesQuery,
  type ScoreDto,
} from "./model/schemas/game.schema.js";

// mine — раньше :id.
@Controller("api/games")
@UseGuards(AuthGuard)
export class GamesController {
  public constructor(private readonly games: GamesService) {}

  @Get()
  public list(@Req() req: Request, @Query(new ZodValidationPipe(gamesQuerySchema)) query: GamesQuery) {
    return this.games.list(req.uid!, query.q);
  }

  @Get("mine")
  public mine(@Req() req: Request) {
    return this.games.mine(req.uid!);
  }

  @Get(":id")
  public get(@Param("id") id: string) {
    return this.games.get(id);
  }

  @Post()
  @HttpCode(200)
  public create(@Req() req: Request, @Body(new ZodValidationPipe(createGameSchema)) dto: CreateGameDto) {
    return this.games.create(req.uid!, dto);
  }

  @Patch(":id/meta")
  public updateMeta(@Req() req: Request, @Param("id") id: string, @Body(new ZodValidationPipe(gameMetaSchema)) dto: GameMetaDto) {
    return this.games.updateMeta(req.uid!, id, dto);
  }

  @Post(":id/token")
  @HttpCode(200)
  public issueToken(@Req() req: Request, @Param("id") id: string) {
    return this.games.issueToken(req.uid!, id);
  }

  @Get(":id/best")
  public best(@Req() req: Request, @Param("id") id: string, @Query("chatId") chatId: unknown) {
    return this.games.best(req.uid!, id, chatId);
  }

  @Delete(":id")
  public remove(@Req() req: Request, @Param("id") id: string) {
    return this.games.remove(req.uid!, id);
  }

  @Post(":id/play")
  @HttpCode(200)
  public play(@Param("id") id: string) {
    return this.games.play(id);
  }

  @Post(":id/score")
  @HttpCode(200)
  public score(@Req() req: Request, @Param("id") id: string, @Body(new ZodValidationPipe(scoreSchema)) dto: ScoreDto) {
    return this.games.score(req.uid!, id, dto);
  }

  @Get(":id/scores")
  public scores(@Req() req: Request, @Param("id") id: string, @Query("chatId") chatId: unknown) {
    return this.games.scores(req.uid!, id, chatId);
  }
}
