import { Controller, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { SupportService } from "./support.service.js";

@Controller("api/support")
@UseGuards(AuthGuard)
export class SupportController {
  public constructor(private readonly support: SupportService) {}

  @Post("chat")
  @HttpCode(200)
  public chat(@Req() req: Request) {
    return this.support.hugoChat(req.uid!);
  }

  @Post("report")
  @HttpCode(200)
  public report(@Req() req: Request) {
    return this.support.report(req.uid!);
  }
}
