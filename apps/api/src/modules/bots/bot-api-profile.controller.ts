import { Body, Controller, Get, HttpCode, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { BotApiProfileService } from "./bot-api-profile.service.js";
import { BotTokenGuard, CurrentBot } from "./guards/bot-token.guard.js";
import type { Bot } from "./model/domain.js";
import {
  checkWebAppSchema,
  resolveUsernameQuerySchema,
  setAvatarSchema,
  setCommandsSchema,
  setProfileSchema,
  setWebAppCodeSchema,
  setWebAppSchema,
  userQuerySchema,
  type CheckWebAppDto,
  type ResolveUsernameQueryDto,
  type SetAvatarDto,
  type SetCommandsDto,
  type SetProfileDto,
  type SetWebAppCodeDto,
  type SetWebAppDto,
  type UserQueryDto,
} from "./model/schemas/bot-api.schema.js";

const originOf = (req: Request) => `${req.protocol}://${req.get("host")}`;

// Bot API (Authorization: Bearer <токен бота>): сам бот и сведения о людях.
@Controller("api/bot-api")
@UseGuards(BotTokenGuard)
export class BotApiProfileController {
  public constructor(private readonly profile: BotApiProfileService) {}

  @Get("me")
  public me(@CurrentBot() bot: Bot, @Req() req: Request) {
    return this.profile.me(bot, originOf(req));
  }

  @Get("getMyCommands")
  public getMyCommands(@CurrentBot() bot: Bot) {
    return this.profile.commands(bot);
  }

  @Post("setMyCommands")
  @HttpCode(200)
  public setMyCommands(@CurrentBot() bot: Bot, @Body(new ZodValidationPipe(setCommandsSchema)) dto: SetCommandsDto) {
    return this.profile.setCommands(bot, dto);
  }

  @Post("setMyProfile")
  @HttpCode(200)
  public setMyProfile(@CurrentBot() bot: Bot, @Body(new ZodValidationPipe(setProfileSchema)) dto: SetProfileDto) {
    return this.profile.setProfile(bot, dto);
  }

  @Post("setMyAvatar")
  @HttpCode(200)
  public setMyAvatar(@CurrentBot() bot: Bot, @Body(new ZodValidationPipe(setAvatarSchema)) dto: SetAvatarDto) {
    return this.profile.setAvatar(bot, dto);
  }

  @Post("setWebApp")
  @HttpCode(200)
  public setWebApp(@CurrentBot() bot: Bot, @Req() req: Request, @Body(new ZodValidationPipe(setWebAppSchema)) dto: SetWebAppDto) {
    return this.profile.setWebApp(bot, originOf(req), dto);
  }

  @Post("setWebAppCode")
  @HttpCode(200)
  public setWebAppCode(@CurrentBot() bot: Bot, @Req() req: Request, @Body(new ZodValidationPipe(setWebAppCodeSchema)) dto: SetWebAppCodeDto) {
    return this.profile.setWebAppCode(bot, originOf(req), dto);
  }

  @Post("checkWebAppData")
  @HttpCode(200)
  public checkWebAppData(@CurrentBot() bot: Bot, @Body(new ZodValidationPipe(checkWebAppSchema)) dto: CheckWebAppDto) {
    return this.profile.checkWebAppData(bot, dto);
  }

  @Get("getUser")
  public getUser(@CurrentBot() bot: Bot, @Query(new ZodValidationPipe(userQuerySchema)) query: UserQueryDto) {
    return this.profile.user(bot, query);
  }

  @Get("getUserStatus")
  public getUserStatus(@CurrentBot() bot: Bot, @Query(new ZodValidationPipe(userQuerySchema)) query: UserQueryDto) {
    return this.profile.userStatus(bot, query);
  }

  @Get("resolveUsername")
  public resolveUsername(@CurrentBot() bot: Bot, @Query(new ZodValidationPipe(resolveUsernameQuerySchema)) query: ResolveUsernameQueryDto) {
    return this.profile.resolveUsername(bot, query);
  }

  @Get("getCommonChats")
  public getCommonChats(@CurrentBot() bot: Bot, @Query(new ZodValidationPipe(userQuerySchema)) query: UserQueryDto) {
    return this.profile.commonChats(bot, query);
  }

  @Get("getMyStats")
  public getMyStats(@CurrentBot() bot: Bot) {
    return this.profile.stats(bot);
  }
}
