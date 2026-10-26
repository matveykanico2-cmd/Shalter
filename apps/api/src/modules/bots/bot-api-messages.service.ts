import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { genId } from "../../common/lib/gen-id.js";
import { botMessaging, findOrCreateDm, typing, uploadAccess, type Attachment } from "../../legacy/legacy.js";
import { ChatsRepository } from "../chats/chats.repository.js";
import type { Chat } from "../chats/model/domain.js";
import { GamesService } from "../games/games.service.js";
import { cleanReaction, editText, setPinned, toggleReaction } from "../messages/lib/message-edits.js";
import { MessageSendService } from "../messages/message-send.service.js";
import { MessagesRepository } from "../messages/messages.repository.js";
import type { Message } from "../messages/model/domain.js";
import { ScheduledMessagesRepository } from "../messages/scheduled-messages.repository.js";
import { RealtimeService } from "../realtime/realtime.service.js";
import { publicUser } from "../users/lib/user.presenter.js";
import { UserPrivacyService } from "../users/user-privacy.service.js";
import { UsersRepository } from "../users/users.repository.js";
import { BotApiAccessService } from "./bot-api-access.service.js";
import { audienceOf, timedId } from "./lib/bot-api.js";
import type { Bot } from "./model/domain.js";
import type {
  ChatActionDto,
  ChatMessagesQueryDto,
  CopyDto,
  EditKeyboardDto,
  EditTextDto,
  ForwardDto,
  MediaGroupDto,
  MessageIdDto,
  MessageIdQueryDto,
  MessageToUserDto,
  PinDto,
  PublishPostDto,
  ScheduleDto,
  CancelScheduledDto,
  SendContactDto,
  SendFileDto,
  SendGameDto,
  SendLocationDto,
  SendMessageDto,
  SendPollDto,
  SendReactionDto,
  SendStickerDto,
  UpdatesQueryDto,
} from "./model/schemas/bot-api.schema.js";
import { NEW_DIALOGS_PER_HOUR, NewDialogsStore } from "./stores/new-dialogs.store.js";

const LONG_POLL_STEP_MS = 250;

/** Текст есть и не пустой (`text?.trim()` в server/). */
const hasText = (value: unknown): value is string => typeof value === "string" && !!value.trim();

// Bot API: сообщения — отправка, правка, чтение, отложенные (server/routes/botApi.js).
@Injectable()
export class BotApiMessagesService {
  public constructor(
    private readonly access: BotApiAccessService,
    private readonly chats: ChatsRepository,
    private readonly messages: MessagesRepository,
    private readonly scheduled: ScheduledMessagesRepository,
    private readonly sender: MessageSendService,
    private readonly users: UsersRepository,
    private readonly privacy: UserPrivacyService,
    private readonly games: GamesService,
    private readonly realtime: RealtimeService,
    private readonly newDialogs: NewDialogsStore
  ) {}

  /** Новые сообщения; timeout — long polling до 50 с, пока клиент на связи (isAlive). */
  public async updates(bot: Bot, query: UpdatesQueryDto, isAlive: () => boolean): Promise<{ messages: Message[] } | undefined> {
    const { after, limit, timeout: timeoutSec } = query;
    const read = () => this.messages.listNewForBot(bot.userId, after, limit);

    let messages = read();
    if (messages.length || !timeoutSec) return { messages };

    const deadline = Date.now() + timeoutSec * 1000;
    while (isAlive() && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, LONG_POLL_STEP_MS));
      if (!isAlive()) return undefined;
      messages = read();
      if (messages.length) return { messages };
    }
    return isAlive() ? { messages: [] } : undefined;
  }

  public sendMessage(bot: Bot, dto: SendMessageDto) {
    const { chatId, text, keyboard, replyToId, visibleTo } = dto;
    return this.access.send(bot, chatId, text, { keyboard, replyToId, visibleTo });
  }

  public editText(bot: Bot, dto: EditTextDto) {
    const found = this.access.ownMessage(bot, dto.messageId);
    if (found.message.forwardedFrom) throw new ApiError(400, "Forwarded messages can't be edited");
    const message = this.messages.mutate(found.message.id, (m) => editText(m, dto.text.slice(0, 4096)));
    this.realtime.broadcastToUsers(audienceOf(found.chat, found.message), { type: "message:updated", chatId: found.chat.id, message });
    return { message };
  }

  public delete(bot: Bot, dto: MessageIdDto) {
    const found = this.access.ownMessage(bot, dto.messageId);
    this.remove(found.chat, found.message);
    return { ok: true };
  }

  public pin(bot: Bot, dto: PinDto) {
    const message = this.messages.findById(dto.messageId);
    if (!message) throw new ApiError(404, "Message not found");
    const chat = this.chats.findById(message.chatId);
    if (!chat || !chat.memberIds.includes(bot.userId)) throw new ApiError(404, "Bot is not a member of this chat");
    if (!(chat.adminIds ?? []).includes(bot.userId) && chat.type !== "dm") throw new ApiError(403, "Bot must be an admin to pin messages");
    const updated = this.messages.mutate(message.id, (m) => setPinned(m, dto.pinned));
    this.realtime.broadcastToUsers(audienceOf(chat, message), { type: "message:updated", chatId: chat.id, message: updated });
    return { message: updated };
  }

  public unpin(bot: Bot, dto: MessageIdDto) {
    const message = this.messages.findById(dto.messageId);
    if (!message) throw new ApiError(404, "Message not found");
    const chat = this.access.memberChat(bot, message.chatId);
    if (!(chat.adminIds ?? []).includes(bot.userId) && chat.type !== "dm") throw new ApiError(403, "Bot must be an admin to unpin messages");
    const updated = this.messages.mutate(message.id, (m) => setPinned(m, false));
    this.realtime.broadcastToUsers(audienceOf(chat, message), { type: "message:updated", chatId: chat.id, message: updated });
    return { message: updated };
  }

  /** «Печатает…» от бота — кроме тех, кто его заблокировал. */
  public chatAction(bot: Bot, dto: ChatActionDto) {
    const chat = this.access.memberChat(bot, dto.chatId);
    const action = typing().normalizeAction(dto.action);
    typing().markTyping(chat.id, bot.userId, action);
    const members = this.users.findByIds(chat.memberIds.filter((id) => id !== bot.userId));
    const audience = members.filter((u) => !(u.blockedUserIds ?? []).includes(bot.userId)).map((u) => u.id);
    this.realtime.broadcastToUsers([bot.userId, ...audience], { type: "typing:update", chatId: chat.id, userId: bot.userId, action });
    return { ok: true };
  }

  public sendPhoto(bot: Bot, dto: SendFileDto) {
    const { chatId, url, caption, replyToId } = dto;
    return this.access.send(bot, chatId, caption || "🖼", { replyToId, attachments: [{ kind: "image", url, name: "photo" }] });
  }

  public sendDocument(bot: Bot, dto: SendFileDto) {
    const { chatId, url, name = "file", caption, replyToId } = dto;
    return this.access.send(bot, chatId, caption || `📎 ${name as string}`, { replyToId, attachments: [{ kind: "file", url, name }] });
  }

  /** Видео, голосовое, кружок; durationSec сохраняется у голосовых и кружков (sanitizeAttachments). */
  public sendMedia(bot: Bot, kind: string, defaultText: string, dto: SendFileDto) {
    const { chatId, url, caption, name, replyToId, durationSec } = dto;
    return this.access.send(bot, chatId, caption || defaultText, {
      replyToId,
      attachments: [{ kind, url, name: name ? String(name).slice(0, 200) : undefined, durationSec }],
    });
  }

  public sendMediaGroup(bot: Bot, dto: MediaGroupDto) {
    const { chatId, items, caption, replyToId } = dto;
    return this.access.send(bot, chatId, caption || "🖼", { replyToId, attachments: items });
  }

  public sendLocation(bot: Bot, dto: SendLocationDto) {
    const { chatId, lat, lng, caption, replyToId } = dto;
    return this.access.send(bot, chatId, caption || "📍 Место", {
      replyToId,
      attachments: [{ kind: "location", meta: { lat, lng } }],
    });
  }

  public sendContact(bot: Bot, dto: SendContactDto) {
    const { chatId, name, phone, userId, replyToId } = dto;
    return this.access.send(bot, chatId, `👤 ${(name ?? phone) as string}`, { replyToId, attachments: [{ kind: "contact", meta: { name, phone, userId } }] });
  }

  public sendPoll(bot: Bot, dto: SendPollDto) {
    const { chatId, question, options, replyToId } = dto;
    return this.access.send(bot, chatId, question, {
      replyToId,
      attachments: [{ kind: "poll", meta: { options, votes: options.map(() => 0), voterIds: options.map(() => []) } }],
    });
  }

  /** Карточка игры в чат: «▶ Играть» и рекорды этого чата. */
  public sendGame(bot: Bot, dto: SendGameDto) {
    const game = this.games.find(dto.gameId);
    if (!game) throw new ApiError(404, "Game not found");
    if (!game.builtin && !game.isPublic && game.ownerId !== bot.ownerId) throw new ApiError(403, "Game is private");
    return this.access.send(
      bot,
      dto.chatId,
      `🎮 ${game.title}`,
      { attachments: [{ kind: "game", meta: { gameId: game.id, title: game.title, emoji: game.emoji || "🎮", description: game.description || "" } }] },
      400
    );
  }

  public async sendSticker(bot: Bot, dto: SendStickerDto) {
    const { chatId, emoji, name, scene, replyToId } = dto;
    const chat = this.access.memberChat(bot, chatId);
    // Те же проверки, что у sendMessage: блокировка в личке и права в канале.
    await this.access.assertMayPost(bot, chat);
    const message = this.messages.create({
      id: timedId("m"),
      chatId: chat.id,
      senderId: bot.userId,
      type: "sticker",
      text: "",
      createdAt: new Date().toISOString(),
      replyToId: (replyToId as string | undefined) ?? null,
      sticker: { emoji, name, scene },
      readByIds: [],
    });
    this.realtime.broadcastToUsers(chat.memberIds, { type: "message:new", chatId: chat.id, message });
    return { message };
  }

  public react(bot: Bot, dto: SendReactionDto) {
    const target = this.messages.findById(dto.messageId);
    if (!target) throw new ApiError(404, "Message not found");
    const chat = this.access.memberChat(bot, target.chatId);
    const emoji = cleanReaction(dto.emoji);
    const message = emoji ? this.messages.mutate(target.id, (m) => toggleReaction(m, emoji, bot.userId, Infinity)) : this.messages.findById(target.id);
    this.realtime.broadcastToUsers(audienceOf(chat, target), { type: "message:updated", chatId: chat.id, message });
    return { message };
  }

  /** Удаление любого сообщения ботом-админом. */
  public deleteAny(bot: Bot, dto: MessageIdDto) {
    const target = this.messages.findById(dto.messageId);
    if (!target) throw new ApiError(404, "Message not found");
    const chat = this.access.adminChat(bot, target.chatId);
    this.remove(chat, target);
    return { ok: true };
  }

  public async forward(bot: Bot, dto: ForwardDto) {
    const source = this.messages.findById(dto.messageId);
    if (!source) throw new ApiError(404, "Message not found");
    const from = this.access.memberChat(bot, source.chatId);
    if (from.protectedBy?.length) throw new ApiError(403, "Forwarding is disabled in this chat");
    const to = this.access.memberChat(bot, dto.toChatId);
    await this.access.assertMayPost(bot, to);
    const message = this.messages.create({
      id: timedId("m"),
      chatId: to.id,
      senderId: bot.userId,
      type: source.type ?? "text",
      text: source.text ?? "",
      createdAt: new Date().toISOString(),
      attachments: source.attachments,
      // Подпись — как при пересылке людьми: анонимных админов и посты каналов не раскрываем.
      forwardedFrom: source.forwardedFrom ?? this.sender.forwardOrigin(from, source, bot.userId),
      readByIds: [],
    });
    uploadAccess().registerAttachments(to.id, message.attachments, { by: bot.userId });
    this.realtime.broadcastToUsers(to.memberIds, { type: "message:new", chatId: to.id, message });
    return { message };
  }

  public copy(bot: Bot, dto: CopyDto) {
    const source = this.messages.findById(dto.messageId);
    if (!source) throw new ApiError(404, "Message not found");
    const sourceChat = this.chats.findById(source.chatId);
    if (!sourceChat || !sourceChat.memberIds.includes(bot.userId)) throw new ApiError(404, "Bot is not a member of that chat");
    if (sourceChat.protectedBy?.length) throw new ApiError(403, "Copying is disabled in this chat");
    return this.access.send(bot, dto.chatId, source.text || "📎", { attachments: source.attachments });
  }

  public get(bot: Bot, query: MessageIdQueryDto) {
    const message = this.messages.findById(query.messageId);
    if (!message) throw new ApiError(404, "Message not found");
    this.access.memberChat(bot, message.chatId);
    return { message };
  }

  public list(bot: Bot, query: ChatMessagesQueryDto) {
    const chat = this.access.memberChat(bot, query.chatId);
    const page = this.messages.findPage(chat.id, bot.userId, undefined, { limit: query.limit, before: query.before, beforeId: null });
    return { messages: page.messages, hasMore: page.hasMore };
  }

  public search(bot: Bot, query: ChatMessagesQueryDto) {
    const chat = this.access.memberChat(bot, query.chatId);
    const { q } = query;
    if (!q) throw new ApiError(400, "q is required");
    const found = this.messages.listFeed(chat.id, bot.userId).filter((m) => (m.text ?? "").toLowerCase().includes(q));
    return { messages: found.slice(-50) };
  }

  public pinned(bot: Bot, query: ChatMessagesQueryDto) {
    const chat = this.access.memberChat(bot, query.chatId);
    return { messages: this.messages.listFeed(chat.id, bot.userId).filter((m) => m.pinned) };
  }

  public editKeyboard(bot: Bot, dto: EditKeyboardDto) {
    const found = this.access.ownMessage(bot, dto.messageId);
    const keyboard = botMessaging().normalizeKeyboard(dto.keyboard) ?? [];
    const message = this.messages.mutate(found.message.id, (m) => ({ ...m, keyboard: keyboard.length ? keyboard : undefined }));
    this.realtime.broadcastToUsers(audienceOf(found.chat, found.message), { type: "message:updated", chatId: found.chat.id, message });
    return { message };
  }

  public async schedule(bot: Bot, dto: ScheduleDto) {
    const chat = this.access.memberChat(bot, dto.chatId);
    if (!hasText(dto.text)) throw new ApiError(400, "text is required");
    // Те же права, что у немедленной отправки: в канал — только админом, заблокировавшему — нельзя.
    await this.access.assertMayPost(bot, chat);
    const when = new Date(dto.sendAt as string);
    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) throw new ApiError(400, "sendAt must be a future ISO date");
    const scheduled = this.scheduled.add({
      id: timedId("sm"),
      chatId: chat.id,
      senderId: bot.userId,
      text: dto.text.slice(0, 4000),
      attachments: undefined,
      replyToId: null,
      topicId: null,
      repeat: null,
      sendAt: when.toISOString(),
      createdAt: new Date().toISOString(),
    });
    return { scheduled };
  }

  public listScheduled(bot: Bot, query: ChatMessagesQueryDto) {
    const chat = this.access.memberChat(bot, query.chatId);
    return { scheduled: this.scheduled.listFor(chat.id, bot.userId) };
  }

  public cancelScheduled(bot: Bot, dto: CancelScheduledDto) {
    const item = this.scheduled.find(dto.scheduledId);
    if (!item || item.senderId !== bot.userId) throw new ApiError(404, "Not found");
    this.scheduled.remove(item.id);
    return { ok: true };
  }

  /** Пост в канал, где бот — админ: текст и/или картинка по ссылке. */
  public publishPost(bot: Bot, dto: PublishPostDto) {
    const chat = this.chats.findById(dto.chatId);
    if (!chat || chat.type !== "channel") throw new ApiError(404, "Channel not found");
    if (!(chat.adminIds ?? []).includes(bot.userId)) throw new ApiError(403, "Bot must be an admin of this channel");
    const { text, url } = dto;
    if (!text.trim() && !url) throw new ApiError(400, "text or url is required");
    const post = this.messages.create({
      id: genId("m"),
      chatId: chat.id,
      senderId: bot.userId,
      type: "text",
      text: text.slice(0, 4000),
      createdAt: new Date().toISOString(),
      attachments: url ? [{ kind: "image", url } as Attachment] : undefined,
      readByIds: [bot.userId],
      views: 0,
      commentCount: 0,
    });
    uploadAccess().registerAttachments(chat.id, post.attachments, { by: bot.userId });
    this.realtime.broadcastToUsers(chat.memberIds, { type: "message:new", chatId: chat.id, message: post });
    return { message: post };
  }

  /** Бот пишет человеку первым: не больше 20 новых разговоров в час, с учётом приватности. */
  public async messageToUser(bot: Bot, dto: MessageToUserDto) {
    const { username, userId, text, keyboard } = dto;
    const target = userId ? this.users.findById(userId) : this.users.findByUsername(username);
    if (!target) throw new ApiError(404, "Пользователь не найден");

    if (target.isBot) throw new ApiError(403, "Ботам боты не пишут");
    if (target.blockedUserIds?.includes(bot.userId)) throw new ApiError(403, "Пользователь заблокировал этого бота");
    if (!this.privacy.allowsUser(target.id, "botMessages", bot.userId)) throw new ApiError(403, "Пользователь ограничил ботам возможность писать первыми");

    const existing = this.chats.findDmBetween(bot.userId, target.id);
    if (!existing && !this.newDialogs.allow(bot.id)) throw new ApiError(429, `Не больше ${NEW_DIALOGS_PER_HOUR} новых разговоров в час`);

    const chat = existing ?? (await findOrCreateDm(bot.userId, target.id));
    const message = await botMessaging().sendBotMessage(bot.userId, chat.id, text, { keyboard });
    return { chatId: chat.id, message, user: publicUser(target) };
  }

  /** Удаление у всех: файлы, на которые больше никто не ссылается, перестают быть доступны. */
  private remove(chat: Chat, message: Message): void {
    const refs = this.messages.delete(message.id);
    if (refs) uploadAccess().revokeAttachments(refs.chatId, [{ url: refs.attachments ?? "" }, { url: refs.sticker ?? "" }]);
    this.realtime.broadcastToUsers(audienceOf(chat, message), { type: "message:deleted", chatId: chat.id, id: message.id, messageId: message.id });
  }
}
