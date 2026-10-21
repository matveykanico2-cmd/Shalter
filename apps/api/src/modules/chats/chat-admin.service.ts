import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { genId } from "../../common/lib/gen-id.js";
import { checkUsername } from "../../legacy/legacy.js";
import { RealtimeService } from "../realtime/realtime.service.js";
import { publicUser } from "../users/lib/user.presenter.js";
import { UsersRepository } from "../users/users.repository.js";
import { AdminLogService } from "./admin-log.service.js";
import { ChatNotesService } from "./chat-notes.service.js";
import { ChatsRepository } from "./chats.repository.js";
import { PERMISSIONS, permissionsOf, sanitizePermissions } from "./lib/chat-permissions.js";
import { isOwnerOrAdminOf } from "./lib/chat-roles.js";
import { durationLabel } from "./lib/duration-label.js";
import type { Chat, ChatPatch } from "./model/domain.js";
import type { ChatSettingsDto, DiscussionDto, PublicDto } from "./model/schemas/chat-admin.schema.js";

// Настройки группы или канала, которые меняют владельцы и админы.
@Injectable()
export class ChatAdminService {
  public constructor(
    private readonly chats: ChatsRepository,
    private readonly users: UsersRepository,
    private readonly notes: ChatNotesService,
    private readonly adminLog: AdminLogService,
    private readonly realtime: RealtimeService
  ) {}

  public updateSettings(uid: string, chat: Chat, body: ChatSettingsDto) {
    if (chat.type === "dm") throw new ApiError(400, "Только для групп и каналов");
    this.requireStaff(chat, uid);
    const patch: ChatPatch = {};
    if ("approveJoins" in body) patch.approveJoins = !!body.approveJoins;
    if ("signMessages" in body) patch.signMessages = !!body.signMessages;
    if ("commentsOff" in body && chat.type === "channel") patch.commentsOff = !!body.commentsOff;
    if ("anonymousAdmins" in body && chat.type === "group") patch.anonymousAdmins = !!body.anonymousAdmins;
    if (!Object.keys(patch).length) throw new ApiError(400, "Нечего менять");
    const updated = this.chats.update(chat.id, patch)!;
    this.adminLog.record(chat.id, uid, "settings", { details: patch });
    this.realtime.broadcastToUsers(updated.memberIds, { type: "chat:updated", chat: updated });
    return { chat: updated };
  }

  public permissions(chat: Chat) {
    return { permissions: permissionsOf(chat), fields: PERMISSIONS };
  }

  public async setPermissions(uid: string, chat: Chat, permissions: unknown) {
    if (chat.type !== "group") throw new ApiError(400, "Права участников есть только у групп");
    this.requireStaff(chat, uid);
    const updated = this.chats.update(chat.id, { permissions: sanitizePermissions(permissions) })!;
    this.adminLog.record(chat.id, uid, "permissions");
    await this.notes.note(updated, uid, (name) => `${name} изменил(а) права участников`);
    this.realtime.broadcastToUsers(updated.memberIds, { type: "chat:updated", chat: updated });
    return { chat: updated, permissions: permissionsOf(updated) };
  }

  /** Реакции, доступные под постами канала (до 20); не список — любые. */
  public setReactions(uid: string, chat: Chat, list: unknown) {
    if (chat.type !== "channel") throw new ApiError(400, "Список реакций настраивается только у каналов");
    this.requireStaff(chat, uid);
    const allowedReactions = Array.isArray(list) ? [...new Set(list.map((e) => String(e).trim()).filter(Boolean))].slice(0, 20) : null;
    const updated = this.chats.update(chat.id, { allowedReactions })!;
    this.realtime.broadcastToUsers(updated.memberIds, { type: "chat:updated", chat: updated });
    return { chat: updated };
  }

  /** Группа обсуждения канала: отвязать, привязать свою или создать новую. */
  public discussion(uid: string, chat: Chat, { action, groupId }: DiscussionDto) {
    if (chat.type !== "channel") throw new ApiError(400, "Обсуждение есть только у каналов");
    this.requireStaff(chat, uid);

    if (action === "unlink") {
      const updated = this.linkDiscussion(chat, null);
      return { chat: updated, discussion: null };
    }
    if (action === "link") {
      const group = typeof groupId === "string" ? this.chats.findById(groupId) : undefined;
      if (!group || group.type !== "group") throw new ApiError(404, "Группа не найдена");
      if (!isOwnerOrAdminOf(group, uid)) throw new ApiError(403, "Вы не администратор этой группы");
      const taken = this.chats.findLinkedTo(group.id, chat.id);
      if (taken) throw new ApiError(409, `Эта группа уже обсуждение канала «${taken.title}»`);
      return { chat: this.linkDiscussion(chat, group.id), discussion: group };
    }
    if (action === "create") {
      const discussion = this.chats.create({
        id: genId("c"),
        type: "group",
        title: `${chat.title} · Обсуждение`,
        avatarColor: "#5C6473",
        memberIds: [uid],
        ownerId: uid,
        adminIds: [uid],
        pinned: false,
        muted: false,
        archived: false,
        createdAt: new Date().toISOString(),
      });
      return { chat: this.linkDiscussion(chat, discussion.id), discussion };
    }
    throw new ApiError(400, "Неизвестное действие");
  }

  /** Медленный режим группы: пауза между сообщениями участника, до часа; 0 — выключить. */
  public async setSlowMode(uid: string, chat: Chat, rawSeconds: unknown) {
    if (chat.type !== "group") throw new ApiError(400, "Медленный режим есть только у групп");
    this.requireStaff(chat, uid);
    const seconds = Math.max(0, Math.min(3600, Math.trunc(Number(rawSeconds) || 0)));
    const updated = this.chats.update(chat.id, { slowModeSeconds: seconds || null })!;
    this.adminLog.record(chat.id, uid, "slow_mode", { details: { seconds } });
    if ((chat.slowModeSeconds ?? 0) !== seconds) {
      await this.notes.note(updated, uid, (name) =>
        seconds ? `${name} включил(а) медленный режим: ${durationLabel(seconds)}` : `${name} выключил(а) медленный режим`
      );
    }
    this.realtime.broadcastToUsers(updated.memberIds, { type: "chat:updated", chat: updated });
    return { chat: updated, slowModeSeconds: updated.slowModeSeconds ?? 0 };
  }

  /** Цена комментария в звёздах (до 90 000); обсуждение канала тоже обновляется у клиентов. */
  public setCommentPrice(uid: string, chat: Chat, rawStars: unknown) {
    if (chat.type !== "channel") throw new ApiError(400, "Платные комментарии есть только у каналов");
    this.requireStaff(chat, uid);
    const stars = Math.max(0, Math.min(90000, Math.trunc(Number(rawStars) || 0)));
    const updated = this.chats.update(chat.id, { commentPriceStars: stars })!;
    this.realtime.broadcastToUsers(updated.memberIds, { type: "chat:updated", chat: updated });
    if (updated.linkedDiscussionChatId) {
      this.realtime.broadcastToUsers(updated.memberIds, { type: "chat:updated", chat: { id: updated.linkedDiscussionChatId } });
    }
    return { chat: updated, commentPriceStars: updated.commentPriceStars ?? 0 };
  }

  /** Приветствие новым участникам группы ({name} — имя вступившего); пустое — выключить. */
  public async setWelcome(uid: string, chat: Chat, rawText: unknown) {
    if (chat.type !== "group") throw new ApiError(400, "Приветствие есть только у групп");
    this.requireStaff(chat, uid);
    const text = String(rawText ?? "").trim().slice(0, 1000);
    const updated = this.chats.update(chat.id, { welcomeText: text || null })!;
    this.adminLog.record(chat.id, uid, "welcome", { details: { value: text || null } });
    if ((chat.welcomeText ?? "") !== text) {
      await this.notes.note(updated, uid, (name) =>
        text ? `${name} изменил(а) приветствие для новых участников` : `${name} выключил(а) приветствие`
      );
    }
    this.realtime.broadcastToUsers(updated.memberIds, { type: "chat:updated", chat: updated });
    return { chat: updated, welcomeText: updated.welcomeText ?? "" };
  }

  /** Публичная группа или канал — с @юзернеймом; частная освобождает юзернейм. */
  public async setPublic(uid: string, chat: Chat, { isPublic, username }: PublicDto) {
    if (chat.type !== "channel" && chat.type !== "group") throw new ApiError(400, "Публичными могут быть только группы и каналы");
    if (!isOwnerOrAdminOf(chat, uid)) throw new ApiError(403, "Недостаточно прав");
    if (!isPublic) {
      // Как при создании частного чата: иначе юзернейм навсегда оставался занят чатом,
      // который по нему уже не найти.
      return { chat: this.chats.update(chat.id, { isPublic: false, username: null }) };
    }
    const handle = String(username ?? "").trim().replace(/^@/, "");
    const problem = await checkUsername(handle, { forChatId: chat.id });
    if (problem) throw new ApiError(problem.status, problem.error);
    return { chat: this.chats.update(chat.id, { isPublic: true, username: handle }) };
  }

  public banned(uid: string, chat: Chat) {
    if (!isOwnerOrAdminOf(chat, uid) && !chat.moderatorIds.includes(uid)) throw new ApiError(403, "Недостаточно прав");
    const users = chat.bannedIds.map((id) => this.users.findById(id));
    return { users: users.filter((u) => u !== undefined).map(publicUser) };
  }

  public log(uid: string, chat: Chat, rawBeforeId: unknown) {
    if (chat.type === "dm") throw new ApiError(400, "Журнал есть только у групп и каналов");
    if (!isOwnerOrAdminOf(chat, uid) && !chat.moderatorIds.includes(uid)) throw new ApiError(403, "Журнал видят только администраторы");
    const entries = this.adminLog.list(chat.id, { limit: 100, beforeId: Number(rawBeforeId) || null });
    const ids = entries.flatMap((e) => [e.actorId, e.targetId]);
    return { entries, users: this.users.findByIds(ids).map(publicUser) };
  }

  private requireStaff(chat: Chat, uid: string): void {
    if (!isOwnerOrAdminOf(chat, uid)) throw new ApiError(403, "Недостаточно прав");
  }

  private linkDiscussion(chat: Chat, discussionId: string | null): Chat {
    const updated = this.chats.update(chat.id, { linkedDiscussionChatId: discussionId })!;
    this.realtime.broadcastToUsers(updated.memberIds, { type: "chat:updated", chat: updated });
    return updated;
  }
}
