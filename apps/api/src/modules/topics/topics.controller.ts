import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { CurrentChat, MemberChatGuard } from "../chats/guards/member-chat.guard.js";
import { SecretChatGuard } from "../chats/guards/secret-chat.guard.js";
import type { Chat } from "../chats/model/domain.js";
import {
  createTopicSchema,
  patchTopicSchema,
  topicsEnabledSchema,
  type CreateTopicDto,
  type PatchTopicDto,
  type TopicsEnabledDto,
} from "./model/schemas/topic.schema.js";
import { TopicsService } from "./topics.service.js";

// Темы группы: список, включение, создание, правка, удаление.
@Controller("api/chats/:id/topics")
@UseGuards(AuthGuard, SecretChatGuard, MemberChatGuard)
export class TopicsController {
  public constructor(private readonly topics: TopicsService) {}

  @Get()
  public list(@CurrentChat() chat: Chat) {
    return this.topics.list(chat);
  }

  @Post("enabled")
  @HttpCode(200)
  public setEnabled(@Req() req: Request, @CurrentChat() chat: Chat, @Body(new ZodValidationPipe(topicsEnabledSchema)) dto: TopicsEnabledDto) {
    return this.topics.setEnabled(req.uid!, chat, dto);
  }

  @Post()
  @HttpCode(200)
  public create(@Req() req: Request, @CurrentChat() chat: Chat, @Body(new ZodValidationPipe(createTopicSchema)) dto: CreateTopicDto) {
    return this.topics.create(req.uid!, chat, dto);
  }

  @Patch(":topicId")
  public update(
    @Req() req: Request,
    @CurrentChat() chat: Chat,
    @Param("topicId") topicId: string,
    @Body(new ZodValidationPipe(patchTopicSchema)) dto: PatchTopicDto
  ) {
    return this.topics.update(req.uid!, chat, topicId, dto);
  }

  @Delete(":topicId")
  public remove(@Req() req: Request, @CurrentChat() chat: Chat, @Param("topicId") topicId: string) {
    return this.topics.remove(req.uid!, chat, topicId);
  }
}
