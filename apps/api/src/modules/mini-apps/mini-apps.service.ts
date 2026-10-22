import { Injectable } from "@nestjs/common";
import { getBotByUserId } from "../../legacy/legacy.js";
import { UsersRepository } from "../users/users.repository.js";
import { miniAppPage } from "./lib/mini-app-page.js";

// Мини-приложения ботов (/app/:username) — как server/routes/miniAppHost.js.
@Injectable()
export class MiniAppsService {
  public constructor(private readonly users: UsersRepository) {}

  /** HTML приложения бота; null — у бота с таким ником приложения нет. */
  public async page(username: string): Promise<string | null> {
    const botUser = this.users.findByUsername(username.replace(/^@/, ""));
    const bot = botUser ? await getBotByUserId(botUser.id) : null;
    if (!bot?.appCode) return null;
    return miniAppPage(bot, botUser);
  }
}
