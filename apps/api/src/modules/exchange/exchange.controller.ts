import { Body, Controller, Get, HttpCode, Param, Post, Put, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { ExchangeService } from "./exchange.service.js";
import { convertSchema, createCoinSchema, creatorSchema, mintSchema, rateSchema, transferSchema, type ConvertDto, type CreateCoinDto, type CreatorDto, type MintDto, type RateDto, type TransferDto } from "./model/schemas/exchange.schema.js";

@Controller("api/exchange")
@UseGuards(AuthGuard)
export class ExchangeController {
  public constructor(private readonly exchange: ExchangeService) {}

  @Get()
  public list(@Req() req: Request) { return this.exchange.list(req.uid!); }

  @Post("coins")
  @HttpCode(200)
  public create(@Req() req: Request, @Body(new ZodValidationPipe(createCoinSchema)) dto: CreateCoinDto) { return this.exchange.create(req.uid!, dto); }

  @Put("coins/:id/rate")
  public rate(@Req() req: Request, @Param("id") id: string, @Body(new ZodValidationPipe(rateSchema)) dto: RateDto) { return this.exchange.setRate(req.uid!, id, dto); }

  @Get("creators")
  public creators(@Req() req: Request) { return this.exchange.creators(req.uid!); }

  @Put("creators")
  public setCreator(@Req() req: Request, @Body(new ZodValidationPipe(creatorSchema)) dto: CreatorDto) { return this.exchange.setCreator(req.uid!, dto); }

  @Get("wallet")
  public wallet(@Req() req: Request) { return this.exchange.wallet(req.uid!); }

  @Post("coins/:id/mint")
  @HttpCode(200)
  public mint(@Req() req: Request, @Param("id") id: string, @Body(new ZodValidationPipe(mintSchema)) dto: MintDto) { return this.exchange.mint(req.uid!, id, dto); }

  @Post("transfer")
  @HttpCode(200)
  public transfer(@Req() req: Request, @Body(new ZodValidationPipe(transferSchema)) dto: TransferDto) { return this.exchange.transfer(req.uid!, dto); }

  @Post("convert")
  @HttpCode(200)
  public convert(@Req() req: Request, @Body(new ZodValidationPipe(convertSchema)) dto: ConvertDto) { return this.exchange.convert(req.uid!, dto); }
}
