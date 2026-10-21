import { randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { CookieOptions, Request, Response } from "express";
import { SessionsRepository } from "../sessions/sessions.repository.js";

// Вход по cookie — тот же, что в server/middleware/auth.js (оба бэкенда читают и пишут
// одни cookie, пока вход не перенесён целиком): session_uids — список аккаунтов на
// устройстве, active_uid — текущий, device_id — случайный секрет устройства.
export const SESSIONS_COOKIE = "session_uids";
export const ACTIVE_COOKIE = "active_uid";
export const DEVICE_COOKIE = "device_id";
const COOKIE_OPTS: CookieOptions = { httpOnly: true, sameSite: "lax", path: "/", maxAge: 400 * 24 * 60 * 60 * 1000 };

type Cookies = Record<string, string | undefined> | undefined;

function parseIds(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const arr: unknown = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

@Injectable()
export class SessionCookiesService {
  public constructor(private readonly sessionsRepository: SessionsRepository) {}

  public deviceId(req: Request): string | undefined {
    return (req.cookies as Cookies)?.[DEVICE_COOKIE];
  }

  public getOrCreateDeviceId(req: Request, res: Response): string {
    let id = this.deviceId(req);
    if (!id) {
      id = randomBytes(12).toString("hex");
      res.cookie(DEVICE_COOKIE, id, COOKIE_OPTS);
    }
    return id;
  }

  // Cookie со списком аккаунтов не подписан — подделать его может кто угодно.
  // Поэтому аккаунт засчитывается, только если в базе есть живая сессия для пары
  // (пользователь, device_id): device_id — случайный httpOnly-cookie, его не угадать.
  public sessionUserIds(req: Request): string[] {
    const cookies = req.cookies as Cookies;
    const deviceId = cookies?.[DEVICE_COOKIE];
    if (!deviceId) return [];
    return parseIds(cookies?.[SESSIONS_COOKIE]).filter((id) => this.sessionsRepository.isActive(id, deviceId));
  }

  public currentUserId(req: Request): string | null {
    const ids = this.sessionUserIds(req);
    const active = (req.cookies as Cookies)?.[ACTIVE_COOKIE] ?? null;
    if (active && ids.includes(active)) return active;
    return ids[0] ?? null;
  }

  // Сырой список из cookie, без проверки — только для записи cookie обратно.
  public cookieUserIds(req: Request): string[] {
    return parseIds((req.cookies as Cookies)?.[SESSIONS_COOKIE]);
  }

  // Текст 401: аккаунт в cookie есть, но сессию завершили с другого устройства, —
  // «session_revoked», иначе — «unauthorized».
  public noSessionError(req: Request): "session_revoked" | "unauthorized" {
    return this.cookieUserIds(req).length > 0 ? "session_revoked" : "unauthorized";
  }
}
