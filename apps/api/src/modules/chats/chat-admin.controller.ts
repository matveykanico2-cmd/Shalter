import { Body, Controller, Get, HttpCode, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { ChatAdminService } from "./chat-admin.service.js";
import { CurrentChat, MemberChatGuard } from "./guards/member-chat.guard.js";
import { SecretChatGuard } from "./guards/secret-chat.guard.js";
import type { Chat } from "./model/domain.js";
import {
  adminLogQuerySchema,
  chatSettingsSchema,
  commentPriceSchema,
  discussionSchema,
  permissionsSchema,
  publicSchema,
  reactionsSchema,
  slowModeSchema,
  welcomeSchema,
  type AdminLogQueryDto,
  type ChatSettingsDto,
  type CommentPriceDto,
  type DiscussionDto,
  type PermissionsDto,
  type PublicDto,
  type ReactionsDto,
  type SlowModeDto,
  type WelcomeDto,
} from "./model/schemas/chat-admin.schema.js";

// Настройки группы или канала для владельцев и админов, заблокированные, журнал действий.
@Controller("api/chats/:id")
@UseGuards(AuthGuard, SecretChatGuard, MemberChatGuard)
export class ChatAdminController {
  public constructor(private readonly admin: ChatAdminService) {}

  @Get("banned")
  public banned(@Req() req: Request, @CurrentChat() chat: Chat) {
    return this.admin.banned(req.uid!, chat);
  }

  @Post("public")
  @HttpCode(200)
  public setPublic(@Req() req: Request, @CurrentChat() chat: Chat, @Body(new ZodValidationPipe(publicSchema)) dto: PublicDto) {
    return this.admin.setPublic(req.uid!, chat, dto);
  }

  @Post("settings")
  @HttpCode(200)
  public settings(@Req() req: Request, @CurrentChat() chat: Chat, @Body(new ZodValidationPipe(chatSettingsSchema)) dto: ChatSettingsDto) {
    return this.admin.updateSettings(req.uid!, chat, dto);
  }

  @Get("permissions")
  public permissions(@CurrentChat() chat: Chat) {
    return this.admin.permissions(chat);
  }

  @Post("permissions")
  @HttpCode(200)
  public setPermissions(@Req() req: Request, @CurrentChat() chat: Chat, @Body(new ZodValidationPipe(permissionsSchema)) dto: PermissionsDto) {
    return this.admin.setPermissions(req.uid!, chat, dto.permissions);
  }

  @Post("reactions")
  @HttpCode(200)
  public reactions(@Req() req: Request, @CurrentChat() chat: Chat, @Body(new ZodValidationPipe(reactionsSchema)) dto: ReactionsDto) {
    return this.admin.setReactions(req.uid!, chat, dto.reactions);
  }

  @Post("discussion")
  @HttpCode(200)
  public discussion(@Req() req: Request, @CurrentChat() chat: Chat, @Body(new ZodValidationPipe(discussionSchema)) dto: DiscussionDto) {
    return this.admin.discussion(req.uid!, chat, dto);
  }

  @Post("slow-mode")
  @HttpCode(200)
  public slowMode(@Req() req: Request, @CurrentChat() chat: Chat, @Body(new ZodValidationPipe(slowModeSchema)) dto: SlowModeDto) {
    return this.admin.setSlowMode(req.uid!, chat, dto.seconds);
  }

  @Post("comment-price")
  @HttpCode(200)
  public commentPrice(@Req() req: Request, @CurrentChat() chat: Chat, @Body(new ZodValidationPipe(commentPriceSchema)) dto: CommentPriceDto) {
    return this.admin.setCommentPrice(req.uid!, chat, dto.stars);
  }

  @Post("welcome")
  @HttpCode(200)
  public welcome(@Req() req: Request, @CurrentChat() chat: Chat, @Body(new ZodValidationPipe(welcomeSchema)) dto: WelcomeDto) {
    return this.admin.setWelcome(req.uid!, chat, dto.text);
  }

  @Get("admin-log")
  public adminLog(@Req() req: Request, @CurrentChat() chat: Chat, @Query(new ZodValidationPipe(adminLogQuerySchema)) query: AdminLogQueryDto) {
    return this.admin.log(req.uid!, chat, query.beforeId);
  }
}
