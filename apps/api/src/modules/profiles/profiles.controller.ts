import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import {
  blockSchema,
  patchProfileSchema,
  pinnedChannelsSchema,
  type BlockDto,
  type PatchProfileDto,
  type PinnedChannelsDto,
} from "./model/schemas/profile.schema.js";
import { ProfileEditService } from "./profile-edit.service.js";
import { ProfilesService } from "./profiles.service.js";

// Профили пользователей (/api/users). blocked и by-username/… — раньше /:id.
@Controller("api/users")
@UseGuards(AuthGuard)
export class ProfilesController {
  public constructor(
    private readonly profiles: ProfilesService,
    private readonly edit: ProfileEditService
  ) {}

  @Get("blocked")
  public blocked(@Req() req: Request) {
    return this.profiles.blocked(req.uid!);
  }

  @Get("by-username/:username")
  public byUsername(@Req() req: Request, @Param("username") username: string) {
    return this.profiles.byUsername(req.uid!, username);
  }

  @Get("me/pinnable-channels")
  public pinnableChannels(@Req() req: Request) {
    return this.profiles.pinnableChannels(req.uid!);
  }

  @Put("me/pinned-channels")
  public setPinnedChannels(@Req() req: Request, @Body(new ZodValidationPipe(pinnedChannelsSchema)) dto: PinnedChannelsDto) {
    return this.profiles.setPinnedChannels(req.uid!, dto);
  }

  @Get(":id")
  public profile(@Req() req: Request, @Param("id") id: string) {
    return this.profiles.profile(req.uid!, id);
  }

  @Get(":id/shared-media")
  public sharedMedia(@Req() req: Request, @Param("id") id: string) {
    return this.profiles.sharedMedia(req.uid!, id);
  }

  @Get(":id/common-chats")
  public commonChats(@Req() req: Request, @Param("id") id: string) {
    return this.profiles.commonChats(req.uid!, id);
  }

  @Patch(":id")
  public update(@Req() req: Request, @Param("id") id: string, @Body(new ZodValidationPipe(patchProfileSchema)) dto: PatchProfileDto) {
    return this.edit.update(req.uid!, id, dto);
  }

  @Post(":id/block")
  @HttpCode(200)
  public block(@Req() req: Request, @Param("id") id: string, @Body(new ZodValidationPipe(blockSchema)) dto: BlockDto) {
    return this.edit.block(req.uid!, id, dto);
  }
}
