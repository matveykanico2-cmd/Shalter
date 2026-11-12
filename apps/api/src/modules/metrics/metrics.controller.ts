import { Body, Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { MetricsService } from "./metrics.service.js";
import { timingSchema, type TimingDto } from "./model/schemas/metrics.schema.js";

// Замеры скорости клиента (/api/metrics). Только со входом — чтобы лог не засоряли снаружи.
@Controller("api/metrics")
export class MetricsController {
  public constructor(private readonly metrics: MetricsService) {}

  @Post("timing")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  public timing(@Body(new ZodValidationPipe(timingSchema)) dto: TimingDto) {
    return this.metrics.record(dto);
  }
}
