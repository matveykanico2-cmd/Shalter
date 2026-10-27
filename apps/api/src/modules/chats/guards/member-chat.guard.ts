import { CanActivate, createParamDecorator, ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { ChatAccessService } from "../chat-access.service.js";
import type { Chat } from "../model/domain.js";

declare global {
  namespace Express {
    interface Request {
      /** Чат из пути, в котором состоит пользователь (MemberChatGuard). */
      chat?: Chat;
    }
  }
}

// Маршрут /api/chats/:id/… только для участников чата, иначе 404 — как будто чата нет.
// Чат достаётся обработчику через @CurrentChat(). Ставится после AuthGuard.
@Injectable()
export class MemberChatGuard implements CanActivate {
  public constructor(private readonly access: ChatAccessService) {}

  public canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    req.chat = this.access.memberChat(String(req.params.id), req.uid!);
    return true;
  }
}

/** Чат, который проверил MemberChatGuard. */
export const CurrentChat = createParamDecorator((_data: unknown, context: ExecutionContext): Chat => {
  return context.switchToHttp().getRequest<Request>().chat!;
});
