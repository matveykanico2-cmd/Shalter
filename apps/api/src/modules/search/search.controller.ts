import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { SearchService } from "./search.service.js";

// GET /api/search?q=…
@Controller("api/search")
@UseGuards(AuthGuard)
export class SearchController {
  public constructor(private readonly search: SearchService) {}

  @Get()
  public find(@Req() req: Request, @Query("q") q: unknown) {
    return this.search.search(req.uid!, q);
  }
}
