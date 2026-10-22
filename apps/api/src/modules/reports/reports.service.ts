import { Injectable } from "@nestjs/common";
import { ADMIN_PHONES, SYSTEM_BOT_ID } from "../../common/config/accounts.js";
import { ApiError } from "../../common/errors/api-error.js";
import { hasAdminSection, outranks } from "../../common/lib/admin-access.js";
import { genId } from "../../common/lib/gen-id.js";
import { findOrCreateDm, messages as legacyMessages, moderateDeleteChat, sendMessageAndBroadcast, uploadAccess } from "../../legacy/legacy.js";
import { ChatsRepository } from "../chats/chats.repository.js";
import { setReportStatus } from "../messages/lib/message-edits.js";
import { MessagesRepository } from "../messages/messages.repository.js";
import { RealtimeService } from "../realtime/realtime.service.js";
import type { User } from "../users/model/domain.js";
import { UsersRepository } from "../users/users.repository.js";
import { REASON_LABELS, REASON_TO_LABEL, REASONS, responsibleUserId, targetSummary } from "./lib/report-reasons.js";
import type { CreateReportDto, ResolveReportDto } from "./model/schemas/report.schema.js";
import { ReportsRepository } from "./reports.repository.js";

// Жалобы: отправка и решение модератором прямо из сообщения-жалобы — как server/routes/reports.js.
@Injectable()
export class ReportsService {
  public constructor(
    private readonly reports: ReportsRepository,
    private readonly users: UsersRepository,
    private readonly chats: ChatsRepository,
    private readonly messages: MessagesRepository,
    private readonly realtime: RealtimeService
  ) {}

  public async create(uid: string, dto: CreateReportDto) {
    const { targetType, targetId, reason, details } = dto as Record<string, any>;
    if (!["user", "chat", "message"].includes(targetType)) throw new ApiError(400, "invalid target type");
    if (!REASONS.has(reason)) throw new ApiError(400, "invalid reason");

    let target: any;
    if (targetType === "user") target = this.users.findById(targetId);
    else if (targetType === "chat") {
      // На чужой закрытый чат по одному id жаловаться нельзя: ответ подтверждал бы,
      // что такой чат существует. Публичный можно — его видно и без вступления.
      target = this.chats.findById(targetId);
      if (target && !target.memberIds.includes(uid) && !target.isPublic) target = null;
    } else {
      target = this.messages.findById(targetId);
      if (target) {
        const chat = this.chats.findById(target.chatId);
        if (!chat || !chat.memberIds.includes(uid)) target = null;
      }
    }
    if (!target) throw new ApiError(404, "not found");
    if (targetType === "user" && targetId === uid) throw new ApiError(400, "Нельзя пожаловаться на себя");
    if (targetType === "message" && target.senderId === uid) throw new ApiError(400, "Нельзя пожаловаться на своё сообщение");

    const reporter = this.users.findById(uid)!;
    const subjectUserId = responsibleUserId(targetType, target);
    const report = this.reports.create({
      id: genId("rp"),
      reporterId: uid,
      targetType,
      targetId,
      subjectUserId,
      reason,
      details: (details ?? "").trim().slice(0, 2000),
      createdAt: new Date().toISOString(),
      status: "open",
    });

    // Жалобу получают админы и каждый, кому выдан раздел «Модерация».
    const admins = ADMIN_PHONES.filter(Boolean).map((p) => this.users.findByPhone(p));
    const moderators = [...admins, ...this.users.findWithAdminSection("moderation")].filter((u): u is User => !!u && u.id !== uid);
    const recipients = [...new Map(moderators.map((u) => [u.id, u])).values()];
    const canBan = !!subjectUserId;
    const summary = targetSummary(targetType, target);
    const quoted = report.details ? `\n«${report.details}»` : "";
    for (const admin of recipients) {
      try {
        const chat = await findOrCreateDm(SYSTEM_BOT_ID, admin.id);
        await sendMessageAndBroadcast(chat, SYSTEM_BOT_ID, `🚩 Новая жалоба (${REASON_LABELS[reason]}) от ${reporter.name}\n${summary}${quoted}`, {
          type: "report",
          report: { reportId: report.id, reason, reporterName: reporter.name, targetType, targetSummary: summary, status: "open", canBan },
        });
      } catch (err) {
        console.error("report notification failed:", err);
      }
    }
    return { report };
  }

  public async resolve(uid: string, id: string, dto: ResolveReportDto) {
    const me = this.users.findById(uid);
    if (!hasAdminSection(me, "moderation")) throw new ApiError(403, "Недостаточно прав");
    const action = dto.action as string;
    if (!["delete", "ban", "dismiss"].includes(action)) throw new ApiError(400, "invalid action");
    const report = this.reports.findById(id);
    if (!report) throw new ApiError(404, "Жалоба не найдена");
    if (report.status !== "open") throw new ApiError(400, "Жалоба уже обработана");

    let target: any;
    if (report.targetType === "user") target = this.users.findById(report.targetId);
    else if (report.targetType === "chat") target = this.chats.findById(report.targetId);
    else target = this.messages.findById(report.targetId);

    let nextStatus = "dismissed";
    if (action === "delete") {
      if (!target) {
        nextStatus = "resolved_deleted";
      } else if (report.targetType === "chat") {
        // Как удаление из каталога модерации: chat:deleted участникам, запись в журнал и
        // уведомление владельцу (у канала уходит и группа обсуждения).
        if (target.type === "group" || target.type === "channel") {
          await moderateDeleteChat(target, { adminId: me!.id, reason: REASON_LABELS[report.reason] ?? report.reason });
        } else {
          this.realtime.broadcastToUsers(target.memberIds, { type: "chat:deleted", chatId: target.id });
          await legacyMessages().deleteMessagesForChat(target.id);
          this.chats.delete(target.id);
        }
        nextStatus = "resolved_deleted";
      } else if (report.targetType === "message") {
        const refs = this.messages.delete(report.targetId);
        if (refs) uploadAccess().revokeAttachments(refs.chatId, [{ url: refs.attachments ?? "" }, { url: refs.sticker ?? "" }]);
        // Как при «Удалить у всех»: у участников с открытым чатом сообщение исчезает сразу.
        const chatOfMessage = this.chats.findById(target.chatId);
        if (chatOfMessage) this.realtime.broadcastToUsers(chatOfMessage.memberIds, { type: "message:deleted", chatId: chatOfMessage.id, id: target.id });
        nextStatus = "resolved_deleted";
      } else {
        throw new ApiError(400, "Пользователя нельзя удалить — только заблокировать");
      }
    } else if (action === "ban") {
      const userId = report.subjectUserId ?? (target ? responsibleUserId(report.targetType, target) : null);
      if (!userId) throw new ApiError(400, "Не удалось определить, кого блокировать");
      const subject = this.users.findById(userId);
      if (subject && (subject.id === me!.id || !outranks(me, subject))) {
        throw new ApiError(403, "Нельзя применять это к администратору вашего уровня или выше");
      }
      this.users.ban(userId, `Жалоба: ${REASON_LABELS[report.reason] ?? report.reason}`);
      const label = REASON_TO_LABEL[report.reason];
      if (label) {
        const banned = this.users.findById(userId);
        if (banned && !banned.safetyLabel) this.users.setSafetyLabel(userId, label);
      }
      nextStatus = "resolved_banned";
    }

    this.reports.setStatus(report.id, nextStatus);
    // Жалоба приходит каждому модератору своим сообщением — решённой она должна стать у всех.
    for (const messageId of this.messages.findIdsByReport(report.id)) {
      const m = this.messages.mutate(messageId, setReportStatus(nextStatus));
      if (!m) continue;
      const chat = this.chats.findById(m.chatId);
      if (chat) this.realtime.broadcastToUsers(chat.memberIds, { type: "message:updated", chatId: chat.id, message: m });
    }
    return { status: nextStatus };
  }
}
