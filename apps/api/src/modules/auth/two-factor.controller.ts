import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { SessionUserGuard } from "./guards/session-user.guard.js";
import { codeSchema, passwordSchema, ticketSchema, type CodeDto, type PasswordDto, type TicketDto } from "./model/schemas/account.schema.js";
import {
  cloudPasswordSchema,
  twoFactorLoginSchema,
  twoFactorSetupSchema,
  type CloudPasswordDto,
  type TwoFactorLoginDto,
  type TwoFactorSetupDto,
} from "./model/schemas/two-factor.schema.js";
import { TwoFactorService } from "./two-factor.service.js";

// Двухфакторная аутентификация: настройка вошедшим и второй шаг входа по билету.
@Controller("api/auth/2fa")
export class TwoFactorController {
  public constructor(private readonly twoFactor: TwoFactorService) {}

  @Get()
  @UseGuards(SessionUserGuard)
  public status(@Req() req: Request) {
    return this.twoFactor.status(req.uid!);
  }

  @Post("setup")
  @HttpCode(200)
  @UseGuards(SessionUserGuard)
  public setup(@Req() req: Request, @Body(new ZodValidationPipe(twoFactorSetupSchema)) dto: TwoFactorSetupDto) {
    return this.twoFactor.setup(req.uid!, dto.method);
  }

  @Post("send-code")
  @HttpCode(200)
  public async sendCode(@Req() req: Request, @Body(new ZodValidationPipe(ticketSchema)) dto: TicketDto) {
    await this.twoFactor.sendCode(req, dto.ticket);
    return { ok: true };
  }

  @Post("cloud-password")
  @HttpCode(200)
  @UseGuards(SessionUserGuard)
  public setCloudPassword(@Req() req: Request, @Body(new ZodValidationPipe(cloudPasswordSchema)) dto: CloudPasswordDto) {
    return this.twoFactor.setCloudPassword(req, req.uid!, dto);
  }

  @Post("cloud-password/disable")
  @HttpCode(200)
  @UseGuards(SessionUserGuard)
  public disableCloudPassword(@Req() req: Request, @Body(new ZodValidationPipe(passwordSchema)) dto: PasswordDto) {
    return this.twoFactor.disableCloudPassword(req.uid!, dto.password);
  }

  @Post("hint")
  @HttpCode(200)
  public hint(@Body(new ZodValidationPipe(ticketSchema)) dto: TicketDto) {
    return this.twoFactor.hint(dto.ticket);
  }

  @Post("enable")
  @HttpCode(200)
  @UseGuards(SessionUserGuard)
  public enable(@Req() req: Request, @Body(new ZodValidationPipe(codeSchema)) dto: CodeDto) {
    return this.twoFactor.enable(req.uid!, dto.code);
  }

  @Post("disable")
  @HttpCode(200)
  @UseGuards(SessionUserGuard)
  public disable(@Req() req: Request, @Body(new ZodValidationPipe(codeSchema)) dto: CodeDto) {
    return this.twoFactor.disable(req.uid!, dto.code);
  }

  @Post("login")
  @HttpCode(200)
  public login(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body(new ZodValidationPipe(twoFactorLoginSchema)) dto: TwoFactorLoginDto) {
    return this.twoFactor.login(req, res, dto.ticket, dto.code);
  }
}
