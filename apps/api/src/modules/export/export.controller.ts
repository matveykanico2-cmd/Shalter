import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { ExportService } from "./export.service.js";

@Controller("api/export")
@UseGuards(AuthGuard)
export class ExportController {
  public constructor(private readonly exports: ExportService) {}

  @Get()
  public mine(@Req() req: Request) {
    return this.exports.mine(req.uid!);
  }
}
