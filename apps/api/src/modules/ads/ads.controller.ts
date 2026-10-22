import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { AdCampaignsService } from "./ad-campaigns.service.js";
import { AdReviewService } from "./ad-review.service.js";
import { AdsCabinetService } from "./ads-cabinet.service.js";
import {
  adContentSchema,
  budgetSchema,
  campaignSchema,
  campaignStatusSchema,
  grantAdsSchema,
  reviewSchema,
  serveQuerySchema,
  type AdContentDto,
  type BudgetDto,
  type CampaignDto,
  type CampaignStatusDto,
  type GrantAdsDto,
  type ReviewDto,
  type ServeQuery,
} from "./model/schemas/ads.schema.js";

@Controller("api/ads")
@UseGuards(AuthGuard)
export class AdsController {
  public constructor(
    private readonly cabinet: AdsCabinetService,
    private readonly campaigns: AdCampaignsService,
    private readonly review: AdReviewService,
  ) {}

  @Get("me")
  public me(@Req() req: Request) {
    return this.cabinet.me(req.uid!);
  }

  @Post("request")
  @HttpCode(200)
  public request(@Req() req: Request) {
    return this.cabinet.request(req.uid!);
  }

  @Put("content")
  public setContent(@Req() req: Request, @Body(new ZodValidationPipe(adContentSchema)) dto: AdContentDto) {
    return this.cabinet.setContent(req.uid!, dto);
  }

  @Post("grant")
  @HttpCode(200)
  public grant(@Req() req: Request, @Body(new ZodValidationPipe(grantAdsSchema)) dto: GrantAdsDto) {
    return this.cabinet.grant(req.uid!, dto);
  }

  @Get("campaigns")
  public list(@Req() req: Request) {
    return this.campaigns.list(req.uid!);
  }

  @Post("campaigns")
  @HttpCode(200)
  public create(@Req() req: Request, @Body(new ZodValidationPipe(campaignSchema)) dto: CampaignDto) {
    return this.campaigns.create(req.uid!, dto);
  }

  @Patch("campaigns/:id")
  public patch(@Req() req: Request, @Param("id") id: string, @Body(new ZodValidationPipe(campaignSchema)) dto: CampaignDto) {
    return this.campaigns.patch(req.uid!, id, dto);
  }

  @Delete("campaigns/:id")
  public delete(@Req() req: Request, @Param("id") id: string) {
    return this.campaigns.delete(req.uid!, id);
  }

  @Post("campaigns/:id/budget")
  @HttpCode(200)
  public addBudget(@Req() req: Request, @Param("id") id: string, @Body(new ZodValidationPipe(budgetSchema)) dto: BudgetDto) {
    return this.campaigns.addBudget(req.uid!, id, dto);
  }

  @Post("campaigns/:id/status")
  @HttpCode(200)
  public setStatus(@Req() req: Request, @Param("id") id: string, @Body(new ZodValidationPipe(campaignStatusSchema)) dto: CampaignStatusDto) {
    return this.campaigns.setStatus(req.uid!, id, dto);
  }

  @Get("campaigns/:id/stats")
  public stats(@Req() req: Request, @Param("id") id: string) {
    return this.campaigns.stats(req.uid!, id);
  }

  @Get("serve")
  public serve(@Req() req: Request, @Query(new ZodValidationPipe(serveQuerySchema)) query: ServeQuery) {
    return this.campaigns.serve(req.uid!, query);
  }

  @Post("click/:id")
  @HttpCode(200)
  public click(@Req() req: Request, @Param("id") id: string) {
    return this.campaigns.click(req.uid!, id);
  }

  @Get("review")
  public reviewList(@Req() req: Request) {
    return this.review.list(req.uid!);
  }

  @Post("review/:id")
  @HttpCode(200)
  public decide(@Req() req: Request, @Param("id") id: string, @Body(new ZodValidationPipe(reviewSchema)) dto: ReviewDto) {
    return this.review.decide(req.uid!, id, dto);
  }
}
