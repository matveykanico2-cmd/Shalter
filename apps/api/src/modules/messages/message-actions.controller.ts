import { Body, Controller, Delete, HttpCode, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { SecretChatGuard } from "../chats/guards/secret-chat.guard.js";
import { MessageActionsService } from "./message-actions.service.js";
import {
  checklistSchema,
  deleteMessageSchema,
  editMessageSchema,
  pinSchema,
  reactSchema,
  voteSchema,
  type ChecklistDto,
  type DeleteMessageDto,
  type EditMessageDto,
  type PinDto,
  type ReactDto,
  type VoteDto,
} from "./model/schemas/message.schema.js";

// Действия с сообщением. Чат и сообщение проверяет сервис: удалить у всех может и
// модератор Shalter, который в чате не состоит.
@Controller("api/chats/:id/messages/:messageId")
@UseGuards(AuthGuard, SecretChatGuard)
export class MessageActionsController {
  public constructor(private readonly actions: MessageActionsService) {}

  @Patch()
  public edit(@Req() req: Request, @Param("id") chatId: string, @Param("messageId") messageId: string, @Body(new ZodValidationPipe(editMessageSchema)) dto: EditMessageDto) {
    return this.actions.edit(req.uid!, chatId, messageId, dto);
  }

  @Delete()
  public remove(@Req() req: Request, @Param("id") chatId: string, @Param("messageId") messageId: string, @Body(new ZodValidationPipe(deleteMessageSchema)) dto: DeleteMessageDto) {
    return this.actions.remove(req.uid!, chatId, messageId, dto);
  }

  @Post("pin")
  @HttpCode(200)
  public pin(@Req() req: Request, @Param("id") chatId: string, @Param("messageId") messageId: string, @Body(new ZodValidationPipe(pinSchema)) dto: PinDto) {
    return this.actions.pin(req.uid!, chatId, messageId, dto);
  }

  @Post("react")
  @HttpCode(200)
  public react(@Req() req: Request, @Param("id") chatId: string, @Param("messageId") messageId: string, @Body(new ZodValidationPipe(reactSchema)) dto: ReactDto) {
    return this.actions.react(req.uid!, chatId, messageId, dto);
  }

  @Post("vote")
  @HttpCode(200)
  public vote(@Req() req: Request, @Param("id") chatId: string, @Param("messageId") messageId: string, @Body(new ZodValidationPipe(voteSchema)) dto: VoteDto) {
    return this.actions.vote(req.uid!, chatId, messageId, dto);
  }

  @Delete("vote")
  public retractVote(@Req() req: Request, @Param("id") chatId: string, @Param("messageId") messageId: string) {
    return this.actions.retractVote(req.uid!, chatId, messageId);
  }

  @Post("checklist")
  @HttpCode(200)
  public checklist(@Req() req: Request, @Param("id") chatId: string, @Param("messageId") messageId: string, @Body(new ZodValidationPipe(checklistSchema)) dto: ChecklistDto) {
    return this.actions.checklist(req.uid!, chatId, messageId, dto);
  }

  @Post("poll/close")
  @HttpCode(200)
  public closePoll(@Req() req: Request, @Param("id") chatId: string, @Param("messageId") messageId: string) {
    return this.actions.closePoll(req.uid!, chatId, messageId);
  }
}
