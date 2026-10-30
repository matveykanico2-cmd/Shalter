import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { CustomEmojiService } from "./custom-emoji.service.js";
import { StickerPacksService } from "./sticker-packs.service.js";
import {
  addStickerSchema,
  createEmojiSchema,
  createPackSchema,
  packIdParam,
  patchEmojiSchema,
  patchPackSchema,
  stickerIdParam,
  type AddStickerDto,
  type CreateEmojiDto,
  type CreatePackDto,
  type PatchEmojiDto,
  type PatchPackDto,
  type UpdateStickerDto,
} from "./model/schemas/stickers.schema.js";
import { updateStickerSchema } from "./model/schemas/stickers.schema.js";

// Свои стикерпаки (/api/stickers/packs) и каталог своих эмодзи (/api/custom-emoji).
@Controller("api/stickers/packs")
@UseGuards(AuthGuard)
export class StickerPacksController {
  public constructor(private readonly packs: StickerPacksService) {}

  /** Список паков пользователя (свои + добавленные в коллекцию) с is_added и sticker_count. */
  @Get()
  public list(@Req() req: Request) {
    return this.packs.list(req.uid!);
  }

  /** Один пак со стикерами, sticker_count и is_added. */
  @Get(":id")
  public get(@Req() req: Request, @Param("id", new ZodValidationPipe(packIdParam)) id: string) {
    return this.packs.get(req.uid!, id);
  }

  /** Создать пак (название, опциональное описание). */
  @Post()
  @HttpCode(200)
  public create(@Req() req: Request, @Body(new ZodValidationPipe(createPackSchema)) dto: CreatePackDto) {
    return this.packs.create(req.uid!, dto);
  }

  /** Обновить название и/или описание пака. Только владелец. */
  @Patch(":id")
  public update(
    @Req() req: Request,
    @Param("id", new ZodValidationPipe(packIdParam)) id: string,
    @Body(new ZodValidationPipe(patchPackSchema)) dto: PatchPackDto
  ) {
    return this.packs.update(req.uid!, id, dto);
  }

  /** Удалить пак. Только владелец. */
  @Delete(":id")
  public remove(@Req() req: Request, @Param("id", new ZodValidationPipe(packIdParam)) id: string) {
    return this.packs.remove(req.uid!, id);
  }

  /** Добавить стикер в пак (файл уже загружен через /api/uploads). Только владелец. */
  @Post(":id/stickers")
  @HttpCode(200)
  public addSticker(
    @Req() req: Request,
    @Param("id", new ZodValidationPipe(packIdParam)) id: string,
    @Body(new ZodValidationPipe(addStickerSchema)) dto: AddStickerDto
  ) {
    return this.packs.addSticker(req.uid!, id, dto);
  }

  /** Изменить эмодзи и/или порядок стикера. Только владелец. */
  @Patch(":id/stickers/:stickerId")
  public updateSticker(
    @Req() req: Request,
    @Param("id", new ZodValidationPipe(packIdParam)) id: string,
    @Param("stickerId", new ZodValidationPipe(stickerIdParam)) stickerId: string,
    @Body(new ZodValidationPipe(updateStickerSchema)) dto: UpdateStickerDto
  ) {
    return this.packs.updateSticker(req.uid!, id, stickerId, dto);
  }

  /** Удалить стикер из пака. Только владелец. */
  @Delete(":id/stickers/:stickerId")
  public removeSticker(
    @Req() req: Request,
    @Param("id", new ZodValidationPipe(packIdParam)) id: string,
    @Param("stickerId", new ZodValidationPipe(stickerIdParam)) stickerId: string
  ) {
    return this.packs.removeSticker(req.uid!, id, stickerId);
  }

  /** Добавить пак в коллекцию пользователя. */
  @Post(":id/collection")
  @HttpCode(200)
  public addToCollection(@Req() req: Request, @Param("id", new ZodValidationPipe(packIdParam)) id: string) {
    return this.packs.addToCollection(req.uid!, id);
  }

  /** Убрать пак из коллекции пользователя. */
  @Delete(":id/collection")
  @HttpCode(200)
  public removeFromCollection(@Req() req: Request, @Param("id", new ZodValidationPipe(packIdParam)) id: string) {
    return this.packs.removeFromCollection(req.uid!, id);
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
