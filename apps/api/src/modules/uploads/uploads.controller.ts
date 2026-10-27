import { Controller, Get, HttpCode, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { uploadQuerySchema, type UploadQueryDto } from "./model/schemas/upload.schema.js";
import { UploadsService } from "./uploads.service.js";

// Загрузка: лимиты по видам и сам файл (тело — сырые байты, не multipart).
@Controller("api/uploads")
@UseGuards(AuthGuard)
export class UploadsController {
  public constructor(private readonly uploads: UploadsService) {}

  @Get("limits")
  public limits() {
    return this.uploads.limits();
  }

  @Post()
  @HttpCode(200)
  public upload(@Req() req: Request, @Query(new ZodValidationPipe(uploadQuerySchema)) query: UploadQueryDto) {
    return this.uploads.receive(req.uid!, req, query);
  }
}
