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

  // Аккаунт добавляется на устройство и становится текущим. true — он уже был здесь.
  public addAccount(req: Request, res: Response, userId: string): boolean {
    const ids = this.cookieUserIds(req);
    const alreadyLinked = ids.includes(userId);
    this.write(res, alreadyLinked ? ids : [...ids, userId], userId);
    return alreadyLinked;
  }

  // Переключение на другой аккаунт этого устройства (только с живой сессией).
  public switchAccount(req: Request, res: Response, userId: string): void {
    const ids = this.sessionUserIds(req);
    if (!ids.includes(userId)) return;
    this.write(res, ids, userId);
  }

  // Аккаунт убирается с устройства; текущим становится следующий. Возвращает оставшиеся.
  public removeAccount(req: Request, res: Response, userId: string): string[] {
    const next = this.cookieUserIds(req).filter((id) => id !== userId);
    const active = (req.cookies as Cookies)?.[ACTIVE_COOKIE];
    this.write(res, next, active === userId ? (next[0] ?? null) : (active ?? null));
    return next;
  }

  // Текст 401: аккаунт в cookie есть, но сессию завершили с другого устройства, —
  // «session_revoked», иначе — «unauthorized».
  public noSessionError(req: Request): "session_revoked" | "unauthorized" {
    return this.cookieUserIds(req).length > 0 ? "session_revoked" : "unauthorized";
  }

  private write(res: Response, ids: string[], active: string | null): void {
    if (ids.length === 0) {
      res.clearCookie(SESSIONS_COOKIE, COOKIE_OPTS);
      res.clearCookie(ACTIVE_COOKIE, COOKIE_OPTS);
      return;
    }
    res.cookie(SESSIONS_COOKIE, JSON.stringify(ids), COOKIE_OPTS);
    if (active) res.cookie(ACTIVE_COOKIE, active, COOKIE_OPTS);
    else res.clearCookie(ACTIVE_COOKIE, COOKIE_OPTS);
  }
}
