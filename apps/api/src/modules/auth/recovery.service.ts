import { Injectable } from "@nestjs/common";
import type { Request, Response } from "express";
import { ApiError } from "../../common/errors/api-error.js";
import { hashPassword } from "../../common/lib/password.js";
import { normalizePhone } from "../../common/lib/validators.js";
import { sendMail } from "../../legacy/legacy.js";
import { SessionsRepository } from "../sessions/sessions.repository.js";
import { selfUser } from "../users/lib/user.presenter.js";
import type { User } from "../users/model/domain.js";
import { UsersRepository } from "../users/users.repository.js";
import type { PairCheckDto, PairResetDto, PhoneResetDto } from "./model/schemas/recovery.schema.js";
import { SignInService, type LoginResult } from "./sign-in.service.js";
import { AuthCodesStore } from "./stores/auth-codes.store.js";
import { SystemNoticesService } from "./system-notices.service.js";

const RU_SHORT_DATETIME: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" };

function banError(user: User): string {
  return user.banReason
    ? `Аккаунт заблокирован администрацией Shalter. Причина: ${user.banReason}`
    : "Аккаунт заблокирован администрацией Shalter";
}

// Восстановление доступа без пароля: по паре «почта + телефон» с кодом из письма или по
// номеру с кодом в чат «Shalter». С двухфакторной оба способа закрыты.
@Injectable()
export class RecoveryService {
  public constructor(
    private readonly usersRepository: UsersRepository,
    private readonly sessionsRepository: SessionsRepository,
    private readonly signIn: SignInService,
    private readonly codes: AuthCodesStore,
    private readonly notices: SystemNoticesService
  ) {}

  public async checkPair(dto: PairCheckDto) {
    const user = this.findByPair(dto);
    // Почта и номер — не секреты: сбросить пароль можно только с кодом из письма на адрес аккаунта.
    const code = this.codes.pairRecovery.start(user.id, true);
    const mail = await sendMail({
      to: user.email!,
      subject: "Код для восстановления доступа к Shalter",
      text:
        `Код для смены пароля в Shalter: ${code}\n\nНикому не сообщайте его — даже сотрудникам Shalter. Действует 15 минут.\n\n` +
        `Если вы не запрашивали восстановление доступа — просто проигнорируйте письмо, пароль останется прежним.`,
    }).catch((err: Error) => ({ delivered: false, reason: err.message }));
    if (!mail.delivered) throw new ApiError(502, "Не удалось отправить письмо с кодом — попробуйте позже");
    return { ok: true, name: user.name };
  }

  public async resetByPair(req: Request, res: Response, dto: PairResetDto) {
    const user = this.findByPair(dto);
    if (!this.codes.pairRecovery.confirm(user.id, dto.code)) throw new ApiError(400, "Неверный или устаревший код из письма");

    const { hash, salt } = hashPassword(dto.password);
    this.usersRepository.update(user.id, { passwordHash: hash, passwordSalt: salt });
    this.sessionsRepository.revokeAll(user.id);

    const when = new Date().toLocaleString("ru-RU", RU_SHORT_DATETIME);
    await this.notices.notify(
      user.id,
      `🔐 Пароль изменён через восстановление по почте и номеру телефона (${when}). Все сеансы завершены.\n\nЕсли это были не вы — восстановите доступ и включите двухфакторную аутентификацию: Настройки → Конфиденциальность. С ней этот способ восстановления не работает.`,
      "pair recovery notice"
    );
    if (user.email) {
      sendMail({
        to: user.email,
        subject: "Пароль в Shalter изменён",
        text:
          `Пароль вашего аккаунта Shalter изменён ${when} через восстановление по адресу почты и номеру телефона.\n\n` +
          `Если это были не вы — войдите и смените пароль, а затем включите двухфакторную аутентификацию: Настройки → Конфиденциальность. С ней этот способ восстановления не работает.`,
      }).catch((err) => console.error("pair recovery mail failed:", err));
    }

    await this.signIn.openSession(req, res, user.id);
    return { user: selfUser(user) };
  }

  /** Номер уже приведён и проверен схемой. */
  public async startByPhone(phone: string) {
    // Нет такого номера — ответ тот же, что при отправке: номер не выдаёт, есть ли аккаунт.
    const user = this.usersRepository.findByPhone(phone);
    if (!user || user.isBanned) return { ok: true, sent: true };
    if (user.twoFactorEnabled) {
      throw new ApiError(409, "На аккаунте включена двухфакторная аутентификация — войдите с кодом из приложения или используйте код восстановления.");
    }

    const code = this.codes.chat.start(user.id, true);
    await this.notices.send(
      user.id,
      `🔢 Код для смены пароля: ${code}\n\nНикому не сообщайте его — даже сотрудникам Shalter. Действует 5 минут.\n\nЕсли вы не запрашивали смену пароля — просто не вводите код, пароль останется прежним.`
    );
    return { ok: true, sent: true };
  }

  public async resetByPhone(req: Request, res: Response, dto: PhoneResetDto): Promise<LoginResult> {
    const user = this.usersRepository.findByPhone(dto.phone);
    if (!user || !this.codes.chat.confirm(user.id, dto.code)) throw new ApiError(400, "Неверный или устаревший код");
    if (user.isBanned) throw new ApiError(403, banError(user));
    if (user.twoFactorEnabled) throw new ApiError(409, "На аккаунте включена двухфакторная аутентификация");

    const { hash, salt } = hashPassword(dto.password);
    this.usersRepository.update(user.id, { passwordHash: hash, passwordSalt: salt });
    this.sessionsRepository.revokeAll(user.id);
    await this.notices.notify(
      user.id,
      "🔐 Пароль изменён по коду из этого чата, все остальные сеансы завершены.\n\nЕсли это были не вы — смените пароль и включите двухфакторную аутентификацию: Настройки → Конфиденциальность.",
      "recovery notice"
    );
    return this.signIn.finishLogin(req, res, this.usersRepository.findById(user.id)!);
  }

  /** Почта и номер уже приведены и проверены схемой. */
  private findByPair({ email, phone }: { email: string; phone: string }): User {
    const user = this.usersRepository.findByEmail(email);
    if (!user || !user.phone || normalizePhone(user.phone) !== phone) throw new ApiError(400, "Почта и телефон не совпадают ни с одним аккаунтом");
    if (user.isBanned) throw new ApiError(403, banError(user));
    if (user.twoFactorEnabled) {
      throw new ApiError(
        409,
        "На аккаунте включена двухфакторная аутентификация — этот способ для него отключён. Войдите с кодом или используйте код восстановления."
      );
    }
    return user;
  }
}
