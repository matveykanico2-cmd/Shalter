import { Injectable } from "@nestjs/common";
import { SYSTEM_BOT_ID } from "../../common/config/accounts.js";
import { ApiError } from "../../common/errors/api-error.js";
import { sendMessageAndBroadcast } from "../../legacy/legacy.js";
import { ChatsRepository } from "../chats/chats.repository.js";
import type { Chat } from "../chats/model/domain.js";
import { RealtimeService } from "../realtime/realtime.service.js";
import { publicUser } from "../users/lib/user.presenter.js";
import { UsersRepository } from "../users/users.repository.js";
import { CommunitiesRepository } from "./communities.repository.js";
import { ALL_RIGHTS, cleanRights, parseRights } from "./lib/community-rights.js";
import { isChatAdmin, kindOf } from "./lib/community-fields.js";
import type { Community, CommunityRight, CommunityRights, CommunityRole } from "./model/domain.js";

/** Какое право нужно маршруту: member — быть участником, owner — владельцем. */
export type Need = CommunityRight | "member" | "owner";

// Общее для маршрутов сообществ (server/routes/communities.js и roleOf/rightsOf из
// server/data/communities.js): роль и права, вид сообщества для клиента, чаты, оповещения.
@Injectable()
export class CommunityAccessService {
  public constructor(
    private readonly communities: CommunitiesRepository,
    private readonly chats: ChatsRepository,
    private readonly users: UsersRepository,
    private readonly realtime: RealtimeService,
  ) {}

  /** Сообщество с проверкой права; без need — любому. */
  public load(id: string, uid: string, need?: Need): Community {
    const community = this.communities.findById(id);
    if (!community) throw new ApiError(404, "Сообщество не найдено");
    if (need === "member") {
      if (this.roleOf(community, uid)) return community;
      throw new ApiError(403, "Вы не участник сообщества");
    }
    const allowed = !need || (need === "owner" ? community.ownerId === uid : this.rightsOf(community, uid)[need]);
    if (!allowed) throw new ApiError(403, "Недостаточно прав");
    return community;
  }

  /** Перечитанное сообщество (после правки). */
  public reload(id: string): Community {
    return this.communities.findById(id)!;
  }

  /** owner | admin | member | null: участник — у кого строка без «вышел» или кто состоит хоть в одном чате сообщества. */
  public roleOf(community: Community | undefined, userId: string): CommunityRole | null {
    if (!community || !userId) return null;
    if (community.ownerId === userId) return "owner";
    if (this.communities.isBanned(community.id, userId)) return null;
    const row = this.communities.memberRow(community.id, userId);
    if (row?.left) return null;
    if (row?.role === "admin") return "admin";
    if (row || this.communities.inLinkedChat(community.id, userId)) return "member";
    return null;
  }

  public rightsOf(community: Community, userId: string): CommunityRights {
    const role = this.roleOf(community, userId);
    if (role === "owner") return { ...ALL_RIGHTS };
    if (role === "admin") return parseRights(this.communities.memberRow(community.id, userId)?.rights);
    return cleanRights({});
  }

  public prefsOf(communityId: string, userId: string): { pinned: boolean; collapsed: boolean } {
    const row = this.communities.memberRow(communityId, userId);
    return { pinned: !!row?.pinned, collapsed: row ? !!row.collapsed : true };
  }

  /** Добавлять чаты может участник с правом editChats, при addMode «all» — любой; в «admins» — только предложить. */
  public addPolicy(community: Community, uid: string): "add" | "suggest" | null {
    if (!this.roleOf(community, uid)) return null;
    if (this.rightsOf(community, uid).editChats) return "add";
    return community.addMode === "all" ? "add" : "suggest";
  }

  /** Чаты сообщества, которые видит пользователь: скрытые — только их участникам и тем, кто управляет чатами. */
  public visibleChats(community: Community, uid: string, rights: CommunityRights): Chat[] {
    return community.chatIds
      .map((id) => this.chats.findById(id))
      .filter((chat): chat is Chat => {
        if (!chat || chat.secret) return false;
        if (!community.hiddenChatIds.includes(chat.id)) return true;
        return rights.editChats || chat.memberIds.includes(uid);
      });
  }

  /** Чаты сообщества, в которых состоит пользователь. */
  public myChats(community: Community, uid: string): Chat[] {
    return community.chatIds.map((id) => this.chats.findById(id)).filter((c): c is Chat => !!c && c.memberIds.includes(uid));
  }

  public chatCard(community: Community, chat: Chat, uid: string) {
    return {
      id: chat.id,
      type: chat.type,
      title: chat.title,
      username: chat.username ?? null,
      avatarColor: chat.avatarColor ?? null,
      avatarImage: chat.avatarImage ?? null,
      isPublic: !!chat.isPublic,
      approveJoins: !!chat.approveJoins,
      members: chat.memberIds.length,
      isMember: chat.memberIds.includes(uid),
      isChatAdmin: isChatAdmin(chat, uid),
      visible: !community.hiddenChatIds.includes(chat.id),
      addedBy: community.addedBy[chat.id] ?? null,
    };
  }

  /** Сообщество для клиента. Закрытое (без видимого публичного чата) постороннему — только название и аватар. */
  public view(community: Community, uid: string) {
    const role = this.roleOf(community, uid);
    const rights = this.rightsOf(community, uid);
    const chats = this.visibleChats(community, uid, rights).map((c) => this.chatCard(community, c, uid));
    const memberIds = this.communities.listMemberIds(community.id);
    const isClosed = !chats.some((c) => c.isPublic);
    const hidden = isClosed && !role && !this.communities.memberRow(community.id, uid);
    return {
      id: community.id,
      title: community.title,
      description: hidden ? null : (community.description ?? null),
      avatarColor: community.avatarColor ?? null,
      avatarImage: community.avatarImage ?? null,
      addMode: community.addMode,
      role,
      isOwner: role === "owner",
      isMember: !!role,
      isBanned: role === null && this.communities.isBanned(community.id, uid),
      rights,
      addPolicy: this.addPolicy(community, uid),
      ...this.prefsOf(community.id, uid),
      chats,
      isClosed,
      membersCount: hidden ? null : memberIds.length,
      adminsCount: hidden ? null : this.communities.listAdmins(community.id).length + 1,
      bannedCount: rights.ban ? this.communities.listBans(community.id).length : 0,
      requestsCount: rights.editChats ? this.communities.countRequests(community.id) : 0,
    };
  }

  /** В сообщество добавляются только свои группы и каналы (где вы владелец или админ). */
  public addableChat(chatId: unknown, uid: string): Chat {
    const chat = typeof chatId === "string" ? this.chats.findById(chatId) : undefined;
    if (!chat || !chat.memberIds.includes(uid)) throw new ApiError(404, "Чат не найден");
    if (chat.secret || (chat.type !== "group" && chat.type !== "channel")) throw new ApiError(400, "В сообщество добавляются группы и каналы");
    if (!isChatAdmin(chat, uid)) throw new ApiError(403, "Добавить чат может только его владелец или администратор");
    if (this.communities.findByChat(chat.id)) throw new ApiError(409, "Этот чат уже входит в сообщество");
    return chat;
  }

  /** Чат в сообщество со служебной строкой в самом чате; false — он уже в другом. */
  public async linkChat(community: Community, chat: Chat, opts: { visible: boolean; addedBy: string }): Promise<boolean> {
    if (!this.communities.addChat(community.id, chat.id, opts)) return false;
    await this.announce(chat, `${kindOf(chat)} добавлен${chat.type === "channel" ? "" : "а"} в сообщество «${community.title}»`);
    this.notify(community.id);
    return true;
  }

  public async unlinkChat(community: Community, chatId: string, chat: Chat | undefined): Promise<void> {
    const before = this.communities.listMemberIds(community.id);
    if (!this.communities.removeChat(community.id, chatId)) return;
    if (chat) await this.announce(chat, this.leftText(community, chat));
    this.notify(community.id, before);
  }

  public leftText(community: Community, chat: Chat): string {
    return `${kindOf(chat)} больше не входит в сообщество «${community.title}»`;
  }

  /** Служебная строка в самом чате (tweb: бабл communityChanged). Не роняет основное действие. */
  public async announce(chat: Chat, text: string): Promise<void> {
    try {
      await sendMessageAndBroadcast(chat, SYSTEM_BOT_ID, text, { type: "system" });
    } catch {
      // строка в чате — не главное
    }
  }

  /** Всем участникам (и extraUserIds) — «перечитайте сообщество». */
  public notify(communityId: string, extraUserIds: string[] = []): void {
    const ids = new Set([...this.communities.listMemberIds(communityId), ...extraUserIds]);
    this.realtime.broadcastToUsers([...ids], { type: "community:updated", communityId });
  }

  public notifyUsers(userIds: string[], communityId: string): void {
    this.realtime.broadcastToUsers(userIds, { type: "community:updated", communityId });
  }

  /** Публичный профиль с доп. полями; нет пользователя — null. */
  public userCard<T extends object>(id: string, extra?: T) {
    const user = this.users.findById(id);
    return user ? { ...publicUser(user), ...extra } : null;
  }
}
