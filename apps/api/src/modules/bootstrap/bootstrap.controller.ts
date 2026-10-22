import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { BootstrapService } from "./bootstrap.service.js";

// GET /api/bootstrap.
@Controller("api/bootstrap")
@UseGuards(AuthGuard)
export class BootstrapController {
  public constructor(private readonly bootstrap: BootstrapService) {}

  @Get()
  public load(@Req() req: Request) {
    return this.bootstrap.load(req.uid!, req.cookies?.device_id ?? null);
  }
}
