import { Controller, Get, HttpCode, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { CurrentChat, MemberChatGuard } from "../chats/guards/member-chat.guard.js";
import { SecretChatGuard } from "../chats/guards/secret-chat.guard.js";
import type { Chat } from "../chats/model/domain.js";
import { PaidMediaService } from "./paid-media.service.js";

// Платный пост: открыть настоящие вложения, купить.
@Controller("api/chats/:id/messages/:messageId")
@UseGuards(AuthGuard, SecretChatGuard, MemberChatGuard)
export class PaidMediaController {
  public constructor(private readonly paid: PaidMediaService) {}

  @Get("paid")
  public attachments(@Req() req: Request, @CurrentChat() chat: Chat, @Param("messageId") messageId: string) {
    return this.paid.attachments(req.uid!, chat, messageId);
  }

  @Post("unlock")
  @HttpCode(200)
  public unlock(@Req() req: Request, @CurrentChat() chat: Chat, @Param("messageId") messageId: string) {
    return this.paid.unlock(req.uid!, chat, messageId);
  }
}
