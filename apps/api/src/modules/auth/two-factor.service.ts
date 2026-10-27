import { Injectable } from "@nestjs/common";
import type { Request, Response } from "express";
import { ApiError } from "../../common/errors/api-error.js";
import { hashPassword, passwordMatches, verifyPassword } from "../../common/lib/password.js";
import { normalizePhone } from "../../common/lib/validators.js";
import { SessionsRepository } from "../sessions/sessions.repository.js";
import { selfUser } from "../users/lib/user.presenter.js";
import type { User } from "../users/model/domain.js";
import { UsersRepository } from "../users/users.repository.js";
import { generateRecoveryCodes, generateSecret, hashRecoveryCode, matchStep, otpauthUri } from "./lib/totp.js";
import type { CloudPasswordDto } from "./model/schemas/two-factor.schema.js";
import { SessionCookiesService } from "./session-cookies.service.js";
import { SignInService } from "./sign-in.service.js";
import { AuthCodesStore } from "./stores/auth-codes.store.js";
import { TotpStepsStore } from "./stores/totp-steps.store.js";
import { TwoFactorTicketsStore } from "./stores/two-factor-tickets.store.js";
import { SystemNoticesService } from "./system-notices.service.js";

const MIN_CLOUD_PASSWORD = 6;

// Второй шаг входа. Три способа: код из приложения-аутентификатора (totp), код в чат
// «Shalter» (chat) и облачный пароль (password).
@Injectable()
export class TwoFactorService {
  public constructor(
    private readonly usersRepository: UsersRepository,
    private readonly sessionsRepository: SessionsRepository,
    private readonly sessionCookies: SessionCookiesService,
    private readonly signIn: SignInService,
    private readonly tickets: TwoFactorTicketsStore,
    private readonly codes: AuthCodesStore,
    private readonly totpSteps: TotpStepsStore,
    private readonly notices: SystemNoticesService
  ) {}

  public status(userId: string) {
    const me = this.me(userId);
    return {
      enabled: !!me.twoFactorEnabled,
      method: me.twoFactorMethod ?? "totp",
      pending: !!me.totpSecret && !me.totpEnabledAt,
      cloudPasswordHint: me.twoFactorMethod === "password" ? me.cloudPasswordHint || "" : "",
      recoveryCodesLeft: me.twoFactorEnabled ? (me.totpRecoveryCodes ?? []).length : 0,
      enabledAt: me.totpEnabledAt ?? null,
    };
  }

  public async setup(userId: string, method: "chat" | "totp") {
    const me = this.me(userId);
    if (me.twoFactorEnabled) throw new ApiError(400, "Двухфакторная аутентификация уже включена");
    if (method === "chat") {
      this.usersRepository.startChatTwoFactor(userId);
      await this.signIn.sendTwoFactorCode(userId);
      return { method: "chat" };
    }
    const secret = generateSecret();
    this.usersRepository.startTotpSetup(userId, secret);
    this.totpSteps.forget(userId);
    return { method: "totp", secret, otpauthUri: otpauthUri(secret, me.username || me.phone || me.name) };
  }

  // Повторный код в чат: и для входа по билету, и для настройки вошедшим.
  public async sendCode(req: Request, ticket: string | undefined): Promise<void> {
    const ticketEntry = ticket ? this.tickets.peek(ticket) : null;
    const uid = ticketEntry?.userId ?? this.sessionCookies.currentUserId(req);
    if (!uid) throw new ApiError(401, this.sessionCookies.noSessionError(req));
    const me = this.me(uid);
    if ((me.twoFactorMethod ?? "totp") !== "chat") {
      throw new ApiError(
        400,
        me.twoFactorMethod === "password"
          ? "Этот аккаунт подтверждает вход облачным паролем"
          : "Этот аккаунт подтверждает вход кодом из приложения-аутентификатора"
      );
    }
    await this.signIn.sendTwoFactorCode(uid);
  }

  public async setCloudPassword(req: Request, userId: string, dto: CloudPasswordDto) {
    const me = this.me(userId);
    if (!passwordMatches(dto.accountPassword, me.passwordHash, me.passwordSalt)) throw new ApiError(403, "Неверный пароль от аккаунта");
    if (me.twoFactorMethod === "password" && me.cloudPasswordHash) {
      if (!verifyPassword(dto.currentPassword, me.cloudPasswordHash, me.cloudPasswordSalt!)) {
        throw new ApiError(403, "Неверный текущий облачный пароль");
      }
    }
    if (me.twoFactorEnabled && me.twoFactorMethod !== "password") {
      throw new ApiError(400, "Сначала отключите текущий способ подтверждения входа");
    }

    const { password } = dto;
    if (password.length < MIN_CLOUD_PASSWORD) throw new ApiError(400, `Облачный пароль — не короче ${MIN_CLOUD_PASSWORD} знаков`);
    if (password === dto.accountPassword) {
      throw new ApiError(400, "Облачный пароль должен отличаться от пароля аккаунта — иначе второй шаг ничего не добавляет");
    }
    const { hint } = dto;
    if (hint && hint.toLowerCase() === password.toLowerCase()) {
      throw new ApiError(400, "Подсказка не должна повторять сам пароль — её видно до входа");
    }

    const { hash, salt } = hashPassword(password);
    this.usersRepository.update(userId, { cloudPasswordHash: hash, cloudPasswordSalt: salt, cloudPasswordHint: hint || null, twoFactorMethod: "password" });
    try {
      this.sessionsRepository.revokeOthers(userId, this.sessionCookies.deviceId(req) ?? null);
    } catch {}

    const saved = this.usersRepository.findById(userId);
    if (!saved?.twoFactorEnabled || saved.twoFactorMethod !== "password") {
      throw new ApiError(500, "Не удалось включить облачный пароль — попробуйте ещё раз");
    }
    // Как у TOTP и кода из чата: о включении (не о смене пароля) сообщаем в чат «Shalter».
    if (!me.twoFactorEnabled) await this.notifyChange(userId, true);
    return { ok: true, enabled: true, method: saved.twoFactorMethod, hint: saved.cloudPasswordHint || null };
  }

  public async disableCloudPassword(userId: string, password: string) {
    const me = this.me(userId);
    if (me.twoFactorMethod !== "password" || !me.cloudPasswordHash) throw new ApiError(400, "Облачный пароль не установлен");
    if (!verifyPassword(password, me.cloudPasswordHash, me.cloudPasswordSalt!)) throw new ApiError(403, "Неверный облачный пароль");
    this.usersRepository.update(userId, { cloudPasswordHash: null, cloudPasswordSalt: null, cloudPasswordHint: null });
    // Способ сбрасывается, как и при отключении через /2fa/disable.
    this.usersRepository.disableTotp(userId);
    await this.notifyChange(userId, false);
    return { ok: true, enabled: false };
  }

  // Подсказка облачного пароля на втором шаге входа.
  public hint(ticket: string | undefined) {
    const entry = ticket ? this.tickets.peek(ticket) : null;
    if (!entry) throw new ApiError(400, "Срок ожидания истёк — войдите заново");
    const user = this.usersRepository.findById(entry.userId);
    if (!user || user.twoFactorMethod !== "password") return { hint: null };
    return { hint: user.cloudPasswordHint || null };
  }

  public async enable(userId: string, code: string) {
    const me = this.me(userId);
    if (me.twoFactorEnabled) throw new ApiError(400, "Двухфакторная аутентификация уже включена");
    const byChat = me.twoFactorMethod === "chat";
    if (!byChat && !me.totpSecret) throw new ApiError(400, "Сначала отсканируйте QR-код");
    const confirmedByPhone = byChat && !!me.phone && normalizePhone(code) === normalizePhone(me.phone);
    if (!confirmedByPhone && !this.verifySecondFactor(me, code)) {
      throw new ApiError(
        400,
        byChat
          ? "Неверный код или номер — введите код из чата либо номер телефона аккаунта"
          : "Неверный код — проверьте, что время на устройстве точное, и попробуйте снова"
      );
    }

    const recoveryCodes = generateRecoveryCodes();
    this.usersRepository.enableTotp(userId, recoveryCodes.map(hashRecoveryCode));
    await this.notifyChange(userId, true);
    return { enabled: true, recoveryCodes };
  }

  public async disable(userId: string, code: string) {
    const me = this.me(userId);
    if (!me.twoFactorEnabled) {
      this.usersRepository.disableTotp(userId);
      return { enabled: false };
    }

    if (me.twoFactorMethod === "password") {
      if (!verifyPassword(code, me.cloudPasswordHash!, me.cloudPasswordSalt!)) throw new ApiError(400, "Неверный облачный пароль");
      this.usersRepository.update(userId, { cloudPasswordHash: null, cloudPasswordSalt: null, cloudPasswordHint: null });
      this.usersRepository.disableTotp(userId);
      await this.notifyChange(userId, false);
      return { enabled: false };
    }

    // Проверяем тем же способом, каким вход подтверждается: код из чата или из приложения-аутентификатора.
    const ok = this.verifySecondFactor(me, code) || (!!code.trim() && this.usersRepository.consumeRecoveryCode(userId, hashRecoveryCode(code.trim())));
    if (!ok) throw new ApiError(400, me.twoFactorMethod === "chat" ? "Неверный код — введите код из чата или код восстановления" : "Неверный код");

    this.usersRepository.disableTotp(userId);
    await this.notifyChange(userId, false);
    return { enabled: false };
  }

  // Второй шаг входа: код (или код восстановления) по билету из первого шага; код уже без пробелов по краям.
  public async login(req: Request, res: Response, ticket: string, cleaned: string) {
    const expired = "Время на ввод кода истекло — войдите заново";
    const entry = this.tickets.peek(ticket);
    if (!entry) throw new ApiError(400, expired);
    const user = this.usersRepository.findById(entry.userId);
    if (!user) throw new ApiError(400, expired);
    const ok = this.verifySecondFactor(user, cleaned) || this.usersRepository.consumeRecoveryCode(user.id, hashRecoveryCode(cleaned));
    if (!ok) {
      const attemptsLeft = this.tickets.countFailure(ticket);
      throw new ApiError(
        400,
        attemptsLeft > 0
          ? `${user.twoFactorMethod === "password" ? "Неверный облачный пароль" : "Неверный код"}. Осталось попыток: ${attemptsLeft}`
          : "Слишком много неверных кодов — войдите заново",
        { attemptsLeft }
      );
    }

    this.tickets.consume(ticket);
    const alreadyLinked = await this.signIn.openSession(req, res, user.id);
    return { user: selfUser(user), alreadyLinked };
  }

  // Вошедший пользователь; удалённый между запросами — 401.
  private me(userId: string): User {
    const me = this.usersRepository.findById(userId);
    if (!me) throw new ApiError(401, "unauthorized");
    return me;
  }

  private verifySecondFactor(user: User, rawCode: string): boolean {
    if (user.twoFactorMethod === "password") return passwordMatches(rawCode, user.cloudPasswordHash, user.cloudPasswordSalt);
    const cleaned = rawCode.trim();
    if (user.twoFactorMethod === "chat") return !!this.codes.chat.confirm(user.id, cleaned);
    // Код из приложения одноразовый: принятый шаг повторно не засчитывается.
    const step = matchStep(user.totpSecret, cleaned);
    return step !== null && this.totpSteps.claim(user.id, step);
  }

  // Оповещение в чат «Shalter» о включении/отключении второго шага — для всех способов.
  private async notifyChange(userId: string, enabled: boolean): Promise<void> {
    await this.notices.notify(
      userId,
      enabled
        ? "🔐 На вашем аккаунте включена двухфакторная аутентификация. Если это были не вы — немедленно смените пароль."
        : "🔓 Двухфакторная аутентификация отключена. Если это были не вы — срочно смените пароль.",
      `2fa ${enabled ? "enable" : "disable"} notification`,
      { botFirst: true }
    );
  }
}
