import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { ChatAccessService } from "../chat-access.service.js";

// Маршруты /api/chats/:id/… секретного чата открываются только с привязанного к нему
// устройства (cookie device_id), иначе 404. Ставится после AuthGuard.
@Injectable()
export class SecretChatGuard implements CanActivate {
  public constructor(private readonly access: ChatAccessService) {}

  public canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const chatId = req.params.id;
    if (typeof chatId === "string") this.access.checkSecretDevice(chatId, req.uid!, req.cookies?.device_id);
    return true;
  }
}
