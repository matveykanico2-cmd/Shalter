import { Injectable } from "@nestjs/common";
import type { Request, Response } from "express";
import { PREMIUM_GRANT_DAYS, isAdminPhone } from "../../common/config/accounts.js";
import { ApiError } from "../../common/errors/api-error.js";
import { genId } from "../../common/lib/gen-id.js";
import { hashPassword, passwordMatches } from "../../common/lib/password.js";
import { EMAIL_RE, PHONE_RE, normalizeBirthday } from "../../common/lib/validators.js";
import { checkUsername, deleteAccount, findOrCreateDm, sendMail, sendMessageAndBroadcast } from "../../legacy/legacy.js";
import { SessionsRepository } from "../sessions/sessions.repository.js";
import { selfUser } from "../users/lib/user.presenter.js";
import { isUsernameConflict } from "../users/lib/username.js";
import type { User } from "../users/model/domain.js";
import { UsersRepository } from "../users/users.repository.js";
import type { ChangePasswordDto, EmailStartDto } from "./model/schemas/account.schema.js";
import type { RegisterEmailDto } from "./model/schemas/login.schema.js";
import { SessionCookiesService } from "./session-cookies.service.js";
import { SignInService } from "./sign-in.service.js";
import { AuthCodesStore } from "./stores/auth-codes.store.js";
import { TwoFactorTicketsStore } from "./stores/two-factor-tickets.store.js";
import { SystemNoticesService } from "./system-notices.service.js";

const DELETION_DELAY_DAYS = 7;

// Аккаунт: регистрация, пароль, почта, удаление.
@Injectable()
export class AccountService {
  public constructor(
    private readonly usersRepository: UsersRepository,
    private readonly sessionsRepository: SessionsRepository,
    private readonly sessionCookies: SessionCookiesService,
    private readonly signIn: SignInService,
    private readonly codes: AuthCodesStore,
    private readonly tickets: TwoFactorTicketsStore,
    private readonly notices: SystemNoticesService
  ) {}

  public async register(req: Request, res: Response, dto: RegisterEmailDto) {
    // Имя, почта и длина пароля проверены схемой.
    const { name, lastName: cleanLast, email, password, phone: normalizedPhone, username: handle, referralCode, birthday } = dto;
    const fullName = [name, cleanLast].filter(Boolean).join(" ");
    const usernameProblem = await checkUsername(handle);
    if (usernameProblem) throw new ApiError(usernameProblem.status, usernameProblem.error);
    if (!PHONE_RE.test(normalizedPhone)) throw new ApiError(400, "Введите номер телефона в формате +79991234567");
    if (this.usersRepository.findByEmail(email)) throw new ApiError(409, "Аккаунт с таким email уже существует");
    if (this.usersRepository.findByPhone(normalizedPhone)) throw new ApiError(409, "Аккаунт с таким номером телефона уже существует");
    // Номер не подтверждается, а админ определяется по номеру: регистрация на
    // админский номер возможна, только если явно разрешена в окружении.
    if (isAdminPhone(normalizedPhone) && process.env.ALLOW_ADMIN_PHONE_SIGNUP !== "1") {
      throw new ApiError(409, "Аккаунт с таким номером телефона уже существует");
    }

    const birthdayIso = birthday ? normalizeBirthday(birthday) : null;
    if (birthday && !birthdayIso) throw new ApiError(400, "Введите корректную дату рождения (ДД.ММ.ГГГГ)");

    let referrer: User | undefined;
    if (referralCode.trim()) {
      referrer = this.usersRepository.findByReferralCode(referralCode);
      if (!referrer) throw new ApiError(400, "Код друга не найден — проверьте и попробуйте снова");
    }

    const { hash, salt } = hashPassword(password);
    let user: User;
    try {
      user = this.usersRepository.create({
        id: genId("u"),
        name: fullName,
        username: handle,
        phone: normalizedPhone,
        email: email.trim().toLowerCase(),
        passwordHash: hash,
        passwordSalt: salt,
        avatarColor: "#2E56D9",
        bio: "",
        online: 1,
        lastSeen: new Date().toISOString(),
        referredBy: referrer?.id ?? null,
        premiumUntil: referrer ? new Date(Date.now() + PREMIUM_GRANT_DAYS * 86400000).toISOString() : null,
        birthday: birthdayIso,
      });
    } catch (err) {
      if (isUsernameConflict(err)) throw new ApiError(409, "Этот юзернейм уже занят");
      throw err;
    }

    if (cleanLast) user = this.usersRepository.update(user.id, { lastName: cleanLast })!;

    if (referrer) {
      this.usersRepository.grantPremiumDays(referrer.id, PREMIUM_GRANT_DAYS);
      await this.notifyReferralBonus(referrer.id, user);
    }

    this.sessionCookies.addAccount(req, res, user.id);
    await this.signIn.recordSession(req, res, user.id);
    return { user: selfUser(user) };
  }

  public async usernameAvailable(handle: string) {
    const problem = await checkUsername(handle);
    return { username: handle, available: !problem, error: problem?.error ?? null };
  }

  public verifyPassword(userId: string, password: string): void {
    const user = this.usersRepository.findById(userId);
    if (!passwordMatches(password, user?.passwordHash, user?.passwordSalt)) throw new ApiError(401, "Неверный пароль");
  }

  public async deleteAccount(req: Request, res: Response, userId: string, password: string) {
    this.verifyPassword(userId, password);
    await deleteAccount(userId);
    // Если на устройстве есть другие аккаунты — переключаемся на следующий.
    const remaining = this.sessionCookies.removeAccount(req, res, userId);
    return { ok: true, remaining };
  }

  public async changePassword(req: Request, res: Response, userId: string, { currentPassword, newPassword }: ChangePasswordDto): Promise<void> {
    const user = this.usersRepository.findById(userId);
    if (!passwordMatches(currentPassword, user?.passwordHash, user?.passwordSalt)) throw new ApiError(401, "Неверный текущий пароль");
    if (newPassword.length < 6) throw new ApiError(400, "Новый пароль — не короче 6 символов");
    if (newPassword === currentPassword) throw new ApiError(400, "Новый пароль совпадает со старым");

    const { hash, salt } = hashPassword(newPassword);
    this.usersRepository.update(userId, { passwordHash: hash, passwordSalt: salt });
    this.sessionsRepository.revokeOthers(userId, this.sessionCookies.getOrCreateDeviceId(req, res));
    await this.notices.notify(
      userId,
      "🔐 Пароль изменён. Все остальные сеансы завершены.\n\nЕсли это были не вы — восстановите доступ и включите двухфакторную аутентификацию: Настройки → Конфиденциальность.",
      "password change notice"
    );
  }

  public async startEmailChange(userId: string, dto: EmailStartDto) {
    const user = this.usersRepository.findById(userId);
    const { email } = dto;
    if (!passwordMatches(dto.password, user?.passwordHash, user?.passwordSalt)) throw new ApiError(401, "Неверный пароль");
    if (!EMAIL_RE.test(email)) throw new ApiError(400, "Введите корректный адрес почты");
    if (email === (user?.email ?? "").toLowerCase()) throw new ApiError(400, "Это уже ваш адрес");

    const taken = this.usersRepository.findByEmail(email);
    if (taken && taken.id !== userId) throw new ApiError(409, "Этот адрес уже привязан к другому аккаунту");

    // Адрес меняется только после кода из письма на него: на почту приходит
    // восстановление доступа, опечатка или чужой адрес отдали бы аккаунт.
    const code = this.codes.emailChange.start(userId, email);
    const mail = await sendMail({
      to: email,
      subject: "Подтвердите адрес почты в Shalter",
      text:
        `Код для привязки этого адреса к аккаунту Shalter: ${code}\n\nНикому не сообщайте его — даже сотрудникам Shalter. Действует 15 минут.\n\n` +
        `Если вы не меняли адрес почты — просто проигнорируйте письмо.`,
    }).catch((err: Error) => ({ delivered: false, reason: err.message }));
    if (!mail.delivered) throw new ApiError(502, "Не удалось отправить письмо на этот адрес — проверьте его и попробуйте ещё раз");
    return { ok: true, sent: true, email };
  }

  public async confirmEmailChange(userId: string, code: string) {
    const email = this.codes.emailChange.confirm(userId, code);
    if (!email) throw new ApiError(400, "Неверный или устаревший код");
    // За время ожидания кода адрес мог занять кто-то другой.
    const taken = this.usersRepository.findByEmail(email);
    if (taken && taken.id !== userId) throw new ApiError(409, "Этот адрес уже привязан к другому аккаунту");

    const updated = this.usersRepository.update(userId, { email })!;
    await this.notices.notify(userId, `📧 Адрес почты изменён на ${email}.\n\nЕсли это были не вы — немедленно смените пароль.`, "email change notice");
    return { user: selfUser(updated), changed: true };
  }

  // Удаление через неделю — со второго шага входа, когда второй фактор потерян.
  public async scheduleDeletion(ticket: string | undefined) {
    const entry = this.tickets.peek(ticket);
    if (!entry) throw new ApiError(400, "Время на подтверждение истекло — войдите заново");
    const user = this.usersRepository.findById(entry.userId);
    if (!user) throw new ApiError(400, "Аккаунт не найден");

    const deleteAt = new Date(Date.now() + DELETION_DELAY_DAYS * 24 * 60 * 60 * 1000).toISOString();
    this.usersRepository.scheduleDeletion(user.id, deleteAt);
    this.tickets.consume(ticket);
    const when = new Date(deleteAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
    await this.notices.notify(
      user.id,
      `⚠️ Запрошено удаление аккаунта — он будет удалён ${when}. Если передумаете, просто войдите в аккаунт до этой даты — удаление отменится.`,
      "deletion notice"
    );
    return { deleteAt };
  }

  public async cancelDeletion(ticket: string | undefined) {
    const entry = this.tickets.peek(ticket);
    if (!entry) throw new ApiError(400, "Время на подтверждение истекло — войдите заново");
    const user = this.usersRepository.findById(entry.userId);
    if (!user) throw new ApiError(400, "Аккаунт не найден");

    this.usersRepository.cancelDeletion(user.id);
    await this.notices.notify(user.id, "✅ Удаление аккаунта отменено.", "deletion cancel notice");
    return { ok: true };
  }

  private async notifyReferralBonus(referrerId: string, newUser: User): Promise<void> {
    try {
      const chat = await findOrCreateDm(referrerId, newUser.id);
      await sendMessageAndBroadcast(
        chat,
        newUser.id,
        `🎉 Я зарегистрировался(ась) в Shalter по вашему коду приглашения! Нам обоим начислен Shalter Premium.`
      );
    } catch (err) {
      console.error("referral notification failed:", err);
    }
  }
}
