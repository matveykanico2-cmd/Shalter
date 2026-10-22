import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { GiftCatalogAdminService } from "./gift-catalog-admin.service.js";
import { GiftsService } from "./gifts.service.js";
import {
  catalogGiftSchema,
  pinGiftSchema,
  sceneSchema,
  sendGiftSchema,
  supplySchema,
  userGiftSchema,
  type CatalogGiftDto,
  type PinGiftDto,
  type SceneDto,
  type SendGiftDto,
  type SupplyDto,
  type UserGiftDto,
} from "./model/schemas/gift.schema.js";

@Controller("api/gifts")
@UseGuards(AuthGuard)
export class GiftsController {
  public constructor(
    private readonly gifts: GiftsService,
    private readonly admin: GiftCatalogAdminService,
  ) {}

  @Get()
  public list(@Req() req: Request) {
    return this.gifts.list(req.uid!);
  }

  @Post("request")
  @HttpCode(200)
  public request(@Req() req: Request, @Body(new ZodValidationPipe(sendGiftSchema)) dto: SendGiftDto) {
    return this.gifts.request(req.uid!, dto);
  }

  @Post("deliver")
  @HttpCode(200)
  public deliver(@Req() req: Request, @Body(new ZodValidationPipe(sendGiftSchema)) dto: SendGiftDto) {
    return this.gifts.deliver(req.uid!, dto);
  }

  @Post("buy")
  @HttpCode(200)
  public buy(@Req() req: Request, @Body(new ZodValidationPipe(sendGiftSchema)) dto: SendGiftDto) {
    return this.gifts.buy(req.uid!, dto);
  }

  @Post("received/:entryId/convert")
  @HttpCode(200)
  public convert(@Req() req: Request, @Param("entryId") entryId: string) {
    return this.gifts.convert(req.uid!, entryId);
  }

  @Delete("received/:entryId")
  public removeReceived(@Req() req: Request, @Param("entryId") entryId: string) {
    return this.gifts.remove(req.uid!, entryId);
  }

  @Post("received/:entryId/pin")
  @HttpCode(200)
  public pin(@Req() req: Request, @Param("entryId") entryId: string, @Body(new ZodValidationPipe(pinGiftSchema)) dto: PinGiftDto) {
    return this.gifts.pin(req.uid!, entryId, dto);
  }

  @Get("catalog")
  public catalog(@Req() req: Request) {
    return this.admin.list(req.uid!);
  }

  @Post("catalog/:id/supply")
  @HttpCode(200)
  public setSupply(@Req() req: Request, @Param("id") id: string, @Body(new ZodValidationPipe(supplySchema)) dto: SupplyDto) {
    return this.admin.setSupply(req.uid!, id, dto);
  }

  @Post("catalog/:id/scene")
  @HttpCode(200)
  public setScene(@Req() req: Request, @Param("id") id: string, @Body(new ZodValidationPipe(sceneSchema)) dto: SceneDto) {
    return this.admin.setScene(req.uid!, id, dto);
  }

  @Post("catalog")
  @HttpCode(200)
  public createCatalogGift(@Req() req: Request, @Body(new ZodValidationPipe(catalogGiftSchema)) dto: CatalogGiftDto) {
    return this.admin.create(req.uid!, dto);
  }

  @Delete("catalog/:id")
  public removeCatalogGift(@Req() req: Request, @Param("id") id: string) {
    return this.admin.remove(req.uid!, id);
  }

  @Post("catalog/:id/restore")
  @HttpCode(200)
  public restoreCatalogGift(@Req() req: Request, @Param("id") id: string) {
    return this.admin.restore(req.uid!, id);
  }

  @Get("custom")
  public listCustom(@Req() req: Request) {
    return this.gifts.listCustom(req.uid!);
  }

  @Post("custom/send")
  @HttpCode(200)
  public sendCustom(@Req() req: Request, @Body(new ZodValidationPipe(sendGiftSchema)) dto: SendGiftDto) {
    return this.gifts.sendCustom(req.uid!, dto);
  }

  @Post("custom")
  @HttpCode(200)
  public createCustom(@Req() req: Request, @Body(new ZodValidationPipe(userGiftSchema)) dto: UserGiftDto) {
    return this.gifts.createCustom(req.uid!, dto);
  }

  @Patch("custom/:id")
  public patchCustom(@Req() req: Request, @Param("id") id: string, @Body(new ZodValidationPipe(userGiftSchema)) dto: UserGiftDto) {
    return this.gifts.patchCustom(req.uid!, id, dto);
  }

  @Delete("custom/:id")
  public deleteCustom(@Req() req: Request, @Param("id") id: string) {
    return this.gifts.deleteCustom(req.uid!, id);
  }
}
