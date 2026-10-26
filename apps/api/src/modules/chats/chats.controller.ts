import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { ChatsService } from "./chats.service.js";
import { CurrentChat, MemberChatGuard } from "./guards/member-chat.guard.js";
import { SecretChatGuard } from "./guards/secret-chat.guard.js";
import type { Chat } from "./model/domain.js";
import {
  clearSchema,
  createChannelSchema,
  createGroupSchema,
  createDmSchema,
  createSecretSchema,
  deleteChatSchema,
  draftSchema,
  muteSchema,
  patchChatSchema,
  pinnedOrderSchema,
  protectSchema,
  typingSchema,
  wallpaperSchema,
  type ClearDto,
  type CreateCommunityDto,
  type CreateDmDto,
  type CreateSecretDto,
  type DeleteChatDto,
  type DraftDto,
  type MuteDto,
  type PatchChatDto,
  type PinnedOrderDto,
  type ProtectDto,
  type TypingDto,
  type WallpaperDto,
} from "./model/schemas/chat.schema.js";

// Чаты пользователя: список, создание, правка, удаление, выход, личные флаги, «печатает…».
// Сообщения и темы чата — модули messages и topics.
@Controller("api/chats")
@UseGuards(AuthGuard, SecretChatGuard)
export class ChatsController {
  public constructor(private readonly chats: ChatsService) {}

  @Get()
  public list(@Req() req: Request) {
    return this.chats.list(req.uid!, req.cookies?.device_id ?? null);
  }

  @Post("pinned-order")
  @HttpCode(200)
  public pinnedOrder(@Req() req: Request, @Body(new ZodValidationPipe(pinnedOrderSchema)) dto: PinnedOrderDto) {
    return this.chats.setPinnedOrder(req.uid!, dto.chatIds);
  }

  @Post()
  @HttpCode(200)
  public createDm(@Req() req: Request, @Body(new ZodValidationPipe(createDmSchema)) dto: CreateDmDto) {
    return this.chats.createDm(req.uid!, dto);
  }

  @Post("secret")
  @HttpCode(200)
  public createSecret(@Req() req: Request, @Body(new ZodValidationPipe(createSecretSchema)) dto: CreateSecretDto) {
    return this.chats.createSecret(req.uid!, req.cookies?.device_id, dto.userId);
  }

  @Post("channels")
  @HttpCode(200)
  public createChannel(@Req() req: Request, @Body(new ZodValidationPipe(createChannelSchema)) dto: CreateCommunityDto) {
    return this.chats.createChannel(req.uid!, dto);
  }

  @Post("groups")
  @HttpCode(200)
  public createGroup(@Req() req: Request, @Body(new ZodValidationPipe(createGroupSchema)) dto: CreateCommunityDto) {
    return this.chats.createGroup(req.uid!, dto);
  }

  @Get(":id")
  @UseGuards(MemberChatGuard)
  public detail(@Req() req: Request, @CurrentChat() chat: Chat) {
    return this.chats.detail(req.uid!, chat);
  }

  @Patch(":id")
  @UseGuards(MemberChatGuard)
  public update(@Req() req: Request, @CurrentChat() chat: Chat, @Body(new ZodValidationPipe(patchChatSchema)) dto: PatchChatDto) {
    return this.chats.update(req.uid!, chat, dto);
  }

  @Get(":id/features")
  @UseGuards(MemberChatGuard)
  public features(@CurrentChat() chat: Chat) {
    return this.chats.features(chat);
  }

  // Не участнику чат может удалить модератор Shalter, поэтому без MemberChatGuard.
  @Delete(":id")
  public remove(@Req() req: Request, @Param("id") id: string, @Body(new ZodValidationPipe(deleteChatSchema)) dto: DeleteChatDto) {
    return this.chats.remove(req.uid!, id, dto.reason);
  }

  @Post(":id/clear")
  @HttpCode(200)
  @UseGuards(MemberChatGuard)
  public clear(@Req() req: Request, @CurrentChat() chat: Chat, @Body(new ZodValidationPipe(clearSchema)) dto: ClearDto) {
    return this.chats.clear(req.uid!, chat, dto.forEveryone);
  }

  @Post(":id/wallpaper")
  @HttpCode(200)
  @UseGuards(MemberChatGuard)
  public wallpaper(@Req() req: Request, @CurrentChat() chat: Chat, @Body(new ZodValidationPipe(wallpaperSchema)) dto: WallpaperDto) {
    return this.chats.setWallpaper(req.uid!, chat, dto);
  }

  @Post(":id/draft")
  @HttpCode(200)
  @UseGuards(MemberChatGuard)
  public draft(@Req() req: Request, @CurrentChat() chat: Chat, @Body(new ZodValidationPipe(draftSchema)) dto: DraftDto) {
    return this.chats.setDraft(req.uid!, chat.id, dto.text);
  }

  @Post(":id/read")
  @HttpCode(200)
  @UseGuards(MemberChatGuard)
  public read(@Req() req: Request, @CurrentChat() chat: Chat) {
    return this.chats.markRead(req.uid!, chat);
  }

  @Post(":id/delete-for-me")
  @HttpCode(200)
  @UseGuards(MemberChatGuard)
  public deleteForMe(@Req() req: Request, @CurrentChat() chat: Chat) {
    return this.chats.deleteForMe(req.uid!, chat.id);
  }

  @Post(":id/leave")
  @HttpCode(200)
  @UseGuards(MemberChatGuard)
  public leave(@Req() req: Request, @CurrentChat() chat: Chat) {
    return this.chats.leave(req.uid!, chat);
  }

  @Post(":id/mute")
  @HttpCode(200)
  @UseGuards(MemberChatGuard)
  public mute(@Req() req: Request, @CurrentChat() chat: Chat, @Body(new ZodValidationPipe(muteSchema)) dto: MuteDto) {
    return this.chats.mute(req.uid!, chat, dto);
  }

  @Get(":id/typing")
  @UseGuards(MemberChatGuard)
  public typing(@Req() req: Request, @CurrentChat() chat: Chat) {
    return this.chats.getTyping(req.uid!, chat.id);
  }

  @Post(":id/typing")
  @HttpCode(200)
  @UseGuards(MemberChatGuard)
  public setTyping(@Req() req: Request, @CurrentChat() chat: Chat, @Body(new ZodValidationPipe(typingSchema)) dto: TypingDto) {
    return this.chats.setTyping(req.uid!, chat, dto.action);
  }

  @Post(":id/vote")
  @HttpCode(200)
  @UseGuards(MemberChatGuard)
  public vote(@Req() req: Request, @CurrentChat() chat: Chat) {
    return this.chats.vote(req.uid!, chat);
  }

  @Post(":id/protect")
  @HttpCode(200)
  @UseGuards(MemberChatGuard)
  public protect(@Req() req: Request, @CurrentChat() chat: Chat, @Body(new ZodValidationPipe(protectSchema)) dto: ProtectDto) {
    return this.chats.protect(req.uid!, chat, dto.enabled);
  }
}
