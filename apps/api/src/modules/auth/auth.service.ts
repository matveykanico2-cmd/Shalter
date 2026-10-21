import { Injectable } from "@nestjs/common";
import type { Request } from "express";
import { ApiError } from "../../common/errors/api-error.js";
import { SessionsRepository } from "../sessions/sessions.repository.js";
import { UsersRepository } from "../users/users.repository.js";
import { SessionCookiesService } from "./session-cookies.service.js";

@Injectable()
export class AuthService {
  public constructor(
    private readonly sessionCookies: SessionCookiesService,
    private readonly sessionsRepository: SessionsRepository,
    private readonly usersRepository: UsersRepository
  ) {}

  // Кто вошёл — как requireUserId в server/middleware/auth.js: 401 без живой сессии,
  // 403 banned для заблокированного. Время и адрес сеанса обновляются не чаще раза
  // в минуту или при смене адреса.
  public authenticate(req: Request): string {
    const uid = this.sessionCookies.currentUserId(req);
    if (!uid) throw new ApiError(401, this.sessionCookies.noSessionError(req));
    const deviceId = this.sessionCookies.deviceId(req)!;
    const session = this.sessionsRepository.get(uid, deviceId);
    const ip = req.ip || "";
    const stale = Date.now() - Date.parse(session?.lastActive || "0") > 60_000;
    const ipChanged = !!ip && !!session?.location && session.location !== ip;
    if (stale || ipChanged) {
      try {
        this.sessionsRepository.touch(uid, deviceId, ip);
      } catch {}
    }
    // Заблокированный входит в аккаунт, но всё, кроме экрана блокировки, ему закрыто:
    // клиент по этому ответу показывает причину и сколько осталось.
    const ban = this.usersRepository.activeBan(uid);
    if (ban) throw new ApiError(403, "banned", { ...ban });
    return uid;
  }
}
