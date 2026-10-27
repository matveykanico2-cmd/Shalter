import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import {
  createPromoSchema,
  redeemPromoSchema,
  updatePromoSchema,
  type CreatePromoDto,
  type RedeemPromoDto,
  type UpdatePromoDto,
} from "./model/schemas/promotions.schema.js";
import { PromotionsService } from "./promotions.service.js";

@Controller("api/promotions")
@UseGuards(AuthGuard)
export class PromotionsController {
  public constructor(private readonly promotions: PromotionsService) {}

  @Get("admin")
  public list(@Req() req: Request) {
    return this.promotions.list(req.uid!);
  }

  @Post("admin/create")
  @HttpCode(200)
  public create(@Req() req: Request, @Body(new ZodValidationPipe(createPromoSchema)) dto: CreatePromoDto) {
    return this.promotions.create(req.uid!, dto);
  }

  @Delete("admin/:id")
  public delete(@Req() req: Request, @Param("id") id: string) {
    return this.promotions.delete(req.uid!, id);
  }

  @Patch("admin/:id")
  public update(@Req() req: Request, @Param("id") id: string, @Body(new ZodValidationPipe(updatePromoSchema)) dto: UpdatePromoDto) {
    return this.promotions.update(req.uid!, id, dto);
  }

  @Post("redeem")
  @HttpCode(200)
  public redeem(@Req() req: Request, @Body(new ZodValidationPipe(redeemPromoSchema)) dto: RedeemPromoDto) {
    return this.promotions.redeem(req.uid!, dto);
  }
}
