import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { PartnersService } from "./partners.service.js";
import {
  partnerCreateSchema,
  partnerUpdateSchema,
  type PartnerCreateDto,
  type PartnerUpdateDto,
} from "./model/schemas/partner.schema.js";

@Controller("api/partners")
@UseGuards(AuthGuard)
export class PartnersController {
  public constructor(private readonly partners: PartnersService) {}

  @Get("me")
  public me() {
    return this.partners.me();
  }

  @Post("chat")
  @HttpCode(200)
  public chat(@Req() req: Request) {
    return this.partners.chat(req.uid!);
  }

  /** Админ: список всех партнёров. */
  @Get("admin/list")
  public adminList(@Req() req: Request) {
    return this.partners.list(req.uid!);
  }

  /** Админ: создать партнёра. */
  @Post("admin/create")
  @HttpCode(200)
  public adminCreate(@Req() req: Request, @Body(new ZodValidationPipe(partnerCreateSchema)) dto: PartnerCreateDto) {
    return this.partners.create(req.uid!, dto);
  }

  /** Админ: обновить партнёра. */
  @Post("admin/update/:id")
  @HttpCode(200)
  public adminUpdate(@Req() req: Request, @Param("id") id: string, @Body(new ZodValidationPipe(partnerUpdateSchema)) dto: PartnerUpdateDto) {
    return this.partners.update(req.uid!, id, dto);
  }

  /** Админ: удалить партнёра. */
  @Delete("admin/delete/:id")
  @HttpCode(200)
  public adminDelete(@Req() req: Request, @Param("id") id: string) {
    return this.partners.delete(req.uid!, id);
  }

  /** Публично: партнёр по username. */
  @Get(":username")
  public byUsername(@Param("username") username: string) {
    return this.partners.findByUsername(username);
  }
}
