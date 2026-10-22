import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { BotsService } from "./bots.service.js";
import {
  appDataSchema,
  broadcastSchema,
  commandsSchema,
  createBotSchema,
  openAppSchema,
  patchBotSchema,
  type AppDataDto,
  type BroadcastDto,
  type CommandsDto,
  type CreateBotDto,
  type OpenAppDto,
  type PatchBotDto,
} from "./model/schemas/bot.schema.js";

@Controller("api/bots")
@UseGuards(AuthGuard)
export class BotsController {
  public constructor(private readonly bots: BotsService) {}

  @Get()
  public list(@Req() req: Request) {
    return this.bots.list(req.uid!);
  }

  @Post()
  @HttpCode(200)
  public create(@Req() req: Request, @Body(new ZodValidationPipe(createBotSchema)) dto: CreateBotDto) {
    return this.bots.create(req.uid!, dto);
  }

  @Get("audience/:userId")
  public audience(@Param("userId") userId: string) {
    return this.bots.audience(userId);
  }

  @Get(":id/token")
  public token(@Req() req: Request, @Param("id") id: string) {
    return this.bots.token(req.uid!, id);
  }

  @Post(":id/regenerate-token")
  @HttpCode(200)
  public regenerateToken(@Req() req: Request, @Param("id") id: string) {
    return this.bots.regenerateToken(req.uid!, id);
  }

  @Delete(":id")
  public delete(@Req() req: Request, @Param("id") id: string) {
    return this.bots.delete(req.uid!, id);
  }

  @Post(":id/broadcast")
  @HttpCode(200)
  public broadcast(@Req() req: Request, @Param("id") id: string, @Body(new ZodValidationPipe(broadcastSchema)) dto: BroadcastDto) {
    return this.bots.broadcast(req.uid!, id, dto);
  }

  @Patch(":id")
  public patch(@Req() req: Request, @Param("id") id: string, @Body(new ZodValidationPipe(patchBotSchema)) dto: PatchBotDto) {
    return this.bots.patch(req.uid!, id, dto);
  }

  @Post(":id/app/open")
  @HttpCode(200)
  public openApp(@Req() req: Request, @Param("id") id: string, @Body(new ZodValidationPipe(openAppSchema)) dto: OpenAppDto) {
    return this.bots.openApp(req.uid!, id, `${req.protocol}://${req.get("host")}`, dto);
  }

  @Post(":id/app/data")
  @HttpCode(200)
  public appData(@Req() req: Request, @Param("id") id: string, @Body(new ZodValidationPipe(appDataSchema)) dto: AppDataDto) {
    return this.bots.appData(req.uid!, id, dto);
  }

  @Put(":id/commands")
  public setCommands(@Req() req: Request, @Param("id") id: string, @Body(new ZodValidationPipe(commandsSchema)) dto: CommandsDto) {
    return this.bots.setCommands(req.uid!, id, dto);
  }

  @Get(":id")
  public get(@Req() req: Request, @Param("id") id: string) {
    return this.bots.get(req.uid!, id);
  }
}
