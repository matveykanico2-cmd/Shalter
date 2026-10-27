import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from "@nestjs/common";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { BotApiChatsService } from "./bot-api-chats.service.js";
import { BotTokenGuard, CurrentBot } from "./guards/bot-token.guard.js";
import type { Bot } from "./model/domain.js";
import {
  chatIdQuerySchema,
  chatTextSchema,
  createChannelSchema,
  createGroupSchema,
  discussionSchema,
  inviteLinkSchema,
  memberActionSchema,
  permissionsSchema,
  type ChatIdQueryDto,
  type ChatTextDto,
  type CreateChannelDto,
  type CreateGroupDto,
  type DiscussionDto,
  type InviteLinkDto,
  type MemberActionDto,
  type PermissionsDto,
} from "./model/schemas/bot-api.schema.js";

// Bot API (Authorization: Bearer <токен бота>): чаты, участники, группы и каналы бота.
@Controller("api/bot-api")
@UseGuards(BotTokenGuard)
export class BotApiChatsController {
  public constructor(private readonly chats: BotApiChatsService) {}

  @Get("getChats")
  public getChats(@CurrentBot() bot: Bot) {
    return this.chats.list(bot);
  }

  @Get("getChat")
  public getChat(@CurrentBot() bot: Bot, @Query(new ZodValidationPipe(chatIdQuerySchema)) query: ChatIdQueryDto) {
    return this.chats.get(bot, query);
  }

  @Get("getChatAdmins")
  public getChatAdmins(@CurrentBot() bot: Bot, @Query(new ZodValidationPipe(chatIdQuerySchema)) query: ChatIdQueryDto) {
    return this.chats.admins(bot, query);
  }

  @Get("getChatMemberCount")
  public getChatMemberCount(@CurrentBot() bot: Bot, @Query(new ZodValidationPipe(chatIdQuerySchema)) query: ChatIdQueryDto) {
    return this.chats.memberCount(bot, query);
  }

  @Get("getChatMember")
  public getChatMember(@CurrentBot() bot: Bot, @Query(new ZodValidationPipe(chatIdQuerySchema)) query: ChatIdQueryDto) {
    return this.chats.member(bot, query);
  }

  @Post("getChatJoinRequests")
  @HttpCode(200)
  public getChatJoinRequests(@CurrentBot() bot: Bot, @Body(new ZodValidationPipe(memberActionSchema)) dto: MemberActionDto) {
    return this.chats.joinRequestList(bot, dto);
  }

  @Post("approveChatJoinRequest")
  @HttpCode(200)
  public approveChatJoinRequest(@CurrentBot() bot: Bot, @Body(new ZodValidationPipe(memberActionSchema)) dto: MemberActionDto) {
    return this.chats.decideJoinRequest(bot, dto, true);
  }

  @Post("declineChatJoinRequest")
  @HttpCode(200)
  public declineChatJoinRequest(@CurrentBot() bot: Bot, @Body(new ZodValidationPipe(memberActionSchema)) dto: MemberActionDto) {
    return this.chats.decideJoinRequest(bot, dto, false);
  }

  @Post("banChatMember")
  @HttpCode(200)
  public banChatMember(@CurrentBot() bot: Bot, @Body(new ZodValidationPipe(memberActionSchema)) dto: MemberActionDto) {
    return this.chats.ban(bot, dto);
  }

  @Post("unbanChatMember")
  @HttpCode(200)
  public unbanChatMember(@CurrentBot() bot: Bot, @Body(new ZodValidationPipe(memberActionSchema)) dto: MemberActionDto) {
    return this.chats.unban(bot, dto);
  }

  @Post("restrictChatMember")
  @HttpCode(200)
  public restrictChatMember(@CurrentBot() bot: Bot, @Body(new ZodValidationPipe(memberActionSchema)) dto: MemberActionDto) {
    return this.chats.restrict(bot, dto);
  }

  @Post("promoteChatMember")
  @HttpCode(200)
  public promoteChatMember(@CurrentBot() bot: Bot, @Body(new ZodValidationPipe(memberActionSchema)) dto: MemberActionDto) {
    return this.chats.promote(bot, dto);
  }

  @Post("addChatMember")
  @HttpCode(200)
  public addChatMember(@CurrentBot() bot: Bot, @Body(new ZodValidationPipe(memberActionSchema)) dto: MemberActionDto) {
    return this.chats.addMember(bot, dto);
  }

  @Post("setChatTitle")
  @HttpCode(200)
  public setChatTitle(@CurrentBot() bot: Bot, @Body(new ZodValidationPipe(chatTextSchema)) dto: ChatTextDto) {
    return this.chats.setTitle(bot, dto);
  }

  @Post("setChatDescription")
  @HttpCode(200)
  public setChatDescription(@CurrentBot() bot: Bot, @Body(new ZodValidationPipe(chatTextSchema)) dto: ChatTextDto) {
    return this.chats.setDescription(bot, dto);
  }

  @Post("setChatPermissions")
  @HttpCode(200)
  public setChatPermissions(@CurrentBot() bot: Bot, @Body(new ZodValidationPipe(permissionsSchema)) dto: PermissionsDto) {
    return this.chats.setPermissions(bot, dto);
  }

  @Post("exportChatInviteLink")
  @HttpCode(200)
  public exportChatInviteLink(@CurrentBot() bot: Bot, @Body(new ZodValidationPipe(inviteLinkSchema)) dto: InviteLinkDto) {
    return this.chats.inviteLink(bot, dto);
  }

  @Post("leaveChat")
  @HttpCode(200)
  public leaveChat(@CurrentBot() bot: Bot, @Body(new ZodValidationPipe(memberActionSchema)) dto: MemberActionDto) {
    return this.chats.leave(bot, dto);
  }

  @Post("createGroup")
  @HttpCode(200)
  public createGroup(@CurrentBot() bot: Bot, @Body(new ZodValidationPipe(createGroupSchema)) dto: CreateGroupDto) {
    return this.chats.createGroup(bot, dto);
  }

  @Post("createChannel")
  @HttpCode(200)
  public createChannel(@CurrentBot() bot: Bot, @Body(new ZodValidationPipe(createChannelSchema)) dto: CreateChannelDto) {
    return this.chats.createChannel(bot, dto);
  }

  @Post("setChatDiscussion")
  @HttpCode(200)
  public setChatDiscussion(@CurrentBot() bot: Bot, @Body(new ZodValidationPipe(discussionSchema)) dto: DiscussionDto) {
    return this.chats.setDiscussion(bot, dto);
  }

  @Get("getChatDiscussion")
  public getChatDiscussion(@CurrentBot() bot: Bot, @Query(new ZodValidationPipe(chatIdQuerySchema)) query: ChatIdQueryDto) {
    return this.chats.discussion(bot, query);
  }

  @Get("getChannelStats")
  public getChannelStats(@CurrentBot() bot: Bot, @Query(new ZodValidationPipe(chatIdQuerySchema)) query: ChatIdQueryDto) {
    return this.chats.channelStats(bot, query);
  }
}
