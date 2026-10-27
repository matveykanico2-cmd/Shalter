import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { CustomEmojiService } from "./custom-emoji.service.js";
import {
  createEmojiSchema,
  createPackSchema,
  patchEmojiSchema,
  patchPackSchema,
  type CreateEmojiDto,
  type CreatePackDto,
  type PatchEmojiDto,
  type PatchPackDto,
} from "./model/schemas/stickers.schema.js";
import { StickerPacksService } from "./sticker-packs.service.js";

@Controller("api/stickers/packs")
@UseGuards(AuthGuard)
export class StickerPacksController {
  public constructor(private readonly packs: StickerPacksService) {}

  @Get()
  public list(@Req() req: Request) {
    return this.packs.list(req.uid!);
  }

  @Post()
  @HttpCode(200)
  public create(@Req() req: Request, @Body(new ZodValidationPipe(createPackSchema)) dto: CreatePackDto) {
    return this.packs.create(req.uid!, dto);
  }

  @Patch(":id")
  public update(@Req() req: Request, @Param("id") id: string, @Body(new ZodValidationPipe(patchPackSchema)) dto: PatchPackDto) {
    return this.packs.update(req.uid!, id, dto);
  }

  @Delete(":id")
  public remove(@Req() req: Request, @Param("id") id: string) {
    return this.packs.remove(req.uid!, id);
  }
}

@Controller("api/custom-emoji")
@UseGuards(AuthGuard)
export class CustomEmojiController {
  public constructor(private readonly emoji: CustomEmojiService) {}

  @Get()
  public list() {
    return this.emoji.list();
  }

  @Post()
  @HttpCode(200)
  public create(@Req() req: Request, @Body(new ZodValidationPipe(createEmojiSchema)) dto: CreateEmojiDto) {
    return this.emoji.create(req.uid!, dto);
  }

  @Patch(":id")
  public update(@Req() req: Request, @Param("id") id: string, @Body(new ZodValidationPipe(patchEmojiSchema)) dto: PatchEmojiDto) {
    return this.emoji.update(req.uid!, id, dto);
  }

  @Delete(":id")
  public remove(@Req() req: Request, @Param("id") id: string) {
    return this.emoji.remove(req.uid!, id);
  }
}
