import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import {
  appInfoQuerySchema,
  authorizeSchema,
  createAppSchema,
  tokenSchema,
  type AppInfoQueryDto,
  type AuthorizeDto,
  type CreateAppDto,
  type TokenDto,
} from "./model/schemas/oauth.schema.js";
import { OAuthService } from "./oauth.service.js";

// token, userinfo и app-info — без сессии (их зовут сторонний сервер и гость на экране
// согласия); остальное — с сессией.
@Controller("api/oauth")
export class OAuthController {
  public constructor(private readonly oauth: OAuthService) {}

  @Post("token")
  @HttpCode(200)
  public token(@Body(new ZodValidationPipe(tokenSchema)) dto: TokenDto) {
    return this.oauth.token(dto);
  }

  @Get("userinfo")
  public userinfo(@Headers("authorization") authorization: string | undefined) {
    return this.oauth.userinfo(authorization);
  }

  @Get("app-info")
  public appInfo(@Query(new ZodValidationPipe(appInfoQuerySchema)) query: AppInfoQueryDto) {
    return this.oauth.appInfo(query);
  }

  @Post("authorize")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  public authorize(@Req() req: Request, @Body(new ZodValidationPipe(authorizeSchema)) dto: AuthorizeDto) {
    return this.oauth.authorize(req.uid!, dto);
  }

  @Get("apps")
  @UseGuards(AuthGuard)
  public listApps(@Req() req: Request) {
    return this.oauth.listApps(req.uid!);
  }

  @Post("apps")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  public createApp(@Req() req: Request, @Body(new ZodValidationPipe(createAppSchema)) dto: CreateAppDto) {
    return this.oauth.createApp(req.uid!, dto);
  }

  @Delete("apps/:id")
  @UseGuards(AuthGuard)
  public deleteApp(@Req() req: Request, @Param("id") id: string) {
    return this.oauth.deleteApp(req.uid!, id);
  }

  @Get("apps/:id/secret")
  @UseGuards(AuthGuard)
  public secret(@Req() req: Request, @Param("id") id: string) {
    return this.oauth.secret(req.uid!, id);
  }

  @Post("apps/:id/regenerate")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  public regenerate(@Req() req: Request, @Param("id") id: string) {
    return this.oauth.regenerate(req.uid!, id);
  }
}
