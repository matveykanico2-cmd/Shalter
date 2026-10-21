import { Controller, Delete, Get, HttpCode, Param, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { SessionCookiesService } from "../auth/session-cookies.service.js";
import { SessionsService } from "./sessions.service.js";

// Устройства, на которых открыт аккаунт (раньше — server/routes/sessions.js).
@Controller("api/sessions")
@UseGuards(AuthGuard)
export class SessionsController {
  public constructor(
    private readonly sessionsService: SessionsService,
    private readonly sessionCookies: SessionCookiesService
  ) {}

  @Get()
  public list(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return { sessions: this.sessionsService.list(req.uid!, this.sessionCookies.getOrCreateDeviceId(req, res)) };
  }

  @Delete(":id")
  public revoke(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Param("id") id: string) {
    this.sessionsService.revoke(req.uid!, this.sessionCookies.getOrCreateDeviceId(req, res), id);
    return { ok: true };
  }

  @Post("terminate-others")
  @HttpCode(200)
  public terminateOthers(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.sessionsService.revokeOthers(req.uid!, this.sessionCookies.getOrCreateDeviceId(req, res));
    return { ok: true };
  }
}
