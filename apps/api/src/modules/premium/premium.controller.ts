import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { BusinessService } from "./business.service.js";
import {
  grantBusinessSchema,
  grantPremiumSchema,
  planSchema,
  type GrantBusinessDto,
  type GrantPremiumDto,
  type PlanDto,
} from "./model/schemas/premium.schema.js";
import { PremiumService } from "./premium.service.js";

@Controller("api/premium")
@UseGuards(AuthGuard)
export class PremiumController {
  public constructor(private readonly premium: PremiumService) {}

  @Get("me")
  public me(@Req() req: Request) {
    return this.premium.me(req.uid!);
  }

  @Post("buy-with-stars")
  @HttpCode(200)
  public buyWithStars(@Req() req: Request, @Body(new ZodValidationPipe(planSchema)) dto: PlanDto) {
    return this.premium.buyWithStars(req.uid!, dto);
  }

  @Post("request")
  @HttpCode(200)
  public request(@Req() req: Request, @Body(new ZodValidationPipe(planSchema)) dto: PlanDto) {
    return this.premium.request(req.uid!, dto);
  }

  @Post("grant")
  @HttpCode(200)
  public grant(@Req() req: Request, @Body(new ZodValidationPipe(grantPremiumSchema)) dto: GrantPremiumDto) {
    return this.premium.grant(req.uid!, dto);
  }
}

@Controller("api/business")
@UseGuards(AuthGuard)
export class BusinessController {
  public constructor(private readonly business: BusinessService) {}

  @Get("me")
  public me(@Req() req: Request) {
    return this.business.me(req.uid!);
  }

  @Post("request")
  @HttpCode(200)
  public request(@Req() req: Request, @Body(new ZodValidationPipe(planSchema)) dto: PlanDto) {
    return this.business.request(req.uid!, dto);
  }

  @Post("grant")
  @HttpCode(200)
  public grant(@Req() req: Request, @Body(new ZodValidationPipe(grantBusinessSchema)) dto: GrantBusinessDto) {
    return this.business.grant(req.uid!, dto);
  }
}
