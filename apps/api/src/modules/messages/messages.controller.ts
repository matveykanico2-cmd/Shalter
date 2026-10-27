import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { CurrentChat, MemberChatGuard } from "../chats/guards/member-chat.guard.js";
import { SecretChatGuard } from "../chats/guards/secret-chat.guard.js";
import type { Chat } from "../chats/model/domain.js";
import { MessageActionsService } from "./message-actions.service.js";
import { MessageSendService } from "./message-send.service.js";
import { MessagesService } from "./messages.service.js";
import {
  atQuerySchema,
  daysQuerySchema,
  historyQuerySchema,
  locationSchema,
  searchQuerySchema,
  chatMessageSchema,
  reactSchema,
  type AtQueryDto,
  type DaysQueryDto,
  type HistoryQueryDto,
  type LocationDto,
  type ReactDto,
  type SearchQueryDto,
  type ChatMessageDto,
} from "./model/schemas/message.schema.js";

// Переписка чата: история, отправка, поиск, календарь, ветки, кто прочитал, сводка,
// живая геолокация. Только участникам.
@Controller("api/chats/:id/messages")
@UseGuards(AuthGuard, SecretChatGuard, MemberChatGuard)
export class MessagesController {
  public constructor(
    private readonly messages: MessagesService,
    private readonly sender: MessageSendService,
    private readonly actions: MessageActionsService
  ) {}

  @Get()
  public history(@Req() req: Request, @CurrentChat() chat: Chat, @Query(new ZodValidationPipe(historyQuerySchema)) query: HistoryQueryDto) {
    return this.messages.history(req.uid!, chat, query);
  }

  @Post()
  @HttpCode(200)
  public send(@Req() req: Request, @CurrentChat() chat: Chat, @Body(new ZodValidationPipe(chatMessageSchema)) dto: ChatMessageDto) {
    return this.sender.send(req.uid!, chat, dto);
  }

  @Post(":messageId/react")
  @HttpCode(200)
  public react(@Req() req: Request, @CurrentChat() chat: Chat, @Param("messageId") messageId: string, @Body(new ZodValidationPipe(reactSchema)) dto: ReactDto) {
    return this.actions.react(req.uid!, chat.id, messageId, dto);
  }

  @Delete("by-date")
  @HttpCode(200)
  public clearBeforeDay(@Req() req: Request, @CurrentChat() chat: Chat, @Query(new ZodValidationPipe(atQuerySchema)) query: AtQueryDto) {
    return this.messages.clearBeforeDay(req.uid!, chat.id, query.day!);
  }

  @Get("search")
  public search(@Req() req: Request, @CurrentChat() chat: Chat, @Query(new ZodValidationPipe(searchQuerySchema)) query: SearchQueryDto) {
    return this.messages.search(req.uid!, chat, query);
  }

  @Get("days")
  public days(@CurrentChat() chat: Chat, @Query(new ZodValidationPipe(daysQuerySchema)) query: DaysQueryDto) {
    return this.messages.days(chat, query);
  }

  @Get("at")
  public at(@CurrentChat() chat: Chat, @Query(new ZodValidationPipe(atQuerySchema)) query: AtQueryDto) {
    return this.messages.at(chat, query);
  }

  @Get(":messageId/summary")
  public summary(@Req() req: Request, @CurrentChat() chat: Chat, @Param("messageId") messageId: string) {
    return this.messages.summary(req.uid!, chat, messageId);
  }

  @Get(":messageId/readers")
  public readers(@Req() req: Request, @CurrentChat() chat: Chat, @Param("messageId") messageId: string) {
    return this.messages.readers(req.uid!, chat, messageId);
  }

  @Get(":messageId/thread")
  public thread(@CurrentChat() chat: Chat, @Param("messageId") messageId: string) {
    return this.messages.thread(chat, messageId);
  }

  @Post(":messageId/location")
  @HttpCode(200)
  public location(
    @Req() req: Request,
    @CurrentChat() chat: Chat,
    @Param("messageId") messageId: string,
    @Body(new ZodValidationPipe(locationSchema)) dto: LocationDto
  ) {
    return this.actions.location(req.uid!, chat, messageId, dto);
  }
}
