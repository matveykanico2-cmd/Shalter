import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { botMessaging, type BotSendOptions } from "../../legacy/legacy.js";
import { ChatsRepository } from "../chats/chats.repository.js";
import type { Chat } from "../chats/model/domain.js";
import { MessagesRepository } from "../messages/messages.repository.js";
import type { Message } from "../messages/model/domain.js";
import { str } from "./lib/bot-api.js";
import type { Bot } from "./model/domain.js";

// Общие проверки Bot API (botChat, requireBotAdmin, botRunsChat, botOwns в server/routes/botApi.js)
// и отправка сообщения от бота.
@Injectable()
export class BotApiAccessService {
  public constructor(
    private readonly chats: ChatsRepository,
    private readonly messages: MessagesRepository
  ) {}

  /** Чат, где бот состоит. */
  public memberChat(bot: Bot, chatId: unknown): Chat {
    const chat = this.chats.findById(str(chatId));
    if (!chat || !chat.memberIds.includes(bot.userId)) throw new ApiError(404, "Bot is not a member of this chat");
    return chat;
  }

  /** Чат, где бот — админ. */
  public adminChat(bot: Bot, chatId: unknown): Chat {
    const chat = this.memberChat(bot, chatId);
    if (!(chat.adminIds ?? []).includes(bot.userId)) throw new ApiError(403, "Bot must be an admin of this chat");
    return chat;
  }

  /** Канал или группа, которыми бот управляет (владелец или админ). */
  public runsChat(bot: Bot, chatId: unknown, expectType: "channel" | "group"): Chat {
    const chat = this.chats.findById(str(chatId));
    if (!chat || !chat.memberIds.includes(bot.userId)) throw new ApiError(404, "Чат не найден или бот не состоит в нём");
    if (chat.type !== expectType) throw new ApiError(400, expectType === "channel" ? "Это не канал" : "Это не группа");
    const staff = (chat.ownerIds ?? []).includes(bot.userId) || (chat.adminIds ?? []).includes(bot.userId) || chat.ownerId === bot.userId;
    if (!staff) throw new ApiError(403, "Бот не администратор этого чата");
    return chat;
  }

  /** Своё сообщение бота в чате, где он состоит. */
  public ownMessage(bot: Bot, messageId: unknown): { chat: Chat; message: Message } {
    const message = this.messages.findById(str(messageId));
    if (!message) throw new ApiError(404, "Message not found");
    const chat = this.chats.findById(message.chatId);
    if (!chat || !chat.memberIds.includes(bot.userId)) throw new ApiError(404, "Bot is not a member of this chat");
    if (message.senderId !== bot.userId) throw new ApiError(403, "Bot can only touch its own messages");
    return { chat, message };
  }

  /** Сообщение от бота; отказ — ошибкой API с его статусом (без статуса — fallbackStatus). */
  public async send(bot: Bot, chatId: unknown, text: unknown, opts: BotSendOptions = {}, fallbackStatus = 404) {
    try {
      return { message: await botMessaging().sendBotMessage(bot.userId, chatId, text, opts) };
    } catch (err) {
      const e = err as { status?: number; message?: string };
      throw new ApiError(e.status ?? fallbackStatus, e.message ?? "");
    }
  }

  /** Текст отказа, если боту нельзя писать в этот чат. */
  public async assertMayPost(bot: Bot, chat: Chat): Promise<void> {
    const denied = await botMessaging().botPostDenied(chat, bot.userId);
    if (denied) throw new ApiError(403, denied);
  }
}
