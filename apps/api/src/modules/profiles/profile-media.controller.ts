import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { AvatarsService } from "./avatars.service.js";
import {
  activeStatusSchema,
  addAvatarSchema,
  addStatusSchema,
  addTrackSchema,
  emojiAvatarSchema,
  type ActiveStatusDto,
  type AddAvatarDto,
  type AddStatusDto,
  type AddTrackDto,
  type EmojiAvatarDto,
  suggestedAvatarSchema,
  type SuggestedAvatarDto,
} from "./model/schemas/profile-media.schema.js";
import { ProfileStatusService } from "./profile-status.service.js";
import { ProfileTrackService } from "./profile-track.service.js";

// Аватарки, статусы и музыка профиля — свой профиль, у каждого свой префикс, как в server/.

@Controller("api/avatars")
@UseGuards(AuthGuard)
export class AvatarsController {
  public constructor(private readonly avatars: AvatarsService) {}

  @Get()
  public list(@Req() req: Request) {
    return this.avatars.list(req.uid!);
  }

  @Post()
  @HttpCode(200)
  public add(@Req() req: Request, @Body(new ZodValidationPipe(addAvatarSchema)) dto: AddAvatarDto) {
    return this.avatars.add(req.uid!, dto);
  }

  @Post("emoji")
  @HttpCode(200)
  public addEmoji(@Req() req: Request, @Body(new ZodValidationPipe(emojiAvatarSchema)) dto: EmojiAvatarDto) {
    return this.avatars.addEmoji(req.uid!, dto);
  }

  @Put(":index")
  @HttpCode(200)
  public replace(@Req() req: Request, @Param("index") index: string, @Body(new ZodValidationPipe(addAvatarSchema)) dto: AddAvatarDto) {
    return this.avatars.replace(req.uid!, index, dto);
  }

  @Put(":index/emoji")
  @HttpCode(200)
  public replaceEmoji(@Req() req: Request, @Param("index") index: string, @Body(new ZodValidationPipe(emojiAvatarSchema)) dto: EmojiAvatarDto) {
    return this.avatars.replaceEmoji(req.uid!, index, dto);
  }

  @Delete("emoji")
  public removeLegacyEmoji(@Req() req: Request) {
    return this.avatars.removeLegacyEmoji(req.uid!);
  }

  @Post("from-suggestion")
  @HttpCode(200)
  public fromSuggestion(@Req() req: Request, @Body(new ZodValidationPipe(suggestedAvatarSchema)) dto: SuggestedAvatarDto) {
    return this.avatars.fromSuggestion(req.uid!, dto);
  }

  @Post(":index/main")
  @HttpCode(200)
  public makeMain(@Req() req: Request, @Param("index") index: string) {
    return this.avatars.makeMain(req.uid!, index);
  }

  @Delete(":index")
  public remove(@Req() req: Request, @Param("index") index: string) {
    return this.avatars.remove(req.uid!, index);
  }
}

@Controller("api/status-catalog")
@UseGuards(AuthGuard)
export class StatusCatalogController {
  public constructor(private readonly statuses: ProfileStatusService) {}

  @Get()
  public list() {
    return this.statuses.listCatalog();
  }
}

@Controller("api/status")
@UseGuards(AuthGuard)
export class ProfileStatusController {
  public constructor(private readonly statuses: ProfileStatusService) {}

  @Get("me")
  public mine(@Req() req: Request) {
    return this.statuses.mine(req.uid!);
  }

  @Post("me")
  @HttpCode(200)
  public add(@Req() req: Request, @Body(new ZodValidationPipe(addStatusSchema)) dto: AddStatusDto) {
    return this.statuses.add(req.uid!, dto);
  }

  @Post("me/active")
  @HttpCode(200)
  public setActive(@Req() req: Request, @Body(new ZodValidationPipe(activeStatusSchema)) dto: ActiveStatusDto) {
    return this.statuses.setActive(req.uid!, dto);
  }

  @Delete("me/:id")
  public remove(@Req() req: Request, @Param("id") id: string) {
    return this.statuses.remove(req.uid!, id);
  }
}

@Controller("api/profile-track")
@UseGuards(AuthGuard)
export class ProfileTrackController {
  public constructor(private readonly tracks: ProfileTrackService) {}

  @Post()
  @HttpCode(200)
  public add(@Req() req: Request, @Body(new ZodValidationPipe(addTrackSchema)) dto: AddTrackDto) {
    return this.tracks.add(req.uid!, dto);
  }

  @Post(":index/main")
  @HttpCode(200)
  public makeMain(@Req() req: Request, @Param("index") index: string) {
    return this.tracks.makeMain(req.uid!, index);
  }

  @Delete(":index")
  public remove(@Req() req: Request, @Param("index") index: string) {
    return this.tracks.remove(req.uid!, index);
  }

  @Delete()
  public removeAll(@Req() req: Request) {
    return this.tracks.removeAll(req.uid!);
  }
}
