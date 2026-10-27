import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import {
  messagePriceSchema,
  starsGrantSchema,
  starsRequestSchema,
  starsTransferSchema,
  type MessagePriceDto,
  type StarsGrantDto,
  type StarsRequestDto,
  type StarsTransferDto,
} from "./model/schemas/stars.schema.js";
import { StarsService } from "./stars.service.js";

// Звёзды (/api/stars).
@Controller("api/stars")
@UseGuards(AuthGuard)
export class StarsController {
  public constructor(private readonly stars: StarsService) {}

  @Get()
  public overview(@Req() req: Request) {
    return this.stars.overview(req.uid!);
  }

  @Post("request")
  @HttpCode(200)
  public request(@Req() req: Request, @Body(new ZodValidationPipe(starsRequestSchema)) dto: StarsRequestDto) {
    return this.stars.request(req.uid!, dto);
  }

  @Post("grant")
  @HttpCode(200)
  public grant(@Req() req: Request, @Body(new ZodValidationPipe(starsGrantSchema)) dto: StarsGrantDto) {
    return this.stars.grant(req.uid!, dto);
  }

  @Post("price")
  @HttpCode(200)
  public setMessagePrice(@Req() req: Request, @Body(new ZodValidationPipe(messagePriceSchema)) dto: MessagePriceDto) {
    return this.stars.setMessagePrice(req.uid!, dto);
  }

  @Post("boost/:messageId")
  @HttpCode(200)
  public boost(@Req() req: Request, @Param("messageId") messageId: string) {
    return this.stars.boost(req.uid!, messageId);
  }

  @Post("delete/:messageId")
  @HttpCode(200)
  public delete(@Req() req: Request, @Param("messageId") messageId: string) {
    return this.stars.delete(req.uid!, messageId);
  }

  @Post("transfer")
  @HttpCode(200)
  public transfer(@Req() req: Request, @Body(new ZodValidationPipe(starsTransferSchema)) dto: StarsTransferDto) {
    return this.stars.transfer(req.uid!, dto);
  }
}
