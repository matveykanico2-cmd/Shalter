import { Controller, Get, Param, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { ShareTargetService } from "./share-target.service.js";

// /share-target — без сессии (браузер шлёт форму из системного меню), тело — Buffer из
// ShareTargetBodyMiddleware. /api/share/:token — уже из приложения, с сессией.
@Controller()
export class ShareTargetController {
  public constructor(private readonly share: ShareTargetService) {}

  @Post("share-target")
  public receive(@Req() req: Request, @Res() res: Response): void {
    res.redirect(303, this.share.receive(req.headers["content-type"], req.body));
  }

  @Get("api/share/:token")
  @UseGuards(AuthGuard)
  public take(@Param("token") token: string) {
    return this.share.take(token);
  }
}
