import { Body, Controller, HttpCode, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { createReportSchema, resolveReportSchema, type CreateReportDto, type ResolveReportDto } from "./model/schemas/report.schema.js";
import { ReportsService } from "./reports.service.js";

@Controller("api/reports")
@UseGuards(AuthGuard)
export class ReportsController {
  public constructor(private readonly reports: ReportsService) {}

  @Post()
  @HttpCode(200)
  public create(@Req() req: Request, @Body(new ZodValidationPipe(createReportSchema)) dto: CreateReportDto) {
    return this.reports.create(req.uid!, dto);
  }

  @Post(":id/resolve")
  @HttpCode(200)
  public resolve(@Req() req: Request, @Param("id") id: string, @Body(new ZodValidationPipe(resolveReportSchema)) dto: ResolveReportDto) {
    return this.reports.resolve(req.uid!, id, dto);
  }
}
