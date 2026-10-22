import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import {
  bidSchema,
  createAuctionSchema,
  grantSchema,
  listingSchema,
  type BidDto,
  type CreateAuctionDto,
  type GrantDto,
  type ListingDto,
} from "./model/schemas/usernames.schema.js";
import { UsernameAuctionsService } from "./username-auctions.service.js";
import { UsernameMarketService } from "./username-market.service.js";

// Рынок ников — раньше аукционов: market и grant — статические пути рядом с /:id.
@Controller("api/usernames/market")
@UseGuards(AuthGuard)
export class UsernameMarketController {
  public constructor(private readonly market: UsernameMarketService) {}

  @Get()
  public list(@Req() req: Request) {
    return this.market.list(req.uid!);
  }

  @Post()
  @HttpCode(200)
  public create(@Req() req: Request, @Body(new ZodValidationPipe(listingSchema)) dto: ListingDto) {
    return this.market.create(req.uid!, dto);
  }

  @Delete(":id")
  public withdraw(@Req() req: Request, @Param("id") id: string) {
    return this.market.withdraw(req.uid!, id);
  }

  @Post(":id/buy")
  @HttpCode(200)
  public buy(@Req() req: Request, @Param("id") id: string) {
    return this.market.buy(req.uid!, id);
  }
}

@Controller("api/usernames")
@UseGuards(AuthGuard)
export class UsernameAuctionsController {
  public constructor(private readonly auctions: UsernameAuctionsService) {}

  @Get()
  public list(@Req() req: Request) {
    return this.auctions.list(req.uid!);
  }

  @Post()
  @HttpCode(200)
  public create(@Req() req: Request, @Body(new ZodValidationPipe(createAuctionSchema)) dto: CreateAuctionDto) {
    return this.auctions.create(req.uid!, dto);
  }

  @Post("grant")
  @HttpCode(200)
  public grant(@Req() req: Request, @Body(new ZodValidationPipe(grantSchema)) dto: GrantDto) {
    return this.auctions.grant(req.uid!, dto);
  }

  @Post(":id/bid")
  @HttpCode(200)
  public bid(@Req() req: Request, @Param("id") id: string, @Body(new ZodValidationPipe(bidSchema)) dto: BidDto) {
    return this.auctions.bid(req.uid!, id, dto);
  }

  @Post(":id/close")
  @HttpCode(200)
  public close(@Req() req: Request, @Param("id") id: string) {
    return this.auctions.close(req.uid!, id);
  }

  @Delete(":id")
  public remove(@Req() req: Request, @Param("id") id: string) {
    return this.auctions.remove(req.uid!, id);
  }
}
