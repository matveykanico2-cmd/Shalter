import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { hashPassword } from "../../common/lib/password.js";
import { deleteAccount, moderateDeleteBot, moderateDeleteChat } from "../../legacy/legacy.js";
import { BotsRepository } from "../bots/bots.repository.js";
import { ChatsRepository } from "../chats/chats.repository.js";
import { MessagesRepository } from "../messages/messages.repository.js";
import { ProfileStatusesRepository } from "../profiles/profile-statuses.repository.js";
import { RealtimeService } from "../realtime/realtime.service.js";
import { REASON_LABELS } from "../reports/lib/report-reasons.js";
import type { Report } from "../reports/model/domain.js";
import { ReportsRepository } from "../reports/reports.repository.js";
import { SessionsRepository } from "../sessions/sessions.repository.js";
import { UsersRepository } from "../users/users.repository.js";
import { AdminAccessService } from "./admin-access.service.js";
import { DataExportsRepository } from "./data-exports.repository.js";
import { bannedLabel, isServiceAccount, userLabel } from "./lib/user-label.js";
import type {
  BanDto,
  BulkDeleteDto,
  DeleteUserDto,
  DeveloperDto,
  ChatLookupQuery,
  DirectoryQuery,
  LabelUserDto,
  ReasonDto,
  ResetPasswordDto,
  VerifyDto,
} from "./model/schemas/admin.schema.js";
import { SafetyLabelsRepository } from "./safety-labels.repository.js";

const BULK_DELETE_MAX = 100;
const DIRECTORY_LIMIT = 100;

/** «21.10.2026, 14:30» по Москве — для сообщения о блокировке. */
const formatBanUntil = (iso: string) =>
  new Date(iso).toLocaleString("ru-RU", { timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Причина действия модерации обязательна (обрезку до 500 символов делает схема). */
function requireReason(reason: string, error: string): string {
  if (!reason) throw new ApiError(400, error);
  return reason;
}

// Модерация (раздел «moderation», server/routes/admin.js): жалобы, блокировки, метки и
// галочки, удаление аккаунтов, ботов, групп и каналов, сброс пароля, каталог аккаунтов и чатов.
@Injectable()
export class AdminModerationService {
  public constructor(
    private readonly access: AdminAccessService,
    private readonly users: UsersRepository,
    private readonly chats: ChatsRepository,
    private readonly messages: MessagesRepository,
    private readonly bots: BotsRepository,
    private readonly reports: ReportsRepository,
    private readonly labels: SafetyLabelsRepository,
    private readonly statuses: ProfileStatusesRepository,
    private readonly sessions: SessionsRepository,
    private readonly exports: DataExportsRepository,
    private readonly realtime: RealtimeService,
  ) {}

  /** Группа, канал или бот по ссылке, @нику, id или коду приглашения. */
  public lookupChat(uid: string, query: ChatLookupQuery) {
    this.access.require(uid, "moderation");
    const tail = query.q.replace(/[?#].*$/, "").replace(/\/+$/, "").split("/").pop() ?? "";
    const handle = tail.replace(/^@/, "");
    const chat = this.chats.findById(tail) ?? this.chats.findByUsername(handle) ?? this.chats.findByInviteCode(tail);
    if (!chat || chat.type === "dm" || chat.type === "bot") {
      // Боты — это аккаунты: ищем по @username или id.
      const botUser = this.users.findByUsername(handle) ?? this.users.findById(tail);
      const bot = botUser?.isBot ? this.bots.findByUserId(botUser.id) : undefined;
      if (botUser && bot) {
        return {
          chat: {
            id: botUser.id,
            type: "bot",
            title: botUser.name,
            username: botUser.username || null,
            members: this.bots.dmChatIds(botUser.id).length,
            owner: this.ownerCard(bot.ownerId),
          },
        };
      }
      throw new ApiError(404, "Группа, канал или бот не найдены");
    }
    return {
      chat: {
        id: chat.id,
        type: chat.type,
        title: chat.title ?? (chat as { name?: string }).name ?? "",
        username: chat.username ?? null,
        members: chat.memberIds.length,
        owner: this.ownerCard(chat.ownerId),
      },
    };
  }

  public overview(uid: string) {
    this.access.require(uid, "moderation");
    return {
      openReports: this.reports.listOpen().map((r) => this.decorateReport(r)),
      banned: this.users.listBanned().map(bannedLabel),
      labeled: this.users.listLabeled().map((u) => ({ ...userLabel(u), safetyLabelAt: u.safetyLabelAt || null })),
      labels: this.labels.list(),
      statusCatalog: this.statuses.list(),
    };
  }

  public userReports(uid: string, id: string) {
    this.access.require(uid, "moderation");
    const target = this.access.target(id);
    return { user: bannedLabel(target), reports: this.reports.listAboutUser(target.id).map((r) => this.decorateReport(r)) };
  }

  /** Блокировка на срок (durationSec) или навсегда; снятие — banned: false. */
  public async ban(uid: string, id: string, dto: BanDto) {
    const admin = this.access.require(uid, "moderation");
    const target = this.access.target(id);
    if (target.id === admin.id) throw new ApiError(400, "Нельзя заблокировать самого себя");
    this.access.assertOutranks(admin, target);

    const { banned, reason, durationSec } = dto;
    if (banned && !reason) throw new ApiError(400, "Укажите причину блокировки — её увидит пользователь");
    if (Number.isNaN(durationSec)) throw new ApiError(400, "Срок блокировки — целое число секунд, не больше 10 лет");
    const until = banned && durationSec ? new Date(Date.now() + durationSec * 1000).toISOString() : null;

    const updated = (banned ? this.users.ban(target.id, reason, until) : this.users.unban(target.id))!;
    await this.access.notify(
      target.id,
      banned
        ? `🚫 Ваш аккаунт заблокирован администрацией Shalter${until ? ` до ${formatBanUntil(until)} (МСК)` : " навсегда"}.\nПричина: ${reason}`
        : "✅ Блокировка вашего аккаунта снята. Приносим извинения за неудобства.",
      "ban notification",
    );
    return { user: bannedLabel(updated) };
  }

  /** Метка («СКАМ», «Фейк»…) — действие модерации, как бан: на равных и старших нельзя. */
  public setLabel(uid: string, id: string, dto: LabelUserDto) {
    const admin = this.access.require(uid, "moderation");
    const target = this.access.target(id);
    if (target.id !== admin.id) this.access.assertOutranks(admin, target);
    const { label } = dto;
    if (label && !this.labels.findById(label)) throw new ApiError(400, "Неизвестная метка");
    const updated = this.users.setSafetyLabel(target.id, label)!;
    return { user: { ...userLabel(updated), safetyLabelAt: updated.safetyLabelAt || null } };
  }

  public async verifyUser(uid: string, id: string, dto: VerifyDto) {
    this.access.require(uid, "moderation");
    const target = this.access.target(id);
    const { verified } = dto;
    const updated = this.users.setVerified(target.id, verified)!;
    await this.access.notify(
      target.id,
      verified ? "✅ Ваш аккаунт верифицирован — рядом с именем появилась галочка." : "Отметка о верификации с вашего аккаунта снята.",
      "verify notice",
    );
    return { user: { ...userLabel(updated), isVerified: !!updated.isVerified } };
  }

  /** Статус «Разработчик» — вручную, высокая привилегия: раздел «server». */
  public setDeveloper(uid: string, id: string, dto: DeveloperDto) {
    this.access.require(uid, "server");
    const target = this.access.target(id);
    return { user: userLabel(this.users.setDeveloper(target.id, dto.developer)) };
  }

  /** Удаление бота за нарушение: бот и его аккаунт, владельцу — уведомление с причиной. */
  public async deleteBot(uid: string, botUserId: string, dto: ReasonDto) {
    this.access.require(uid, "moderation");
    const reason = requireReason(dto.reason, "Укажите причину — она попадёт в журнал и придёт владельцу");
    try {
      await moderateDeleteBot(botUserId, { adminId: uid, reason });
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status) throw new ApiError(status, (err as Error).message);
      throw err;
    }
    return { ok: true };
  }

  /** Массовое удаление групп, каналов и ботов с общей причиной; ошибка по одному не мешает остальным. */
  public async bulkDelete(uid: string, dto: BulkDeleteDto) {
    this.access.require(uid, "moderation");
    const reason = requireReason(dto.reason, "Укажите причину — она попадёт в журнал и придёт владельцам");
    const { items } = dto;
    if (!items.length) throw new ApiError(400, "Ничего не выбрано");
    if (items.length > BULK_DELETE_MAX) throw new ApiError(400, `Не больше ${BULK_DELETE_MAX} за раз`);

    const deleted = [];
    const failed = [];
    const seen = new Set<string>();
    for (const it of items as { id?: unknown; kind?: unknown }[]) {
      const id = typeof it?.id === "string" ? it.id : "";
      const kind = it?.kind;
      if (!id || seen.has(id) || (kind !== "group" && kind !== "channel" && kind !== "bot")) continue;
      seen.add(id);
      try {
        if (kind === "bot") {
          deleted.push(await moderateDeleteBot(id, { adminId: uid, reason }));
        } else {
          const chat = this.chats.findById(id);
          // Тип сверяем, чтобы «группой» нельзя было удалить личный чат.
          if (!chat || chat.type !== kind) throw Object.assign(new Error("Не найдено"), { status: 404 });
          deleted.push(await moderateDeleteChat(chat, { adminId: uid, reason }));
        }
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (!status) console.error("bulk moderation delete failed:", err);
        failed.push({ id, error: status ? (err as Error).message : "Не удалось удалить" });
      }
    }
    return { deleted, failed };
  }

  public verifyChat(uid: string, id: string, dto: VerifyDto) {
    this.access.require(uid, "moderation");
    const chat = this.chats.findById(id);
    if (!chat) throw new ApiError(404, "Чат не найден");
    if (chat.type === "dm") throw new ApiError(400, "Верифицировать можно группы, каналы и аккаунты");
    const updated = this.chats.update(chat.id, { isVerified: dto.verified })!;
    this.realtime.broadcastToUsers(updated.memberIds, { type: "chat:updated", chat: updated });
    return { chat: updated };
  }

  public async deleteUser(uid: string, id: string, dto: DeleteUserDto) {
    const admin = this.access.require(uid, "moderation");
    const target = this.access.target(id);
    if (target.id === uid) throw new ApiError(400, "Свой аккаунт удаляется в настройках — там же, где у всех");
    if (isServiceAccount(target.id)) throw new ApiError(400, "Служебные аккаунты Shalter удалять нельзя");
    this.access.assertOutranks(admin, target);
    this.access.assertConfirmed(target, dto.confirm);
    const reason = requireReason(dto.reason, "Укажите основание — оно попадёт в журнал");

    this.exports.log({
      adminId: uid,
      targetUserId: target.id,
      reason: `УДАЛЕНИЕ АККАУНТА @${target.username || target.id} (${target.name}): ${reason}`,
      messageCount: 0,
    });
    await deleteAccount(target.id);
    return { ok: true, deleted: { id: target.id, name: target.name, username: target.username } };
  }

  /** Новый пароль, по желанию — без 2FA; все сеансы завершаются, человеку пишет бот Shalter. */
  public async resetPassword(uid: string, id: string, dto: ResetPasswordDto) {
    const admin = this.access.require(uid, "moderation");
    const target = this.access.target(id);
    if (target.isBot) throw new ApiError(400, "У ботов нет пароля — им управляет владелец через токен");
    if (target.id !== uid) this.access.assertOutranks(admin, target);
    this.access.assertConfirmed(target, dto.confirm);
    const reason = requireReason(dto.reason, "Укажите основание — оно попадёт в журнал");
    const { password } = dto;
    if (password.length < 6) throw new ApiError(400, "Пароль — не короче 6 символов");

    const liftTwoFactor = dto.disableTwoFactor && !!target.twoFactorEnabled;
    this.exports.log({
      adminId: uid,
      targetUserId: target.id,
      reason: `СБРОС ПАРОЛЯ @${target.username || target.id} (${target.name})${liftTwoFactor ? " + СНЯТА 2FA" : ""}: ${reason}`,
      messageCount: 0,
    });

    const { hash, salt } = hashPassword(password);
    this.users.update(target.id, { passwordHash: hash, passwordSalt: salt });
    if (liftTwoFactor) this.users.disableTotp(target.id);
    this.sessions.revokeAll(target.id);

    await this.access.notify(
      target.id,
      `🔐 Администрация Shalter сбросила пароль вашего аккаунта.\nОснование: ${reason}\n\nВсе сеансы завершены.${liftTwoFactor ? "\nДвухфакторная аутентификация снята — включите её заново: Настройки → Конфиденциальность." : ""}\n\nЕсли вы этого не просили — немедленно смените пароль в настройках.`,
      "password reset notice",
    );
    return { ok: true, twoFactorLifted: liftTwoFactor };
  }

  /** Каталог аккаунтов, ботов, групп и каналов с поиском; первые 100 по алфавиту и сколько всего. */
  public directory(uid: string, query: DirectoryQuery) {
    this.access.require(uid, "moderation");
    const { type, q } = query;

    if (type === "users" || type === "bots") {
      const wantBot = type === "bots";
      let users = this.users.findAll().filter((u) => !!u.isBot === wantBot);
      if (q) {
        users = users.filter(
          (u) =>
            (u.name ?? "").toLowerCase().includes(q) ||
            (u.username ?? "").toLowerCase().includes(q) ||
            (u.phone ?? "").includes(q) ||
            (u.email ?? "").toLowerCase().includes(q),
        );
      }
      users.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
      const items = users.slice(0, DIRECTORY_LIMIT).map((u) => ({
        kind: wantBot ? "bot" : "user",
        id: u.id,
        name: u.name,
        username: u.username || null,
        phone: u.phone || null,
        email: u.email || null,
        isBanned: !!u.isBanned,
        isSystem: isServiceAccount(u.id),
      }));
      return { items, total: users.length };
    }

    const wanted = type === "channels" ? "channel" : "group";
    let chats = this.chats.findAll().filter((c) => c.type === wanted);
    if (q) chats = chats.filter((c) => (c.title ?? "").toLowerCase().includes(q) || (c.username ?? "").toLowerCase().includes(q));
    chats.sort((a, b) => (a.title ?? "").localeCompare(b.title ?? ""));
    const items = chats.slice(0, DIRECTORY_LIMIT).map((c) => ({
      kind: wanted,
      id: c.id,
      title: c.title || (c as { name?: string }).name || "",
      username: c.username || null,
      members: c.memberIds.length,
      isVerified: !!c.isVerified,
    }));
    return { items, total: chats.length };
  }

  private ownerCard(ownerId: string | null | undefined) {
    const owner = ownerId ? this.users.findById(ownerId) : undefined;
    return owner ? { id: owner.id, name: owner.name, username: owner.username || null } : null;
  }

  private decorateReport(r: Report) {
    const reporter = this.users.findById(r.reporterId);
    const subject = r.subjectUserId ? this.users.findById(r.subjectUserId) : undefined;
    let quoted: string | null = null;
    if (r.targetType === "message") {
      const m = this.messages.findById(r.targetId);
      quoted = m ? (m.text || "[вложение]").slice(0, 300) : "(сообщение удалено)";
    } else if (r.targetType === "chat") {
      const c = this.chats.findById(r.targetId);
      quoted = c ? c.title || "(без названия)" : "(чат удалён)";
    }
    return {
      id: r.id,
      at: r.createdAt,
      status: r.status,
      reason: r.reason,
      reasonLabel: REASON_LABELS[r.reason] ?? r.reason,
      details: r.details || null,
      targetType: r.targetType,
      quoted,
      reporter: userLabel(reporter, r.reporterId),
      subject: r.subjectUserId ? userLabel(subject, r.subjectUserId) : null,
    };
  }
}
