import { Controller, Delete, Get, HttpCode, Param, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import {
  type OffsetQueryDto,
  offsetQuerySchema,
  uploadQuerySchema,
  type UploadQueryDto,
  uploadSessionIdParam,
  uploadSessionQuerySchema,
  type UploadSessionQueryDto,
} from "./model/schemas/upload.schema.js";
import { UploadSessionsService } from "./upload-sessions.service.js";
import { UploadsService } from "./uploads.service.js";

// Загрузка: лимиты по видам и сам файл (тело — сырые байты, не multipart).
@Controller("api/uploads")
@UseGuards(AuthGuard)
export class UploadsController {
  public constructor(
    private readonly uploads: UploadsService,
    private readonly sessions: UploadSessionsService
  ) {}

  @Get("limits")
  public limits() {
    return this.uploads.limits();
  }

  // Загрузка частями с продолжением после обрыва (upload-sessions.service.ts).
  @Post("sessions")
  @HttpCode(200)
  public createSession(@Req() req: Request, @Query(new ZodValidationPipe(uploadSessionQuerySchema)) query: UploadSessionQueryDto) {
    const { size, ...file } = query;
    return this.sessions.create(req.uid!, file, size);
  }

  @Get("sessions/:id")
  public sessionStatus(@Req() req: Request, @Param("id", new ZodValidationPipe(uploadSessionIdParam)) id: string) {
    return this.sessions.status(req.uid!, id);
  }

  @Put("sessions/:id")
  public appendChunk(
    @Req() req: Request,
    @Param("id", new ZodValidationPipe(uploadSessionIdParam)) id: string,
    @Query(new ZodValidationPipe(offsetQuerySchema)) { offset }: OffsetQueryDto
  ) {
    return this.sessions.append(req.uid!, id, offset, req);
  }

  @Post("sessions/:id/complete")
  @HttpCode(200)
  public completeSession(@Req() req: Request, @Param("id", new ZodValidationPipe(uploadSessionIdParam)) id: string) {
    return this.sessions.complete(req.uid!, id);
  }

  @Delete("sessions/:id")
  public cancelSession(@Req() req: Request, @Param("id", new ZodValidationPipe(uploadSessionIdParam)) id: string) {
    return this.sessions.cancel(req.uid!, id);
  }

  @Post()
  @HttpCode(200)
  public upload(@Req() req: Request, @Query(new ZodValidationPipe(uploadQuerySchema)) query: UploadQueryDto) {
    return this.uploads.receive(req.uid!, req, query);
  }
}
