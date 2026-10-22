import { Body, Controller, Get, HttpCode, Post, UseGuards } from "@nestjs/common";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { HugoService } from "./hugo.service.js";
import { checkSchema, type CheckDto } from "./model/schemas/hugo.schema.js";

@Controller("api/hugo")
@UseGuards(AuthGuard)
export class HugoController {
  public constructor(private readonly hugo: HugoService) {}

  @Get()
  public info() {
    return this.hugo.info();
  }

  @Post("check")
  @HttpCode(200)
  public check(@Body(new ZodValidationPipe(checkSchema)) dto: CheckDto) {
    return this.hugo.check(dto.text, dto.language);
  }
}
