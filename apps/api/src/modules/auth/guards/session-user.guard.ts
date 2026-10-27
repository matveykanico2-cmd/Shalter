import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { ApiError } from "../../../common/errors/api-error.js";
import { SessionCookiesService } from "../session-cookies.service.js";

// Есть живая сессия на этом устройстве: req.uid — текущий аккаунт, иначе 401. В отличие от
// AuthGuard, не закрывает доступ заблокированному и не обновляет время сеанса — так
// маршруты /api/auth/2fa работали в server/.
@Injectable()
export class SessionUserGuard implements CanActivate {
  public constructor(private readonly sessionCookies: SessionCookiesService) {}

  public canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const uid = this.sessionCookies.currentUserId(req);
    if (!uid) throw new ApiError(401, this.sessionCookies.noSessionError(req));
    req.uid = uid;
    return true;
  }
}
