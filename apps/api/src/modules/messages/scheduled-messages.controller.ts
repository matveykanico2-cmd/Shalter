import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { CurrentChat, MemberChatGuard } from "../chats/guards/member-chat.guard.js";
import { SecretChatGuard } from "../chats/guards/secret-chat.guard.js";
import type { Chat } from "../chats/model/domain.js";
import { editScheduledSchema, scheduleSchema, type EditScheduledDto, type ScheduleDto } from "./model/schemas/message.schema.js";
import { ScheduledMessagesService } from "./scheduled-messages.service.js";

// Отложенные сообщения. Список и создание — участникам чата; правка и удаление — автору
// записи, даже если он уже вышел из чата.
@Controller("api/chats/:id/messages/scheduled")
@UseGuards(AuthGuard, SecretChatGuard)
export class ScheduledMessagesController {
  public constructor(private readonly scheduled: ScheduledMessagesService) {}

  @Get()
  @UseGuards(MemberChatGuard)
  public list(@Req() req: Request, @CurrentChat() chat: Chat) {
    return this.scheduled.list(req.uid!, chat);
  }

  @Post()
  @HttpCode(200)
  @UseGuards(MemberChatGuard)
  public create(@Req() req: Request, @CurrentChat() chat: Chat, @Body(new ZodValidationPipe(scheduleSchema)) dto: ScheduleDto) {
    return this.scheduled.create(req.uid!, chat, dto);
  }

  @Patch(":scheduledId")
  public update(
    @Req() req: Request,
    @Param("id") chatId: string,
    @Param("scheduledId") scheduledId: string,
    @Body(new ZodValidationPipe(editScheduledSchema)) dto: EditScheduledDto
  ) {
    return this.scheduled.update(req.uid!, chatId, scheduledId, dto);
  }

  @Delete(":scheduledId")
  public remove(@Req() req: Request, @Param("id") chatId: string, @Param("scheduledId") scheduledId: string) {
    return this.scheduled.remove(req.uid!, chatId, scheduledId);
  }
}
