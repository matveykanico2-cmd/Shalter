import { Body, Controller, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { ChatMembersService } from "./chat-members.service.js";
import { CurrentChat, MemberChatGuard } from "./guards/member-chat.guard.js";
import { SecretChatGuard } from "./guards/secret-chat.guard.js";
import type { Chat } from "./model/domain.js";
import {
  memberRoleSchema,
  memberTitleSchema,
  restrictSchema,
  type MemberRoleDto,
  type MemberTitleDto,
  type RestrictDto,
} from "./model/schemas/chat-members.schema.js";

// Участники группы или канала: роли, бан, теги, ограничения.
@Controller("api/chats/:id")
@UseGuards(AuthGuard, SecretChatGuard, MemberChatGuard)
export class ChatMembersController {
  public constructor(private readonly members: ChatMembersService) {}

  @Post("members")
  @HttpCode(200)
  public changeRole(@Req() req: Request, @CurrentChat() chat: Chat, @Body(new ZodValidationPipe(memberRoleSchema)) dto: MemberRoleDto) {
    return this.members.changeRole(req.uid!, chat, dto);
  }

  @Post("title")
  @HttpCode(200)
  public setTitle(@Req() req: Request, @CurrentChat() chat: Chat, @Body(new ZodValidationPipe(memberTitleSchema)) dto: MemberTitleDto) {
    return this.members.setTitle(req.uid!, chat, dto);
  }

  @Post("restrict")
  @HttpCode(200)
  public restrict(@Req() req: Request, @CurrentChat() chat: Chat, @Body(new ZodValidationPipe(restrictSchema)) dto: RestrictDto) {
    return this.members.restrict(req.uid!, chat, dto);
  }
}
