import { CanActivate, createParamDecorator, ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { ApiError } from "../../../common/errors/api-error.js";
import { BotsRepository } from "../bots.repository.js";
import type { Bot } from "../model/domain.js";

declare global {
  namespace Express {
    interface Request {
      /** Бот, чей токен Bot API пришёл в Authorization (BotTokenGuard). */
      bot?: Bot;
    }
  }
}

// Bot API: Authorization: Bearer <токен бота>. Без токена или с чужим — 401, как
// requireBotToken в server/middleware/botAuth.js.
@Injectable()
export class BotTokenGuard implements CanActivate {
  public constructor(private readonly bots: BotsRepository) {}

  public canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) throw new ApiError(401, "Missing Authorization: Bearer <token>");
    const bot = this.bots.findByToken(token);
    if (!bot) throw new ApiError(401, "Invalid bot token");
    req.bot = bot;
    return true;
  }
}

/** Бот, которого проверил BotTokenGuard. */
export const CurrentBot = createParamDecorator((_data: unknown, context: ExecutionContext): Bot => {
  return context.switchToHttp().getRequest<Request>().bot!;
});
