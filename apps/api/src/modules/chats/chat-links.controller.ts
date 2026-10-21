import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { ChatLinksService } from "./chat-links.service.js";
import { CurrentChat, MemberChatGuard } from "./guards/member-chat.guard.js";
import { SecretChatGuard } from "./guards/secret-chat.guard.js";
import type { Chat } from "./model/domain.js";
import { limitQuerySchema, type LimitQueryDto } from "./model/schemas/chat.schema.js";
import { decideJoinRequestSchema, inviteSchema, type DecideJoinRequestDto, type InviteDto } from "./model/schemas/chat-links.schema.js";

// Вход в группу или канал: @юзернейм, ссылка-приглашение, превью, вступление и заявки.
// Регистрируется первым: by-username/… и invite/… не должны попасть в /:id/….
@Controller("api/chats")
@UseGuards(AuthGuard, SecretChatGuard)
export class ChatLinksController {
  public constructor(private readonly links: ChatLinksService) {}

  @Get("by-username/:username")
  public byUsername(@Req() req: Request, @Param("username") username: string) {
    return this.links.byUsername(req.uid!, username);
  }

  @Get("invite/:code")
  public inviteInfo(@Req() req: Request, @Param("code") code: string) {
    return this.links.inviteInfo(req.uid!, code);
  }

  @Post("invite/:code/join")
  @HttpCode(200)
  public joinByInvite(@Req() req: Request, @Param("code") code: string) {
    return this.links.joinByInvite(req.uid!, code);
  }

  @Get(":id/preview")
  public preview(@Req() req: Request, @Param("id") id: string, @Query(new ZodValidationPipe(limitQuerySchema)) query: LimitQueryDto) {
    return this.links.preview(req.uid!, id, query.limit);
  }

  @Post(":id/join")
  @HttpCode(200)
  public join(@Req() req: Request, @Param("id") id: string) {
    return this.links.join(req.uid!, id);
  }

  @Post(":id/invite")
  @HttpCode(200)
  @UseGuards(MemberChatGuard)
  public invite(@Req() req: Request, @CurrentChat() chat: Chat, @Body(new ZodValidationPipe(inviteSchema)) dto: InviteDto) {
    return this.links.invite(req.uid!, chat, dto.revoke);
  }

  @Get(":id/join-requests")
  @UseGuards(MemberChatGuard)
  public joinRequests(@Req() req: Request, @CurrentChat() chat: Chat) {
    return this.links.listJoinRequests(req.uid!, chat);
  }

  @Post(":id/join-requests/:userId")
  @HttpCode(200)
  @UseGuards(MemberChatGuard)
  public decideJoinRequest(
    @Req() req: Request,
    @CurrentChat() chat: Chat,
    @Param("userId") userId: string,
    @Body(new ZodValidationPipe(decideJoinRequestSchema)) dto: DecideJoinRequestDto
  ) {
    return this.links.decideJoinRequest(req.uid!, chat, userId, dto.approve);
  }
}
