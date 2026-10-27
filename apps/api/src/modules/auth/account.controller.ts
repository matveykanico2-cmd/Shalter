import { Body, Controller, HttpCode, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { AccountService } from "./account.service.js";
import { AuthGuard } from "./guards/auth.guard.js";
import {
  changePasswordSchema,
  codeSchema,
  emailStartSchema,
  passwordSchema,
  type ChangePasswordDto,
  type CodeDto,
  type EmailStartDto,
  type PasswordDto,
} from "./model/schemas/account.schema.js";

// Пароль, почта и удаление аккаунта вошедшим пользователем.
@Controller("api/auth")
@UseGuards(AuthGuard)
export class AccountController {
  public constructor(private readonly account: AccountService) {}

  @Post("verify-password")
  @HttpCode(200)
  public verifyPassword(@Req() req: Request, @Body(new ZodValidationPipe(passwordSchema)) dto: PasswordDto) {
    this.account.verifyPassword(req.uid!, dto.password);
    return { ok: true };
  }

  @Post("delete-account")
  @HttpCode(200)
  public deleteAccount(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body(new ZodValidationPipe(passwordSchema)) dto: PasswordDto) {
    return this.account.deleteAccount(req, res, req.uid!, dto.password);
  }

  @Post("change-password")
  @HttpCode(200)
  public async changePassword(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body(new ZodValidationPipe(changePasswordSchema)) dto: ChangePasswordDto) {
    await this.account.changePassword(req, res, req.uid!, dto);
    return { ok: true };
  }

  @Post("email/start")
  @HttpCode(200)
  public emailStart(@Req() req: Request, @Body(new ZodValidationPipe(emailStartSchema)) dto: EmailStartDto) {
    return this.account.startEmailChange(req.uid!, dto);
  }

  @Post("email/verify")
  @HttpCode(200)
  public emailVerify(@Req() req: Request, @Body(new ZodValidationPipe(codeSchema)) dto: CodeDto) {
    return this.account.confirmEmailChange(req.uid!, dto.code);
  }
}
