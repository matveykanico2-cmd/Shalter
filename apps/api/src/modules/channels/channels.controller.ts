import { Controller, Get, HttpCode, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { ChannelsService } from "./channels.service.js";

@Controller("api/channels")
@UseGuards(AuthGuard)
export class ChannelsController {
  public constructor(private readonly channels: ChannelsService) {}

  @Get()
  public catalog(@Req() req: Request, @Query("q") q: string | undefined) {
    return this.channels.catalog(req.uid!, q);
  }

  @Get(":id/similar")
  public similar(@Req() req: Request, @Param("id") id: string) {
    return this.channels.similar(req.uid!, id);
  }

  @Post(":id/subscribe")
  @HttpCode(200)
  public subscribe(@Req() req: Request, @Param("id") id: string) {
    return this.channels.subscribe(req.uid!, id);
  }

  @Get(":id/stats")
  public stats(@Req() req: Request, @Param("id") id: string) {
    return this.channels.stats(req.uid!, id);
  }
}
