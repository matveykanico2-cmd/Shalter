import { Body, Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { translateBatchSchema, translateSchema, type TranslateBatchDto, type TranslateDto } from "./model/schemas/translate.schema.js";
import { TranslateService } from "./translate.service.js";

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
