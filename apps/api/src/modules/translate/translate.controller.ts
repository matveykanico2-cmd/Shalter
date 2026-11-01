import { Body, Controller, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { translateBatchSchema, translateSchema, type TranslateBatchDto, type TranslateDto } from "./model/schemas/translate.schema.js";
import { TranslateService } from "./translate.service.js";

// Без входа: экраны входа и регистрации на языке страны (GET /api/geo/language).
@Controller("api/translate")
export class GuestTranslateController {
  public constructor(private readonly translator: TranslateService) {}

  @Post("ui")
  @HttpCode(200)
  public ui(@Req() req: Request, @Body(new ZodValidationPipe(translateBatchSchema)) dto: TranslateBatchDto) {
    return this.translator.guestBatch(dto, req.ip ?? "");
  }
}

@Controller("api/translate")
@UseGuards(AuthGuard)
export class TranslateController {
  public constructor(private readonly translator: TranslateService) {}

  @Post()
  @HttpCode(200)
  public translate(@Body(new ZodValidationPipe(translateSchema)) dto: TranslateDto) {
    return this.translator.translate(dto);
  }

  @Post("batch")
  @HttpCode(200)
  public batch(@Body(new ZodValidationPipe(translateBatchSchema)) dto: TranslateBatchDto) {
    return this.translator.batch(dto);
  }
}
