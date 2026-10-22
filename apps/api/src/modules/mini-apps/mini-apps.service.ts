import { Injectable } from "@nestjs/common";
import { BotsRepository } from "../bots/bots.repository.js";
import { UsersRepository } from "../users/users.repository.js";
import { miniAppPage } from "./lib/mini-app-page.js";

// Мини-приложения ботов (/app/:username) — как server/routes/miniAppHost.js.
@Injectable()
export class MiniAppsService {
  public constructor(
    private readonly users: UsersRepository,
    private readonly bots: BotsRepository
  ) {}

  /** HTML приложения бота; null — у бота с таким ником приложения нет. */
  public page(username: string): string | null {
    const botUser = this.users.findByUsername(username.replace(/^@/, ""));
    const bot = botUser ? this.bots.findByUserId(botUser.id) : null;
    if (!bot?.appCode) return null;
    return miniAppPage(bot, botUser);
  }
}
