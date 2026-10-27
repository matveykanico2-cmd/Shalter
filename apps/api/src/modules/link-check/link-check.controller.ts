import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { LinkCheckService } from "./link-check.service.js";

@Controller("api/link-check")
@UseGuards(AuthGuard)
export class LinkCheckController {
  public constructor(private readonly links: LinkCheckService) {}

  @Get()
  public check(@Req() req: Request, @Query("url") url: unknown) {
    return this.links.check(url, `${req.protocol}://${req.get("host")}`);
  }

  @Get("instant-view")
  public instantView(@Req() req: Request, @Query("url") url: unknown) {
    return this.links.instantView(req.uid!, url);
  }
}
