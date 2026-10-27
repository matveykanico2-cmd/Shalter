import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import {
  subscribeNativeSchema,
  subscribeSchema,
  unsubscribeSchema,
  type SubscribeDto,
  type SubscribeNativeDto,
  type UnsubscribeDto,
} from "./model/schemas/push.schema.js";
import { PushService } from "./push.service.js";

// Уведомления (/api/push). Открытый ключ — без входа.
@Controller("api/push")
export class PushController {
  public constructor(private readonly push: PushService) {}

  @Get("vapid-public-key")
  public publicKey() {
    return this.push.publicKey();
  }

  @Post("subscribe")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  public subscribe(@Req() req: Request, @Body(new ZodValidationPipe(subscribeSchema)) dto: SubscribeDto) {
    return this.push.subscribe(req.uid!, dto);
  }

  @Post("subscribe-native")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  public subscribeNative(@Req() req: Request, @Body(new ZodValidationPipe(subscribeNativeSchema)) dto: SubscribeNativeDto) {
    return this.push.subscribeNative(req.uid!, dto);
  }

  @Post("unsubscribe")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  public unsubscribe(@Req() req: Request, @Body(new ZodValidationPipe(unsubscribeSchema)) dto: UnsubscribeDto) {
    return this.push.unsubscribe(req.uid!, dto);
  }

  @Get("endpoints")
  @UseGuards(AuthGuard)
  public endpoints(@Req() req: Request) {
    return this.push.endpoints(req.uid!);
  }
}
