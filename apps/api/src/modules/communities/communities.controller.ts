import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { CommunitiesService } from "./communities.service.js";
import { CommunityAdminsService } from "./community-admins.service.js";
import { CommunityChatsService } from "./community-chats.service.js";
import {
  addChatSchema,
  adminBadgeTitleSchema,
  adminRightsSchema,
  chatVisibleSchema,
  createCommunitySchema,
  decideRequestSchema,
  membersQuerySchema,
  muteSchema,
  patchCommunitySchema,
  prefsSchema,
  type AddChatDto,
  type AdminBadgeTitleDto,
  type AdminRightsDto,
  type ChatVisibleDto,
  type CreateCommunityDto,
  type DecideRequestDto,
  type MembersQuery,
  type MuteDto,
  type PatchCommunityDto,
  type PrefsDto,
} from "./model/schemas/community.schema.js";

@Controller("api/communities")
@UseGuards(AuthGuard)
export class CommunitiesController {
  public constructor(
    private readonly communities: CommunitiesService,
    private readonly chats: CommunityChatsService,
    private readonly admins: CommunityAdminsService,
  ) {}

  @Get("mine")
  public mine(@Req() req: Request) {
    return this.communities.mine(req.uid!);
  }

  @Get("joined")
  public joined(@Req() req: Request) {
    return this.communities.joined(req.uid!);
  }

  @Get("by-chat/:chatId")
  public byChat(@Req() req: Request, @Param("chatId") chatId: string) {
    return this.communities.byChat(req.uid!, chatId);
  }

  @Post()
  @HttpCode(200)
  public create(@Req() req: Request, @Body(new ZodValidationPipe(createCommunitySchema)) dto: CreateCommunityDto) {
    return this.communities.create(req.uid!, dto);
  }

  @Get(":id")
  public get(@Req() req: Request, @Param("id") id: string) {
    return this.communities.get(req.uid!, id);
  }

  @Patch(":id")
  public patch(@Req() req: Request, @Param("id") id: string, @Body(new ZodValidationPipe(patchCommunitySchema)) dto: PatchCommunityDto) {
    return this.communities.patch(req.uid!, id, dto);
  }

  @Delete(":id")
  public delete(@Req() req: Request, @Param("id") id: string) {
    return this.communities.delete(req.uid!, id);
  }

  @Post(":id/join")
  @HttpCode(200)
  public join(@Req() req: Request, @Param("id") id: string) {
    return this.communities.join(req.uid!, id);
  }

  @Post(":id/leave")
  @HttpCode(200)
  public leave(@Req() req: Request, @Param("id") id: string) {
    return this.communities.leave(req.uid!, id);
  }

  @Post(":id/prefs")
  @HttpCode(200)
  public prefs(@Req() req: Request, @Param("id") id: string, @Body(new ZodValidationPipe(prefsSchema)) dto: PrefsDto) {
    return this.communities.setPrefs(req.uid!, id, dto);
  }

  @Post(":id/mute")
  @HttpCode(200)
  public mute(@Req() req: Request, @Param("id") id: string, @Body(new ZodValidationPipe(muteSchema)) dto: MuteDto) {
    return this.communities.mute(req.uid!, id, dto);
  }

  @Post(":id/read")
  @HttpCode(200)
  public read(@Req() req: Request, @Param("id") id: string) {
    return this.communities.read(req.uid!, id);
  }

  @Get(":id/members")
  public members(@Req() req: Request, @Param("id") id: string, @Query(new ZodValidationPipe(membersQuerySchema)) query: MembersQuery) {
    return this.communities.members(req.uid!, id, query);
  }

  @Post(":id/chats")
  @HttpCode(200)
  public addChat(@Req() req: Request, @Param("id") id: string, @Body(new ZodValidationPipe(addChatSchema)) dto: AddChatDto) {
    return this.chats.add(req.uid!, id, dto);
  }

  @Patch(":id/chats/:chatId")
  public setChatVisible(
    @Req() req: Request,
    @Param("id") id: string,
    @Param("chatId") chatId: string,
    @Body(new ZodValidationPipe(chatVisibleSchema)) dto: ChatVisibleDto,
  ) {
    return this.chats.setVisible(req.uid!, id, chatId, dto);
  }

  @Delete(":id/chats/:chatId")
  public removeChat(@Req() req: Request, @Param("id") id: string, @Param("chatId") chatId: string) {
    return this.chats.remove(req.uid!, id, chatId);
  }

  @Get(":id/requests")
  public requests(@Req() req: Request, @Param("id") id: string) {
    return this.chats.listRequests(req.uid!, id);
  }

  @Post(":id/requests/:requestId")
  @HttpCode(200)
  public decide(
    @Req() req: Request,
    @Param("id") id: string,
    @Param("requestId") requestId: string,
    @Body(new ZodValidationPipe(decideRequestSchema)) dto: DecideRequestDto,
  ) {
    return this.chats.decide(req.uid!, id, requestId, dto);
  }

  @Get(":id/admins")
  public listAdmins(@Req() req: Request, @Param("id") id: string) {
    return this.admins.listAdmins(req.uid!, id);
  }

  @Put(":id/admins/:userId")
  public setAdmin(@Req() req: Request, @Param("id") id: string, @Param("userId") userId: string, @Body(new ZodValidationPipe(adminRightsSchema)) dto: AdminRightsDto) {
    return this.admins.setAdmin(req.uid!, id, userId, dto);
  }

  @Delete(":id/admins/:userId")
  public removeAdmin(@Req() req: Request, @Param("id") id: string, @Param("userId") userId: string) {
    return this.admins.removeAdmin(req.uid!, id, userId);
  }

  @Put(":id/admins/:userId/badge-title")
  @HttpCode(200)
  public setAdminBadgeTitle(
    @Req() req: Request,
    @Param("id") id: string,
    @Param("userId") userId: string,
    @Body(new ZodValidationPipe(adminBadgeTitleSchema)) dto: AdminBadgeTitleDto
  ) {
    return this.admins.setBadgeTitle(req.uid!, id, userId, dto);
  }

  @Get(":id/bans")
  public listBans(@Req() req: Request, @Param("id") id: string) {
    return this.admins.listBans(req.uid!, id);
  }

  @Get(":id/bans/:userId/preview")
  public banPreview(@Req() req: Request, @Param("id") id: string, @Param("userId") userId: string) {
    return this.admins.banPreview(req.uid!, id, userId);
  }

  @Put(":id/bans/:userId")
  public ban(@Req() req: Request, @Param("id") id: string, @Param("userId") userId: string) {
    return this.admins.ban(req.uid!, id, userId);
  }

  @Delete(":id/bans/:userId")
  public unban(@Req() req: Request, @Param("id") id: string, @Param("userId") userId: string) {
    return this.admins.unban(req.uid!, id, userId);
  }
}
