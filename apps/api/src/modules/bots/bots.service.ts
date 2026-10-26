import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { genId } from "../../common/lib/gen-id.js";
import {
  botMessaging,
  findOrCreateDm,
  isSafeUrl,
  push,
  responders,
  sendMessageAndBroadcast,
  usesForeignUpload,
  checkUsername,
  type LegacyBot,
} from "../../legacy/legacy.js";
import { ChatsRepository } from "../chats/chats.repository.js";
import { isQuietNow } from "../users/lib/settings.defaults.js";
import { publicUser } from "../users/lib/user.presenter.js";
import { normalizeUsername } from "../users/lib/username.js";
import type { ProfilePatch } from "../users/model/domain.js";
import { UserSettingsService } from "../users/user-settings.service.js";
import { UsersRepository } from "../users/users.repository.js";
import { BotsRepository } from "./bots.repository.js";
import { generateBotUsername } from "./lib/bot-username.js";
import { buildAppUrl, buildInitData, sameApp, validateAppUrl } from "./lib/mini-app.js";
import type { Bot } from "./model/domain.js";
import type { AppDataDto, BroadcastDto, CommandsDto, CreateBotDto, OpenAppDto, PatchBotDto } from "./model/schemas/bot.schema.js";
import { BroadcastCooldownStore } from "./stores/broadcast-cooldown.store.js";

const BOT_NAME_MAX = 60;
const BROADCAST_MAX_TEXT = 4096;
const APP_CODE_MAX = 200_000;
const APP_DATA_LIMIT = 4096;

// Аватар бота — ссылка http(s), data: или загрузка; пустое значение — без аватара.
const badAvatar = (value: unknown) => value != null && value !== "" && !isSafeUrl(value);

// Боты пользователя (/api/bots) — как server/routes/bots.js: создание, правка, токен, рассылка,
// команды и открытие мини-приложения. Сам Bot API (по токену) — пока в server/.
@Injectable()
export class BotsService {
  public constructor(
    private readonly bots: BotsRepository,
    private readonly users: UsersRepository,
    private readonly chats: ChatsRepository,
    private readonly settings: UserSettingsService,
    private readonly cooldown: BroadcastCooldownStore
  ) {}

  public list(uid: string) {
    return { bots: this.bots.listByOwner(uid).map((b) => this.withUser(b)) };
  }

  public async create(uid: string, dto: CreateBotDto) {
    const { name, description } = dto;
    if (usesForeignUpload(uid, dto.avatarImage)) throw new ApiError(400, "Некорректная ссылка на файл");

    const botUsername = await generateBotUsername(name);
    if (!botUsername) throw new ApiError(409, "Не удалось подобрать свободный юзернейм для бота — измените имя");

    const userId = genId("bot");
    this.users.create({
      id: userId,
      name: name.trim().slice(0, BOT_NAME_MAX),
      username: botUsername,
      avatarColor: "#6E56C6",
      avatarImage: dto.avatarImage || null,
      bio: description,
      isBot: 1,
      online: 1,
      lastSeen: new Date().toISOString(),
    });
    const { bot, token } = this.bots.create({ userId, ownerId: uid, description });
    return { bot: this.withUser(bot), token };
  }

  public get(uid: string, id: string) {
    return { bot: this.withUser(this.ownedBot(uid, id)) };
  }

  public token(uid: string, id: string) {
    const token = this.bots.token(this.ownedBot(uid, id).id);
    if (!token) throw new ApiError(404, "Токен не найден");
    return { token };
  }

  public regenerateToken(uid: string, id: string) {
    return { token: this.bots.regenerateToken(this.ownedBot(uid, id).id) };
  }

  public delete(uid: string, id: string) {
    const bot = this.ownedBot(uid, id);
    this.bots.delete(bot.id);
    // Аккаунт бота тоже убираем — как при удалении аккаунта владельца (server/lib/deleteAccount.js).
    this.users.delete(bot.userId);
    return { ok: true };
  }

  /** Рассылка: одно сообщение всем, кто запустил бота. */
  public async broadcast(uid: string, id: string, dto: BroadcastDto) {
    const bot = this.ownedBot(uid, id);
    const { text } = dto;
    if (!text) throw new ApiError(400, "Введите текст рассылки");
    if (text.length > BROADCAST_MAX_TEXT) throw new ApiError(400, `Не длиннее ${BROADCAST_MAX_TEXT} символов`);
    const waitMs = this.cooldown.waitMs(bot.id);
    if (waitMs) throw new ApiError(429, `Следующую рассылку можно отправить через ${Math.ceil(waitMs / 1000)} с`);
    this.cooldown.start(bot.id);

    const botUser = this.users.findById(bot.userId);
    const notify = push();
    let sent = 0;
    for (const chatId of this.bots.dmChatIds(bot.userId)) {
      try {
        const chat = this.chats.findById(chatId);
        const recipientId = chat?.memberIds.find((m) => m !== bot.userId);
        const recipient = recipientId ? this.users.findById(recipientId) : null;
        if (!recipient || recipient.isBot || recipient.blockedUserIds?.includes(bot.userId)) continue;
        await botMessaging().sendBotMessage(bot.userId, chatId, text);
        sent += 1;
        const settings = this.settings.get(recipient.id);
        if (isQuietNow(settings, chatId)) continue;
        const body = settings.notifications?.previewText === false ? "Новое сообщение" : text.slice(0, 200);
        notify
          .sendPushToUser(
            recipient.id,
            { title: botUser?.name || "Бот", body, ...notify.pushAvatar(botUser), url: `/chat/${chatId}`, kind: "message", tag: `chat-${chatId}` },
            notify.MESSAGE_PUSH
          )
          .catch(() => {});
      } catch (err) {
        console.error("bot broadcast failed for", chatId, (err as Error).message);
      }
    }
    if (!sent) this.cooldown.clear(bot.id);
    return { ok: true, sent };
  }

  public async patch(uid: string, id: string, dto: PatchBotDto) {
    const bot = this.ownedBot(uid, id);
    const before = this.users.findById(bot.userId);
    if (
      (typeof dto.avatarImage === "string" && dto.avatarImage !== before?.avatarImage && badAvatar(dto.avatarImage)) ||
      usesForeignUpload(uid, [dto.avatarImage, dto.appCode, dto.appUrl], [before?.avatarImage, bot.appCode, bot.appUrl])
    ) {
      throw new ApiError(400, "Некорректная ссылка на файл");
    }

    const patch: ProfilePatch = {};
    if (dto.name?.trim()) patch.name = dto.name.trim().slice(0, BOT_NAME_MAX);
    if (typeof dto.avatarImage === "string") patch.avatarImage = dto.avatarImage || null;

    if (dto.username?.trim()) {
      const username = normalizeUsername(dto.username);
      if (!/_bot$/i.test(username)) throw new ApiError(400, "Юзернейм бота должен заканчиваться на _bot");
      const problem = await checkUsername(username, { forUserId: bot.userId });
      if (problem) throw new ApiError(problem.status, problem.error);
      patch.username = username;
    }

    if (Object.keys(patch).length) this.users.updateProfile(bot.userId, patch);

    const { appName } = dto;
    if (typeof dto.appCode === "string" && dto.appCode.trim()) {
      if (dto.appCode.length > APP_CODE_MAX) throw new ApiError(400, "Страница длиннее 200 000 символов");
      if (!this.users.findById(bot.userId)?.username) throw new ApiError(409, "У бота нет юзернейма — по нему строится адрес приложения");
      this.bots.setAppCode(bot.id, dto.appCode, appName);
    } else if (typeof dto.appUrl === "string") {
      const checked = validateAppUrl(dto.appUrl);
      if (checked.error !== undefined) throw new ApiError(400, checked.error);
      this.bots.setApp(bot.id, checked.url, appName);
    }

    const updated = dto.description === undefined ? this.bots.findById(bot.id) : this.bots.setDescription(bot.id, dto.description);
    return { bot: this.withUser(updated!) };
  }

  /** Подписанная ссылка на приложение бота; url — адрес с кнопки, только в пределах приложения. */
  public openApp(uid: string, id: string, origin: string, dto: OpenAppDto) {
    const bot = this.botWithApp(id);
    const botUser = this.users.findById(bot.userId);
    const baseUrl = bot.appCode ? `${origin}/app/${botUser?.username ?? ""}` : bot.appUrl!;

    const requested = dto.url;
    if (requested && !sameApp(baseUrl, requested)) throw new ApiError(403, "Кнопка ведёт за пределы приложения бота");

    const token = this.bots.token(bot.id);
    if (!token) throw new ApiError(409, "У бота нет токена — приложение нечем подписать");

    const chat = dto.chatId ? this.chats.findById(dto.chatId) : null;
    const sharedChat = chat && chat.memberIds.includes(uid) && chat.memberIds.includes(bot.userId) ? chat : null;

    const user = this.users.findById(uid)!;
    const initData = buildInitData({ token, user, chat: sharedChat, botUserId: bot.userId });

    return {
      url: buildAppUrl(requested || baseUrl, initData, { theme: dto.theme }),
      name: bot.appName || botUser?.name || "Приложение",
      botId: bot.userId,
    };
  }

  /** Данные из приложения уходят боту сообщением в личку. */
  public async appData(uid: string, id: string, dto: AppDataDto) {
    const bot = this.botWithApp(id);
    const { data } = dto;
    if (!data) throw new ApiError(400, "Пустые данные");
    if (data.length > APP_DATA_LIMIT) throw new ApiError(400, `Не длиннее ${APP_DATA_LIMIT} символов`);

    const chat = await findOrCreateDm(uid, bot.userId);
    const message = (await sendMessageAndBroadcast(chat, uid, data)) as { id: string; text: string; createdAt: string };

    if (bot.code?.trim()) {
      responders()
        .runBotCode(bot as LegacyBot, bot.code, { id: message.id, chatId: chat.id, senderId: uid, text: message.text, createdAt: message.createdAt })
        .catch((err) => console.error(`bot sandbox dispatch failed for ${bot.userId}:`, err));
    }

    return { ok: true, chatId: chat.id, message };
  }

  public setCommands(uid: string, id: string, dto: CommandsDto) {
    const bot = this.ownedBot(uid, id);
    return { bot: this.bots.setCommands(bot.id, dto.commands) };
  }

  /** Число собеседников бота и есть ли у него приложение — для карточки бота. */
  public audience(userId: string) {
    const bot = this.bots.findByUserId(userId);
    if (!bot) throw new ApiError(404, "Это не бот");
    return {
      users: this.bots.audienceCount(userId),
      app: bot.appUrl || bot.appCode ? { name: bot.appName || "Приложение" } : null,
    };
  }

  private ownedBot(uid: string, id: string): Bot {
    const bot = this.bots.findById(id);
    if (!bot || bot.ownerId !== uid) throw new ApiError(404, "not found");
    return bot;
  }

  private botWithApp(id: string): Bot {
    const bot = this.bots.findById(id);
    if (!bot) throw new ApiError(404, "Бот не найден");
    if (!bot.appUrl && !bot.appCode) throw new ApiError(404, "У этого бота нет приложения");
    return bot;
  }

  private withUser(bot: Bot) {
    const user = this.users.findById(bot.userId);
    return { ...bot, user: user && publicUser(user) };
  }
}
