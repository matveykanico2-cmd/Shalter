import { Body, Controller, Get, HttpCode, Post, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { BotApiMessagesService } from "./bot-api-messages.service.js";
import { BotTokenGuard, CurrentBot } from "./guards/bot-token.guard.js";
import type { Bot } from "./model/domain.js";
import {
  cancelScheduledSchema,
  chatActionSchema,
  chatMessagesQuerySchema,
  copySchema,
  editKeyboardSchema,
  editTextSchema,
  forwardSchema,
  mediaGroupSchema,
  messageIdQuerySchema,
  messageIdSchema,
  messageToUserSchema,
  pinSchema,
  publishPostSchema,
  scheduleSchema,
  sendContactSchema,
  sendFileSchema,
  sendGameSchema,
  sendLocationSchema,
  sendMessageSchema,
  sendPollSchema,
  sendReactionSchema,
  sendStickerSchema,
  updatesQuerySchema,
  type CancelScheduledDto,
  type ChatActionDto,
  type ChatMessagesQueryDto,
  type CopyDto,
  type EditKeyboardDto,
  type EditTextDto,
  type ForwardDto,
  type MediaGroupDto,
  type MessageIdDto,
  type MessageIdQueryDto,
  type MessageToUserDto,
  type PinDto,
  type PublishPostDto,
  type ScheduleDto,
  type SendContactDto,
  type SendFileDto,
  type SendGameDto,
  type SendLocationDto,
  type SendMessageDto,
  type SendPollDto,
  type SendReactionDto,
  type SendStickerDto,
  type UpdatesQueryDto,
} from "./model/schemas/bot-api.schema.js";

// Bot API (Authorization: Bearer <токен бота>): сообщения.
@Controller("api/bot-api")
@UseGuards(BotTokenGuard)
export class BotApiMessagesController {
  public constructor(private readonly messages: BotApiMessagesService) {}

  /** Long polling: клиент ушёл — ответа нет, как в server/. */
  @Get("updates")
  public async updates(@CurrentBot() bot: Bot, @Query(new ZodValidationPipe(updatesQuerySchema)) query: UpdatesQueryDto, @Res() res: Response): Promise<void> {
    let alive = true;
    res.on("close", () => {
      alive = false;
    });
    const result = await this.messages.updates(bot, query, () => alive);
    if (result) res.json(result);
  }

  @Post("sendMessage")
  @HttpCode(200)
  public sendMessage(@CurrentBot() bot: Bot, @Body(new ZodValidationPipe(sendMessageSchema)) dto: SendMessageDto) {
    return this.messages.sendMessage(bot, dto);
  }

  @Post("editMessageText")
  @HttpCode(200)
  public editMessageText(@CurrentBot() bot: Bot, @Body(new ZodValidationPipe(editTextSchema)) dto: EditTextDto) {
    return this.messages.editText(bot, dto);
  }

  @Post("deleteMessage")
  @HttpCode(200)
  public deleteMessage(@CurrentBot() bot: Bot, @Body(new ZodValidationPipe(messageIdSchema)) dto: MessageIdDto) {
    return this.messages.delete(bot, dto);
  }

  @Post("pinChatMessage")
  @HttpCode(200)
  public pinChatMessage(@CurrentBot() bot: Bot, @Body(new ZodValidationPipe(pinSchema)) dto: PinDto) {
    return this.messages.pin(bot, dto);
  }

  @Post("unpinChatMessage")
  @HttpCode(200)
  public unpinChatMessage(@CurrentBot() bot: Bot, @Body(new ZodValidationPipe(messageIdSchema)) dto: MessageIdDto) {
    return this.messages.unpin(bot, dto);
  }

  @Post("sendChatAction")
  @HttpCode(200)
  public sendChatAction(@CurrentBot() bot: Bot, @Body(new ZodValidationPipe(chatActionSchema)) dto: ChatActionDto) {
    return this.messages.chatAction(bot, dto);
  }

  @Post("sendPhoto")
  @HttpCode(200)
  public sendPhoto(@CurrentBot() bot: Bot, @Body(new ZodValidationPipe(sendFileSchema)) dto: SendFileDto) {
    return this.messages.sendPhoto(bot, dto);
  }

  @Post("sendDocument")
  @HttpCode(200)
  public sendDocument(@CurrentBot() bot: Bot, @Body(new ZodValidationPipe(sendFileSchema)) dto: SendFileDto) {
    return this.messages.sendDocument(bot, dto);
  }

  @Post("sendVideo")
  @HttpCode(200)
  public sendVideo(@CurrentBot() bot: Bot, @Body(new ZodValidationPipe(sendFileSchema)) dto: SendFileDto) {
    return this.messages.sendMedia(bot, "video", "🎬 Видео", dto);
  }

  @Post("sendVoice")
  @HttpCode(200)
  public sendVoice(@CurrentBot() bot: Bot, @Body(new ZodValidationPipe(sendFileSchema)) dto: SendFileDto) {
    return this.messages.sendMedia(bot, "voice", "🎤 Голосовое", dto);
  }

  @Post("sendVideoNote")
  @HttpCode(200)
  public sendVideoNote(@CurrentBot() bot: Bot, @Body(new ZodValidationPipe(sendFileSchema)) dto: SendFileDto) {
    return this.messages.sendMedia(bot, "video-note", "⭕ Кружок", dto);
  }

  @Post("sendMediaGroup")
  @HttpCode(200)
  public sendMediaGroup(@CurrentBot() bot: Bot, @Body(new ZodValidationPipe(mediaGroupSchema)) dto: MediaGroupDto) {
    return this.messages.sendMediaGroup(bot, dto);
  }

  @Post("sendLocation")
  @HttpCode(200)
  public sendLocation(@CurrentBot() bot: Bot, @Body(new ZodValidationPipe(sendLocationSchema)) dto: SendLocationDto) {
    return this.messages.sendLocation(bot, dto);
  }

  @Post("sendContact")
  @HttpCode(200)
  public sendContact(@CurrentBot() bot: Bot, @Body(new ZodValidationPipe(sendContactSchema)) dto: SendContactDto) {
    return this.messages.sendContact(bot, dto);
  }

  @Post("sendPoll")
  @HttpCode(200)
  public sendPoll(@CurrentBot() bot: Bot, @Body(new ZodValidationPipe(sendPollSchema)) dto: SendPollDto) {
    return this.messages.sendPoll(bot, dto);
  }

  @Post("sendGame")
  @HttpCode(200)
  public sendGame(@CurrentBot() bot: Bot, @Body(new ZodValidationPipe(sendGameSchema)) dto: SendGameDto) {
    return this.messages.sendGame(bot, dto);
  }

  @Post("sendSticker")
  @HttpCode(200)
  public sendSticker(@CurrentBot() bot: Bot, @Body(new ZodValidationPipe(sendStickerSchema)) dto: SendStickerDto) {
    return this.messages.sendSticker(bot, dto);
  }

  @Post("sendReaction")
  @HttpCode(200)
  public sendReaction(@CurrentBot() bot: Bot, @Body(new ZodValidationPipe(sendReactionSchema)) dto: SendReactionDto) {
    return this.messages.react(bot, dto);
  }

  @Post("deleteAnyMessage")
  @HttpCode(200)
  public deleteAnyMessage(@CurrentBot() bot: Bot, @Body(new ZodValidationPipe(messageIdSchema)) dto: MessageIdDto) {
    return this.messages.deleteAny(bot, dto);
  }

  @Post("forwardMessage")
  @HttpCode(200)
  public forwardMessage(@CurrentBot() bot: Bot, @Body(new ZodValidationPipe(forwardSchema)) dto: ForwardDto) {
    return this.messages.forward(bot, dto);
  }

  @Post("copyMessage")
  @HttpCode(200)
  public copyMessage(@CurrentBot() bot: Bot, @Body(new ZodValidationPipe(copySchema)) dto: CopyDto) {
    return this.messages.copy(bot, dto);
  }

  @Get("getMessage")
  public getMessage(@CurrentBot() bot: Bot, @Query(new ZodValidationPipe(messageIdQuerySchema)) query: MessageIdQueryDto) {
    return this.messages.get(bot, query);
  }

  @Get("getMessages")
  public getMessages(@CurrentBot() bot: Bot, @Query(new ZodValidationPipe(chatMessagesQuerySchema)) query: ChatMessagesQueryDto) {
    return this.messages.list(bot, query);
  }

  @Get("searchMessages")
  public searchMessages(@CurrentBot() bot: Bot, @Query(new ZodValidationPipe(chatMessagesQuerySchema)) query: ChatMessagesQueryDto) {
    return this.messages.search(bot, query);
  }

  @Get("getPinnedMessages")
  public getPinnedMessages(@CurrentBot() bot: Bot, @Query(new ZodValidationPipe(chatMessagesQuerySchema)) query: ChatMessagesQueryDto) {
    return this.messages.pinned(bot, query);
  }

  @Post("editMessageKeyboard")
  @HttpCode(200)
  public editMessageKeyboard(@CurrentBot() bot: Bot, @Body(new ZodValidationPipe(editKeyboardSchema)) dto: EditKeyboardDto) {
    return this.messages.editKeyboard(bot, dto);
  }

  @Post("scheduleMessage")
  @HttpCode(200)
  public scheduleMessage(@CurrentBot() bot: Bot, @Body(new ZodValidationPipe(scheduleSchema)) dto: ScheduleDto) {
    return this.messages.schedule(bot, dto);
  }

  @Get("getScheduled")
  public getScheduled(@CurrentBot() bot: Bot, @Query(new ZodValidationPipe(chatMessagesQuerySchema)) query: ChatMessagesQueryDto) {
    return this.messages.listScheduled(bot, query);
  }

  @Post("cancelScheduled")
  @HttpCode(200)
  public cancelScheduled(@CurrentBot() bot: Bot, @Body(new ZodValidationPipe(cancelScheduledSchema)) dto: CancelScheduledDto) {
    return this.messages.cancelScheduled(bot, dto);
  }

  @Post("publishPost")
  @HttpCode(200)
  public publishPost(@CurrentBot() bot: Bot, @Body(new ZodValidationPipe(publishPostSchema)) dto: PublishPostDto) {
    return this.messages.publishPost(bot, dto);
  }

  @Post("sendMessageToUser")
  @HttpCode(200)
  public sendMessageToUser(@CurrentBot() bot: Bot, @Body(new ZodValidationPipe(messageToUserSchema)) dto: MessageToUserDto) {
    return this.messages.messageToUser(bot, dto);
  }
}
