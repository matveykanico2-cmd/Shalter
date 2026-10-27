import { Controller, Get, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import { ApiError } from "../../common/errors/api-error.js";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { DonationAlertsService } from "./donation-alerts.service.js";

// connect и callback открываются переходом в браузере: ошибки — текстом, не JSON.
@Controller("api/donation-alerts")
@UseGuards(AuthGuard)
export class DonationAlertsController {
  public constructor(private readonly donations: DonationAlertsService) {}

  @Get("status")
  public status(@Req() req: Request) {
    if (!this.donations.canManage(req.uid!)) throw new ApiError(403, "Недостаточно прав");
    return this.donations.status();
  }

  @Get("connect")
  public connect(@Req() req: Request, @Res() res: Response): void {
    if (!this.donations.canManage(req.uid!)) {
      res.status(403).send("Недостаточно прав");
      return;
    }
    const url = this.donations.authorizeUrl();
    if (!url) {
      res.status(503).send("DonationAlerts не настроен на сервере (нет client id/secret)");
      return;
    }
    res.redirect(url);
  }

  @Get("callback")
  public async callback(@Req() req: Request, @Query("code") code: unknown, @Query("error") error: unknown, @Res() res: Response): Promise<void> {
    if (!this.donations.canManage(req.uid!)) {
      res.status(403).send("Недостаточно прав");
      return;
    }
    res.redirect(await this.donations.callback(code, error));
  }
}
