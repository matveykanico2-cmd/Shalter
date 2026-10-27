import { Body, Controller, Get, HttpCode, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { AccountService } from "./account.service.js";
import { AuthGuard } from "./guards/auth.guard.js";
import { ticketSchema, type TicketDto } from "./model/schemas/account.schema.js";
import {
  codeStartSchema,
  codeVerifySchema,
  loginEmailSchema,
  logoutSchema,
  qrConfirmSchema,
  qrPollQuerySchema,
  registerEmailSchema,
  switchAccountSchema,
  usernameQuerySchema,
  type CodeStartDto,
  type CodeVerifyDto,
  type LoginEmailDto,
  type LogoutDto,
  type QrConfirmDto,
  type QrPollQuery,
  type RegisterEmailDto,
  type SwitchAccountDto,
  type UsernameQuery,
} from "./model/schemas/login.schema.js";
import { SignInService } from "./sign-in.service.js";

// Вход, регистрация и аккаунты на устройстве (раньше — server/routes/auth.js).
@Controller("api/auth")
export class AuthController {
  public constructor(
    private readonly signIn: SignInService,
    private readonly account: AccountService
  ) {}

  @Post("login-email")
  @HttpCode(200)
  public loginEmail(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body(new ZodValidationPipe(loginEmailSchema)) dto: LoginEmailDto) {
    return this.signIn.loginWithEmail(req, res, dto.email, dto.password);
  }

  @Post("register-email")
  @HttpCode(200)
  public registerEmail(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body(new ZodValidationPipe(registerEmailSchema)) dto: RegisterEmailDto) {
    return this.account.register(req, res, dto);
  }

  @Post("guest")
  @HttpCode(200)
  public guest(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.account.guest(req, res);
  }

  @Get("username-available")
  public usernameAvailable(@Query(new ZodValidationPipe(usernameQuerySchema)) query: UsernameQuery) {
    return this.account.usernameAvailable(query.u);
  }

  @Get("session")
  public session(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.signIn.sessionState(req, res);
  }

  @Post("switch")
  @HttpCode(200)
  public switchAccount(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body(new ZodValidationPipe(switchAccountSchema)) dto: SwitchAccountDto) {
    return this.signIn.switchAccount(req, res, dto.userId);
  }

  @Post("logout")
  @HttpCode(200)
  public logout(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body(new ZodValidationPipe(logoutSchema)) dto: LogoutDto) {
    return this.signIn.logout(req, res, dto.uid);
  }

  @Post("qr/start")
  @HttpCode(200)
  public qrStart(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.signIn.startQrLogin(req, res);
  }

  @Get("qr/poll")
  public qrPoll(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Query(new ZodValidationPipe(qrPollQuerySchema)) query: QrPollQuery) {
    return this.signIn.pollQrLogin(req, res, query.token);
  }

  @Post("qr/confirm")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  public qrConfirm(@Req() req: Request, @Body(new ZodValidationPipe(qrConfirmSchema)) dto: QrConfirmDto) {
    this.signIn.confirmQrLogin(dto.token, req.uid!);
    return { ok: true };
  }

  @Post("code/start")
  @HttpCode(200)
  public async codeStart(@Body(new ZodValidationPipe(codeStartSchema)) dto: CodeStartDto) {
    await this.signIn.startCodeLogin(dto.phone);
    return { ok: true };
  }

  @Post("code/verify")
  @HttpCode(200)
  public codeVerify(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body(new ZodValidationPipe(codeVerifySchema)) dto: CodeVerifyDto) {
    return this.signIn.verifyCodeLogin(req, res, dto.phone, dto.code);
  }

  @Post("schedule-deletion")
  @HttpCode(200)
  public scheduleDeletion(@Body(new ZodValidationPipe(ticketSchema)) dto: TicketDto) {
    return this.account.scheduleDeletion(dto.ticket);
  }

  @Post("cancel-deletion")
  @HttpCode(200)
  public cancelDeletion(@Body(new ZodValidationPipe(ticketSchema)) dto: TicketDto) {
    return this.account.cancelDeletion(dto.ticket);
  }
}
