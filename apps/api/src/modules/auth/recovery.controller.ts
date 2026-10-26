import { Body, Controller, HttpCode, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import {
  pairCheckSchema,
  pairResetSchema,
  phoneResetSchema,
  phoneStartSchema,
  type PairCheckDto,
  type PairResetDto,
  type PhoneResetDto,
  type PhoneStartDto,
} from "./model/schemas/recovery.schema.js";
import { RecoveryService } from "./recovery.service.js";

// Восстановление доступа без пароля.
@Controller("api/auth/recover")
export class RecoveryController {
  public constructor(private readonly recovery: RecoveryService) {}

  @Post("pair/check")
  @HttpCode(200)
  public checkPair(@Body(new ZodValidationPipe(pairCheckSchema)) dto: PairCheckDto) {
    return this.recovery.checkPair(dto);
  }

  @Post("pair/reset")
  @HttpCode(200)
  public resetByPair(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body(new ZodValidationPipe(pairResetSchema)) dto: PairResetDto) {
    return this.recovery.resetByPair(req, res, dto);
  }

  @Post("phone/start")
  @HttpCode(200)
  public startByPhone(@Body(new ZodValidationPipe(phoneStartSchema)) dto: PhoneStartDto) {
    return this.recovery.startByPhone(dto.phone);
  }

  @Post("phone/verify")
  @HttpCode(200)
  public resetByPhone(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body(new ZodValidationPipe(phoneResetSchema)) dto: PhoneResetDto) {
    return this.recovery.resetByPhone(req, res, dto);
  }
}
