import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { joinApproval } from "../../legacy/legacy.js";
import { RealtimeService } from "../realtime/realtime.service.js";
import { UsersRepository } from "../users/users.repository.js";
import { UserPrivacyService } from "../users/user-privacy.service.js";
import { AdminLogService } from "./admin-log.service.js";
import { ChatNotesService } from "./chat-notes.service.js";
import { ChatsRepository } from "./chats.repository.js";
import { JoinRequestsRepository } from "./join-requests.repository.js";
import { can } from "./lib/chat-permissions.js";
import { isOwner, isOwnerOrAdminOf } from "./lib/chat-roles.js";
import type { Chat } from "./model/domain.js";
import type { MemberRoleDto, MemberTitleDto, RestrictDto } from "./model/schemas/chat-members.schema.js";

/** Что модератор может делать с участниками; остальное — только владельцы и админы. */
const MODERATOR_ROLES = ["add", "kick", "ban", "unban"];

// Участники группы или канала: добавление, роли, бан, теги и ограничения.
@Injectable()
export class ChatMembersService {
  public constructor(
    private readonly chats: ChatsRepository,
    private readonly users: UsersRepository,
    private readonly joinRequests: JoinRequestsRepository,
    private readonly notes: ChatNotesService,
    private readonly adminLog: AdminLogService,
    private readonly realtime: RealtimeService,
    private readonly privacy: UserPrivacyService
  ) {}

  public async changeRole(uid: string, chat: Chat, { userId: rawUserId, role }: MemberRoleDto) {
    const isOwnerOrAdmin = isOwnerOrAdminOf(chat, uid);
    const isModerator = chat.moderatorIds.includes(uid);
    const memberMayAdd = role === "add" && chat.type === "group" && can(chat, uid, "addMembers");
    if (!isOwnerOrAdmin && !isModerator && !memberMayAdd) throw new ApiError(403, "Недостаточно прав");

    // Дальше userId сравнивается со списками участников: не строка — ни с кем не совпадёт.
    const userId = rawUserId as string;
    const done = (updated: Chat) => {
      this.adminLog.record(chat.id, uid, `member_${role}`, { targetId: userId });
      this.notes.announceRole(chat, uid, userId, String(role));
      return { chat: updated };
    };
    if (!isOwnerOrAdmin && !MODERATOR_ROLES.includes(role as string)) {
      throw new ApiError(403, "Модератор может только добавлять и удалять участников");
    }

    if (role === "unban") return done(this.chats.update(chat.id, { bannedIds: chat.bannedIds.filter((m) => m !== userId) })!);
    if (role === "add") return done(await this.add(uid, chat, userId, isOwnerOrAdmin || isModerator));
    if (role === "owner" || role === "unowner") return done(this.setOwner(uid, chat, userId, role === "owner"));
    if (role === "transfer") return done(await this.transfer(uid, chat, userId));

    if (isOwner(chat, userId)) throw new ApiError(400, "Сначала снимите с участника права владельца");

    if (role === "mod" || role === "unmod") {
      if (!isOwnerOrAdmin) throw new ApiError(403, "Недостаточно прав");
      this.requireMember(chat, userId);
      const mods = new Set(chat.moderatorIds);
      if (role === "mod") mods.add(userId);
      else mods.delete(userId);
      return done(this.updateAndBroadcast(chat, { moderatorIds: [...mods] }));
    }
    if (role === "kick" || role === "ban") return done(await this.remove(uid, chat, userId, role === "ban"));
    if (role === "promote") {
      this.requireMember(chat, userId);
      return done(this.updateAndBroadcast(chat, { adminIds: [...new Set([...chat.adminIds, userId])] }));
    }
    if (role === "demote") {
      if (userId !== uid && !isOwner(chat, uid)) throw new ApiError(403, "Снять другого администратора может только владелец");
      return done(this.updateAndBroadcast(chat, { adminIds: chat.adminIds.filter((m) => m !== userId) }));
    }
    throw new ApiError(400, "unknown role");
  }

  /**
   * Тег участника, как в Telegram: владелец ставит кому угодно, админ — всем, кроме
   * владельцев и других админов, участник — себе, если группа разрешает.
   */
  public setTitle(uid: string, chat: Chat, { userId: rawUserId, title }: MemberTitleDto) {
    const userId = rawUserId as string;
    this.requireMember(chat, userId);
    const self = userId === uid;
    const allowed = isOwner(chat, uid)
      ? true
      : self
        ? isOwnerOrAdminOf(chat, uid) || can(chat, uid, "setOwnTag")
        : isOwnerOrAdminOf(chat, uid) && !isOwnerOrAdminOf(chat, userId);
    if (!allowed) throw new ApiError(403, "Недостаточно прав, чтобы менять этот тег");

    const titles = { ...chat.memberTitles };
    if (title) titles[userId] = title;
    else delete titles[userId];

    const updated = this.chats.update(chat.id, { memberTitles: titles })!;
    if (!self) this.adminLog.record(chat.id, uid, "member_tag", { targetId: userId, details: { value: title || null } });
    this.realtime.broadcastToUsers(chat.memberIds, { type: "chat:updated", chat: updated });
    return { chat: updated };
  }

  /** Запрет писать участнику до until (ISO или "forever"); без until — снять. */
  public async restrict(uid: string, chat: Chat, { userId: rawUserId, until }: RestrictDto) {
    if (!isOwnerOrAdminOf(chat, uid)) throw new ApiError(403, "Недостаточно прав");
    const userId = rawUserId as string;
    if (userId === chat.ownerId || chat.adminIds.includes(userId)) throw new ApiError(400, "Нельзя ограничить владельца или администратора");
    if (!chat.memberIds.includes(userId)) throw new ApiError(404, "not found");

    const restrictions = { ...chat.restrictions };
    if (until) restrictions[userId] = until as string;
    else delete restrictions[userId];

    const updated = this.chats.update(chat.id, { restrictions })!;
    this.adminLog.record(chat.id, uid, until ? "member_restrict" : "member_unrestrict", { targetId: userId, details: until ? { until } : null });
    // Как остальные правки участников: клиенты обновляют чат (и поле ввода у ограниченного).
    this.realtime.broadcastToUsers(updated.memberIds, { type: "chat:updated", chat: updated });
    if (chat.type === "group") {
      const who = this.users.findById(userId)?.name ?? "участнику";
      await this.notes.note(updated, uid, (name) =>
        !until
          ? `${name} снова разрешил(а) писать ${who}`
          : until === "forever"
            ? `${name} запретил(а) писать ${who}`
            : `${name} запретил(а) писать ${who} до ${new Date(until as string).toLocaleString("ru-RU", {
                timeZone: "Europe/Moscow",
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })} (МСК)`
      );
    }
    return { chat: updated };
  }

  // staff — добавляет владелец, админ или модератор: им можно вернуть заблокированного.
  private async add(uid: string, chat: Chat, userId: string, staff: boolean): Promise<Chat> {
    if (chat.memberIds.includes(userId)) throw new ApiError(400, "Уже в чате");
    const user = typeof userId === "string" ? this.users.findById(userId) : undefined;
    if (!user) throw new ApiError(404, "Пользователь не найден");
    if (!this.privacy.allowsUser(userId, "invites", uid)) throw new ApiError(403, "Пользователь ограничил добавление в чаты");
    const wasBanned = chat.bannedIds.includes(userId);
    if (wasBanned && !staff) throw new ApiError(403, "Пользователь заблокирован в этом чате");

    const updated = this.chats.update(chat.id, {
      memberIds: [...chat.memberIds, userId],
      ...(wasBanned ? { bannedIds: chat.bannedIds.filter((m) => m !== userId) } : {}),
    })!;
    this.realtime.broadcastToUsers([userId], { type: "chat:added", chat: updated });
    if (chat.type === "group" || user.isBot) {
      const actor = this.users.findById(uid)?.name ?? "Кто-то";
      await this.notes.system(updated, user.isBot ? `${actor} добавил(а) бота ${user.name}` : `${actor} добавил(а) в группу ${user.name}`);
      await joinApproval().sendWelcome(updated, userId);
    }
    return updated;
  }

  // Совладельцы; хотя бы один владелец остаётся. Новый совладелец становится и админом.
  private setOwner(uid: string, chat: Chat, userId: string, grant: boolean): Chat {
    if (!isOwner(chat, uid)) throw new ApiError(403, "Управлять владельцами может только владелец");
    this.requireMember(chat, userId);
    const owners = new Set(chat.ownerIds);
    if (chat.ownerId) owners.add(chat.ownerId);
    if (grant) {
      owners.add(userId);
    } else {
      if (!owners.has(userId)) throw new ApiError(400, "Этот участник не владелец");
      if (owners.size <= 1) throw new ApiError(400, "В чате должен остаться хотя бы один владелец");
      owners.delete(userId);
    }
    const admins = new Set(chat.adminIds);
    if (grant) admins.add(userId);
    // Снимаемый мог быть основным владельцем (ownerId) — иначе isOwner продолжал бы его пускать.
    const ownerId = chat.ownerId && owners.has(chat.ownerId) ? chat.ownerId : [...owners][0];
    return this.updateAndBroadcast(chat, { ownerId, ownerIds: [...owners], adminIds: [...admins] });
  }

  // Передача владения, как в Telegram: новый владелец — единственный, прежний остаётся админом.
  private async transfer(uid: string, chat: Chat, userId: string): Promise<Chat> {
    if (!isOwner(chat, uid)) throw new ApiError(403, "Передать чат может только владелец");
    if (userId === uid) throw new ApiError(400, "Вы уже владелец");
    this.requireMember(chat, userId);
    const target = this.users.findById(userId);
    if (!target) throw new ApiError(404, "Пользователь не найден");
    if (target.isBot) throw new ApiError(400, "Бота нельзя сделать владельцем");
    const updated = this.updateAndBroadcast(chat, { ownerId: userId, ownerIds: [userId], adminIds: [...new Set([...chat.adminIds, userId, uid])] });
    const actor = this.users.findById(uid)?.name ?? "Кто-то";
    await this.notes.system(updated, `${actor} передал(а) права владельца: ${target.name}`);
    return updated;
  }

  private async remove(uid: string, chat: Chat, userId: string, ban: boolean): Promise<Chat> {
    this.requireMember(chat, userId);
    if (chat.adminIds.includes(userId) && !isOwner(chat, uid)) throw new ApiError(403, "Удалить администратора может только владелец");
    const kicked = this.users.findById(userId);
    const updated = this.chats.update(chat.id, {
      memberIds: chat.memberIds.filter((m) => m !== userId),
      adminIds: chat.adminIds.filter((m) => m !== userId),
      moderatorIds: chat.moderatorIds.filter((m) => m !== userId),
      ownerIds: chat.ownerIds.filter((m) => m !== userId),
      ...(ban ? { bannedIds: [...new Set([...chat.bannedIds, userId])] } : {}),
    })!;
    this.joinRequests.remove(chat.id, userId);
    this.realtime.broadcastToUsers([userId], { type: "chat:deleted", chatId: chat.id });
    this.realtime.broadcastToUsers(updated.memberIds, { type: "chat:updated", chat: updated });
    if (chat.type === "group" && kicked) {
      const actor = this.users.findById(uid)?.name ?? "Кто-то";
      await this.notes.system(updated, `${actor} ${ban ? "заблокировал(а)" : "удалил(а) из группы"} ${kicked.name}`);
    }
    return updated;
  }

  private requireMember(chat: Chat, userId: string): void {
    if (!chat.memberIds.includes(userId)) throw new ApiError(404, "Пользователь не в чате");
  }

  // Правка ролей, которую видят все участники (список до правки — как в server/).
  private updateAndBroadcast(chat: Chat, patch: Parameters<ChatsRepository["update"]>[1]): Chat {
    const updated = this.chats.update(chat.id, patch)!;
    this.realtime.broadcastToUsers(chat.memberIds, { type: "chat:updated", chat: updated });
    return updated;
  }
}
