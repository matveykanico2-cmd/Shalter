import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { isSafeUrl, usesForeignUpload } from "../../legacy/legacy.js";
import { ChatsRepository } from "../chats/chats.repository.js";
import { MessagesRepository } from "../messages/messages.repository.js";
import { publicUser } from "../users/lib/user.presenter.js";
import { UserPrivacyService } from "../users/user-privacy.service.js";
import { UsersRepository } from "../users/users.repository.js";
import { BotsRepository } from "./bots.repository.js";
import { botApp, str } from "./lib/bot-api.js";
import { validateAppUrl, verifyInitData } from "./lib/mini-app.js";
import type { Bot, BotCommand } from "./model/domain.js";
import type { CheckWebAppDto, SetAvatarDto, SetCommandsDto, SetProfileDto, SetWebAppDto, UserQueryDto } from "./model/schemas/bot-api.schema.js";

const APP_CODE_MAX = 200_000;

// Bot API: сам бот (профиль, команды, мини-приложение) и сведения о людях (server/routes/botApi.js).
@Injectable()
export class BotApiProfileService {
  public constructor(
    private readonly bots: BotsRepository,
    private readonly users: UsersRepository,
    private readonly chats: ChatsRepository,
    private readonly messages: MessagesRepository,
    private readonly privacy: UserPrivacyService
  ) {}

  public me(bot: Bot, origin: string) {
    const user = this.users.findById(bot.userId)!;
    return { bot: publicUser(user), app: botApp(origin, bot, user) };
  }

  public commands(bot: Bot) {
    return { commands: bot.commands ?? [] };
  }

  public setCommands(bot: Bot, dto: SetCommandsDto) {
    const list: unknown[] = Array.isArray(dto.commands) ? dto.commands : [];
    const commands: BotCommand[] = (list as { command?: unknown; description?: unknown }[])
      .filter((c) => c && typeof c.command === "string" && c.command.trim())
      .slice(0, 50)
      .map((c) => ({
        command: (c.command as string).trim().replace(/^\//, "").slice(0, 32),
        description: str(c.description).slice(0, 120),
      }));
    const updated = this.bots.setCommands(bot.id, commands);
    return { commands: updated?.commands ?? commands };
  }

  public setProfile(bot: Bot, dto: SetProfileDto) {
    const { name, description } = dto;
    if (name !== undefined && String(name).trim()) this.users.updateProfile(bot.userId, { name: String(name).trim().slice(0, 80) });
    if (description !== undefined) this.bots.setDescription(bot.id, String(description).slice(0, 500));
    return { bot: publicUser(this.users.findById(bot.userId)!) };
  }

  public setAvatar(bot: Bot, dto: SetAvatarDto) {
    const image = dto.image;
    if (typeof image !== "string") throw new ApiError(400, "image is required (URL или data:-строка)");
    if (image && !isSafeUrl(image)) throw new ApiError(400, "Некорректная ссылка на файл");
    if (this.usesForeignUpload(bot, image, this.users.findById(bot.userId)?.avatarImage)) throw new ApiError(400, "Некорректная ссылка на файл");
    this.users.updateProfile(bot.userId, { avatarImage: image || null });
    return { bot: publicUser(this.users.findById(bot.userId)!) };
  }

  public setWebApp(bot: Bot, origin: string, dto: SetWebAppDto) {
    const checked = validateAppUrl(dto.url ?? "");
    if (checked.error !== undefined) throw new ApiError(400, checked.error);
    if (this.usesForeignUpload(bot, checked.url, bot.appUrl)) throw new ApiError(400, "Некорректная ссылка на файл");
    const name = str(dto.name).trim().slice(0, 40);
    const updated = this.bots.setApp(bot.id, checked.url, name)!;
    return { app: botApp(origin, updated, this.users.findById(bot.userId)) };
  }

  public setWebAppCode(bot: Bot, origin: string, dto: SetWebAppDto) {
    const code = str(dto.code);
    if (code.length > APP_CODE_MAX) throw new ApiError(400, "Страница длиннее 200 000 символов");
    const botUser = this.users.findById(bot.userId);
    if (code.trim() && !botUser?.username) throw new ApiError(409, "У бота нет юзернейма — по нему строится адрес приложения");
    if (this.usesForeignUpload(bot, code, bot.appCode)) throw new ApiError(400, "Некорректная ссылка на файл");
    const name = String(dto.name ?? bot.appName ?? "").trim().slice(0, 40);
    const updated = this.bots.setAppCode(bot.id, code.trim() ? code : null, name)!;
    return { app: botApp(origin, updated, botUser) };
  }

  /** Проверка initData, которые мини-приложение прислало своему серверу. */
  public checkWebAppData(bot: Bot, dto: CheckWebAppDto) {
    const result = verifyInitData(this.bots.token(bot.id), dto.initData ?? "");
    if (!result.ok) throw new ApiError(400, result.error, { ok: false });
    const user = result.user?.id ? this.users.findById(String(result.user.id)) : undefined;
    return { ok: true, user: user ? publicUser(user) : result.user, chatId: result.chatId, authDate: result.authDate, ageSec: result.ageSec };
  }

  public user(bot: Bot, query: UserQueryDto) {
    const user = this.users.findById(str(query.userId));
    if (!user) throw new ApiError(404, "User not found");
    return { user: this.privacy.publicUserFor(user, bot.userId) };
  }

  /** Статус — с учётом приватности lastSeen, как в getUser. */
  public userStatus(bot: Bot, query: UserQueryDto) {
    const user = this.users.findById(str(query.userId));
    if (!user) throw new ApiError(404, "User not found");
    const visible = this.privacy.publicUserFor(user, bot.userId);
    return { online: !!visible.online, lastSeen: visible.lastSeen ?? null };
  }

  public resolveUsername(bot: Bot, query: UserQueryDto) {
    const handle = str(query.username).trim().replace(/^@/, "");
    if (!handle) throw new ApiError(400, "username is required");
    const user = this.users.findByUsername(handle);
    if (user) return { kind: "user", user: this.privacy.publicUserFor(user, bot.userId) };
    const chat = this.chats.findByUsername(handle);
    if (chat) {
      return {
        kind: chat.type,
        chat: { id: chat.id, type: chat.type, title: chat.title, username: chat.username, memberCount: chat.memberIds.length },
      };
    }
    throw new ApiError(404, "Not found");
  }

  public commonChats(bot: Bot, query: UserQueryDto) {
    const user = this.users.findById(str(query.userId));
    if (!user) throw new ApiError(404, "User not found");
    const chats = this.chats.findForUser(bot.userId).filter((c) => c.memberIds.includes(user.id));
    return { chats: chats.map((c) => ({ id: c.id, type: c.type, title: c.title })) };
  }

  public stats(bot: Bot) {
    const chats = this.chats.findForUser(bot.userId);
    return {
      chats: chats.length,
      messagesSent: this.messages.countBySender(bot.userId),
      people: new Set(chats.flatMap((c) => c.memberIds).filter((id) => id !== bot.userId)).size,
    };
  }

  /**
   * Аватарка и страница приложения бота видны всем: файлы — только доступные боту или его
   * владельцу (сам бот загружать не умеет).
   */
  private usesForeignUpload(bot: Bot, value: unknown, previous: unknown): boolean {
    return usesForeignUpload(bot.userId, value, previous) && usesForeignUpload(bot.ownerId as string, value, previous);
  }
}
