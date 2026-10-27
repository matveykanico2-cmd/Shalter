import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { AuthGuard } from "./guards/auth.guard.js";
import {
  passkeyLoginFinishSchema,
  passkeyRegisterFinishSchema,
  type PasskeyLoginFinishDto,
  type PasskeyRegisterFinishDto,
} from "./model/schemas/passkey.schema.js";
import { PasskeysService } from "./passkeys.service.js";

// Ключи доступа: добавление и список у вошедшего, вход по ключу.
@Controller("api/auth")
export class PasskeysController {
  public constructor(private readonly passkeys: PasskeysService) {}

  @Post("passkey/register/start")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  public registerStart(@Req() req: Request) {
    return this.passkeys.startRegistration(req, req.uid!);
  }

  @Post("passkey/register/finish")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  public registerFinish(@Req() req: Request, @Body(new ZodValidationPipe(passkeyRegisterFinishSchema)) body: PasskeyRegisterFinishDto) {
    return this.passkeys.finishRegistration(req, req.uid!, body);
  }

  @Get("passkeys")
  @UseGuards(AuthGuard)
  public list(@Req() req: Request) {
    return this.passkeys.list(req.uid!);
  }

  @Delete("passkeys/:id")
  @UseGuards(AuthGuard)
  public delete(@Req() req: Request, @Param("id") id: string) {
    this.passkeys.delete(req.uid!, id);
    return { ok: true };
  }

  @Post("passkey/login/start")
  @HttpCode(200)
  public loginStart(@Req() req: Request) {
    return this.passkeys.startLogin(req);
  }

  @Post("passkey/login/finish")
  @HttpCode(200)
  public loginFinish(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body(new ZodValidationPipe(passkeyLoginFinishSchema)) body: PasskeyLoginFinishDto) {
    return this.passkeys.finishLogin(req, res, body);
  }
}
