import { Injectable } from "@nestjs/common";
import type { Request, Response } from "express";
import { ApiError } from "../../common/errors/api-error.js";
import { parseUserAgent } from "../../common/lib/user-agent.js";
import { passwordMatches } from "../../common/lib/password.js";
import { sendMessagePush } from "../../legacy/legacy.js";
import { SessionsRepository } from "../sessions/sessions.repository.js";
import type { Session } from "../sessions/model/domain.js";
import { selfUser } from "../users/lib/user.presenter.js";
import type { User } from "../users/model/domain.js";
import { UsersRepository } from "../users/users.repository.js";
import type { TwoFactorChallenge } from "./model/domain.js";
import { SessionCookiesService } from "./session-cookies.service.js";
import { AuthCodesStore } from "./stores/auth-codes.store.js";
import { QrLoginsStore } from "./stores/qr-logins.store.js";
import { TwoFactorTicketsStore } from "./stores/two-factor-tickets.store.js";
import { SystemNoticesService } from "./system-notices.service.js";

const RU_SHORT_DATETIME: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" };

export type LoginResult = TwoFactorChallenge | { user: ReturnType<typeof selfUser>; alreadyLinked: boolean };

// Вход на устройство: проверка первого шага (пароль, код, QR), открытие сеанса и cookie
// аккаунтов. Сеанс — пара (аккаунт, device_id) в таблице sessions; с нового устройства
// приходит оповещение в чат «Shalter».
@Injectable()
export class SignInService {
  public constructor(
    private readonly usersRepository: UsersRepository,
    private readonly sessionsRepository: SessionsRepository,
    private readonly sessionCookies: SessionCookiesService,
    private readonly tickets: TwoFactorTicketsStore,
    private readonly codes: AuthCodesStore,
    private readonly qrLogins: QrLoginsStore,
    private readonly notices: SystemNoticesService
  ) {}

  public async loginWithEmail(req: Request, res: Response, email: string, password: string): Promise<LoginResult> {
    const user = this.usersRepository.findByEmail(email);
    if (!user || !passwordMatches(password, user.passwordHash, user.passwordSalt)) {
      throw new ApiError(401, "Неверный email или пароль");
    }
    return this.finishLogin(req, res, user);
  }

  /** phone и code уже приведены схемой: номер без пробелов и скобок, код без пробелов по краям. */
  public async startCodeLogin(phone: string): Promise<void> {
    const user = this.usersRepository.findByPhone(phone);
    if (!user) throw new ApiError(404, "Аккаунт с таким номером не найден");
    const code = this.codes.chat.start(user.id, true);
    await this.notices.send(
      user.id,
      `🔢 Код для входа в Shalter: ${code}\n\nНикому не сообщайте его — даже сотрудникам Shalter. Действует 5 минут.`
    );
  }

  public async verifyCodeLogin(req: Request, res: Response, phone: string, code: string): Promise<LoginResult> {
    const user = this.usersRepository.findByPhone(phone);
    if (!user || !this.codes.chat.confirm(user.id, code)) throw new ApiError(401, "Неверный или устаревший код");
    return this.finishLogin(req, res, user);
  }

  public startQrLogin(req: Request, res: Response): { token: string; loginUrl: string } {
    const token = this.qrLogins.createToken(this.sessionCookies.getOrCreateDeviceId(req, res));
    const origin = `${req.protocol}://${req.get("host")}`;
    return { token, loginUrl: `${origin}/qr-login?token=${token}` };
  }

  public async pollQrLogin(req: Request, res: Response, token: string) {
    const entry = this.qrLogins.getEntry(token);
    if (!entry) return { status: "expired" };
    if (!entry.confirmedUserId) return { status: "pending" };
    // QR-код виден на экране: войти по нему должно только то устройство, которое его показало.
    if (entry.deviceId !== this.sessionCookies.getOrCreateDeviceId(req, res)) return { status: "expired" };
    const consumed = this.qrLogins.consume(token);
    if (!consumed) return { status: "pending" };
    const user = this.usersRepository.findById(consumed.confirmedUserId!);
    if (!user) return { status: "expired" };
    await this.openSession(req, res, user.id);
    return { status: "confirmed", user: selfUser(user) };
  }

  public confirmQrLogin(token: string, userId: string): void {
    const result = this.qrLogins.confirm(token, userId);
    if (result === "expired") throw new ApiError(410, "QR-код устарел, обновите его на другом устройстве");
    if (result === "already-used") throw new ApiError(409, "Этот код уже использован");
  }

  // Кто вошёл на этом устройстве: текущий аккаунт и все подключённые.
  public sessionState(req: Request, res: Response) {
    const uid = this.sessionCookies.currentUserId(req);
    const ids = this.sessionCookies.sessionUserIds(req);
    const deviceId = this.sessionCookies.getOrCreateDeviceId(req, res);
    const revoked = new Set(ids.filter((id) => this.sessionsRepository.get(id, deviceId)?.revokedAt));
    const accounts = ids
      .filter((id) => !revoked.has(id))
      .map((id) => this.usersRepository.findById(id))
      .filter((u) => u !== undefined)
      .map(selfUser);
    if (!uid || revoked.has(uid)) return { user: null, accounts };
    const user = this.usersRepository.findById(uid);
    return { user: user ? selfUser(user) : null, accounts };
  }

  public async switchAccount(req: Request, res: Response, userId: string) {
    if (!this.sessionCookies.sessionUserIds(req).includes(userId)) {
      throw new ApiError(403, "Этот аккаунт не подключён на этом устройстве");
    }
    this.sessionCookies.switchAccount(req, res, userId);
    await this.recordSession(req, res, userId);
    const user = this.usersRepository.findById(userId);
    return { user: user ? selfUser(user) : null };
  }

  // Выход из аккаунта (по умолчанию текущего) на этом устройстве.
  public logout(req: Request, res: Response, requestedUid: string | undefined) {
    const uid = requestedUid ?? this.sessionCookies.currentUserId(req);
    if (!uid) return { ok: true, remaining: [] };
    // Сессию отзываем и на сервере: иначе сохранённые до выхода cookie продолжали бы работать.
    // Отзывается только пара (аккаунт, это устройство) — чужие устройства не трогаем.
    const deviceId = this.sessionCookies.deviceId(req);
    if (deviceId && this.sessionCookies.sessionUserIds(req).includes(uid)) this.sessionsRepository.revoke(uid, deviceId);
    const remaining = this.sessionCookies.removeAccount(req, res, uid);
    return { ok: true, remaining };
  }

  // Первый шаг пройден. С двухфакторной — билет на второй шаг (и код в чат, если способ
  // «код в чат»), без неё — сразу сеанс.
  public async finishLogin(req: Request, res: Response, user: User): Promise<LoginResult> {
    if (user.twoFactorEnabled) {
      const { ticket, expiresInSec } = this.tickets.create(user.id);
      const method = user.twoFactorMethod ?? "totp";
      if (method === "chat") await this.sendTwoFactorCode(user.id).catch((err) => console.error("2fa code send failed:", err));
      return {
        twoFactorRequired: true,
        ticket,
        expiresInSec,
        name: user.name,
        method,
        hint: method === "password" ? user.cloudPasswordHint || null : null,
        scheduledDeletionAt: user.scheduledDeletionAt ?? null,
      };
    }
    const alreadyLinked = await this.openSession(req, res, user.id);
    return { user: selfUser(user), alreadyLinked };
  }

  // Аккаунт добавляется на устройство и становится текущим, сеанс записывается. Вход
  // отменяет запланированное удаление аккаунта. true — аккаунт уже был на устройстве.
  public async openSession(req: Request, res: Response, userId: string): Promise<boolean> {
    const alreadyLinked = this.sessionCookies.addAccount(req, res, userId);
    try {
      this.usersRepository.cancelDeletion(userId);
    } catch {}
    await this.recordSession(req, res, userId);
    return alreadyLinked;
  }

  public async recordSession(req: Request, res: Response, userId: string): Promise<Session> {
    const deviceId = this.sessionCookies.getOrCreateDeviceId(req, res);
    const priorSessions = this.sessionsRepository.list(userId);
    const { session, isNewDevice } = this.sessionsRepository.upsert({
      userId,
      deviceId,
      device: parseUserAgent(req.headers["user-agent"]),
      location: req.ip || "неизвестно",
    });
    if (isNewDevice && priorSessions.length > 0) await this.sendLoginAlert(userId, session);
    return session;
  }

  // Код второго шага в чат «Shalter» и пушем: пока приложение свёрнуто (переключились
  // ввести код), WebSocket спит — без пуша код «не приходит».
  public async sendTwoFactorCode(userId: string): Promise<void> {
    const code = this.codes.chat.start(userId, true);
    const chat = await this.notices.send(
      userId,
      `🔢 Код подтверждения: ${code}\n\nНикому не сообщайте его — даже сотрудникам Shalter. Действует 5 минут.`
    );
    sendMessagePush(
      userId,
      { title: "Shalter", body: `Код подтверждения: ${code}. Никому его не сообщайте.`, url: `/chat/${chat.id}`, tag: "shalter-login-code" },
      { TTL: 5 * 60 }
    ).catch(() => {});
  }

  private async sendLoginAlert(userId: string, session: Session): Promise<void> {
    const when = new Date(session.lastActive).toLocaleString("ru-RU", RU_SHORT_DATETIME);
    await this.notices.notify(
      userId,
      `🔐 Выполнен вход в аккаунт с нового устройства.\n\n${session.device} · ${session.location} · ${when}\n\nЕсли это были не вы — Настройки → Устройства → Завершить сессию.`,
      "login alert"
    );
  }
}
