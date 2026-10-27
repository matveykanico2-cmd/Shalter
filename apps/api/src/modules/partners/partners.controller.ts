import { Controller, Get, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { PartnersService } from "./partners.service.js";

@Controller("api/partners")
@UseGuards(AuthGuard)
export class PartnersController {
  public constructor(private readonly partners: PartnersService) {}

  @Get("me")
  public me() {
    return this.partners.me();
  }

  @Post("chat")
  @HttpCode(200)
  public chat(@Req() req: Request) {
    return this.partners.chat(req.uid!);
  }
}
