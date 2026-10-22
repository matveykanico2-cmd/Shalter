import { Body, Controller, Delete, Get, HttpCode, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { GeoService } from "./geo.service.js";
import { coordsSchema, type CoordsDto } from "./model/schemas/nearby.schema.js";
import { NearbyService } from "./nearby.service.js";

@Controller("api/nearby")
@UseGuards(AuthGuard)
export class NearbyController {
  public constructor(private readonly nearby: NearbyService) {}

  @Post()
  @HttpCode(200)
  public share(@Req() req: Request, @Body(new ZodValidationPipe(coordsSchema)) dto: CoordsDto) {
    return this.nearby.share(req.uid!, dto.lat, dto.lng);
  }

  @Get()
  public look(@Req() req: Request, @Query("lat") lat: unknown, @Query("lng") lng: unknown) {
    return this.nearby.look(req.uid!, lat, lng);
  }

  @Delete()
  public hide(@Req() req: Request) {
    return this.nearby.hide(req.uid!);
  }
}

@Controller("api/geo")
@UseGuards(AuthGuard)
export class GeoController {
  public constructor(private readonly geo: GeoService) {}

  @Get("ip")
  public byIp(@Req() req: Request) {
    return this.geo.byIp(req.ip);
  }

  @Get("search")
  public search(@Query("q") q: unknown) {
    return this.geo.search(q);
  }
}
