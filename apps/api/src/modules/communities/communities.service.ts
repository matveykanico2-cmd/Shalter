import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { genId } from "../../common/lib/gen-id.js";
import { usesForeignUpload } from "../../legacy/legacy.js";
import { ChatsRepository } from "../chats/chats.repository.js";
import { MessagesRepository } from "../messages/messages.repository.js";
import { RealtimeService } from "../realtime/realtime.service.js";
import { UserSettingsService } from "../users/user-settings.service.js";
import { CommunitiesRepository } from "./communities.repository.js";
import { CommunityAccessService } from "./community-access.service.js";
import { cleanAvatarImage, isChatAdmin } from "./lib/community-fields.js";
import type { CommunityPatch } from "./model/domain.js";
import type { CreateCommunityDto, MembersQuery, MuteDto, PatchCommunityDto, PrefsDto } from "./model/schemas/community.schema.js";

const MAX_MEMBERS = 200;

// Сообщества (как в tweb, layer 228+): несколько групп и каналов под одной вывеской, со своим
// членством (выход — только из сообщества) и личными настройками строки в списке чатов —
// server/routes/communities.js. Чаты и заявки — CommunityChatsService, админы и удалённые —
// CommunityAdminsService.
@Injectable()
export class CommunitiesService {
  public constructor(
    private readonly access: CommunityAccessService,
    private readonly communities: CommunitiesRepository,
    private readonly chats: ChatsRepository,
    private readonly messages: MessagesRepository,
    private readonly userSettings: UserSettingsService,
    private readonly realtime: RealtimeService,
  ) {}

  /** Сообщества, в которые пользователь может добавить (или предложить) свой чат. */
  public mine(uid: string) {
    return {
      communities: this.communities
        .listForUser(uid)
        .map((c) => ({
          id: c.id,
          title: c.title,
          avatarColor: c.avatarColor ?? null,
          avatarImage: c.avatarImage ?? null,
          chatCount: c.chatIds.length,
          addPolicy: this.access.addPolicy(c, uid),
        }))
        .filter((c) => c.addPolicy),
    };
  }

  /** Для списка чатов (как в tweb): сообщество — отдельная строка, его чаты — в панели. */
  public joined(uid: string) {
    return {
      communities: this.communities.listForUser(uid).map((c) => {
        const rights = this.access.rightsOf(c, uid);
        const chats = this.access.visibleChats(c, uid, rights);
        return {
          id: c.id,
          title: c.title,
          description: c.description ?? null,
          avatarColor: c.avatarColor ?? null,
          avatarImage: c.avatarImage ?? null,
          role: this.access.roleOf(c, uid),
          isOwner: c.ownerId === uid,
          rights,
          addMode: c.addMode,
          ...this.access.prefsOf(c.id, uid),
          chatIds: chats.map((ch) => ch.id),
          requestsCount: rights.editChats ? this.communities.countRequests(c.id) : 0,
        };
      }),
    };
  }

  public byChat(uid: string, chatId: string) {
    const chat = this.chats.findById(chatId);
    if (!chat || (!chat.memberIds.includes(uid) && !chat.isPublic)) throw new ApiError(404, "not found");
    const community = this.communities.findByChat(chat.id);
    if (!community) return { community: null };
    const rights = this.access.rightsOf(community, uid);
    return {
      community: {
        id: community.id,
        title: community.title,
        avatarColor: community.avatarColor ?? null,
        avatarImage: community.avatarImage ?? null,
        isOwner: community.ownerId === uid,
        isMember: !!this.access.roleOf(community, uid),
        // Убрать чат может тот, кто управляет чатами сообщества, или админ самого чата.
        canRemoveChat: rights.editChats || isChatAdmin(chat, uid),
      },
    };
  }

  public async create(uid: string, dto: CreateCommunityDto) {
    const first = dto.chatId ? this.access.addableChat(dto.chatId, uid) : null;
    const avatarImage = cleanAvatarImage(dto.avatarImage);
    if (avatarImage === undefined || usesForeignUpload(uid, avatarImage)) throw new ApiError(400, "Некорректное изображение");
    const community = this.communities.create({
      id: genId("cm"),
      ownerId: uid,
      title: dto.title,
      description: dto.description,
      avatarColor: dto.avatarColor,
      avatarImage,
      addMode: dto.addMode,
    });
    if (first) await this.access.linkChat(community, first, { visible: dto.chatVisible, addedBy: uid });
    return { community: this.access.view(this.access.reload(community.id), uid) };
  }

  public get(uid: string, id: string) {
    const community = this.access.load(id, uid);
    if (this.communities.isBanned(community.id, uid) && community.ownerId !== uid) throw new ApiError(403, "Вас удалили из этого сообщества");
    return { community: this.access.view(community, uid) };
  }

  public patch(uid: string, id: string, dto: PatchCommunityDto) {
    const community = this.access.load(id, uid);
    const rights = this.access.rightsOf(community, uid);
    const patch: CommunityPatch = {};
    const infoTouched = dto.title !== undefined || dto.description !== undefined || dto.avatarImage !== undefined;
    if (infoTouched && !rights.editInfo) throw new ApiError(403, "Нет права менять информацию о сообществе");
    if (dto.title !== undefined) {
      if (!dto.title) throw new ApiError(400, "Введите название сообщества");
      patch.title = dto.title;
    }
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.avatarImage !== undefined) {
      const avatarImage = cleanAvatarImage(dto.avatarImage);
      if (avatarImage === undefined || usesForeignUpload(uid, avatarImage, community.avatarImage)) throw new ApiError(400, "Некорректное изображение");
      patch.avatarImage = avatarImage;
    }
    if (dto.addMode !== undefined) {
      if (!rights.editChats) throw new ApiError(403, "Нет права менять список чатов");
      if (!dto.addMode) throw new ApiError(400, "Некорректный режим добавления чатов");
      patch.addMode = dto.addMode;
    }
    // Пустая правка ничего не меняет и никого не оповещает; постороннему — отказ.
    if (!Object.keys(patch).length) {
      if (!rights.editInfo && !rights.editChats) throw new ApiError(403, "Недостаточно прав");
      return { community: this.access.view(community, uid) };
    }
    const updated = this.communities.update(community.id, patch)!;
    this.access.notify(community.id);
    return { community: this.access.view(updated, uid) };
  }

  public delete(uid: string, id: string) {
    const community = this.access.load(id, uid, "owner");
    const members = this.communities.listMemberIds(community.id);
    this.communities.delete(community.id);
    this.access.notifyUsers(members, community.id);
    return { ok: true };
  }

  /**
   * Вступить. Сообщество открытое, если в нём есть видимый публичный чат; иначе — только по
   * приглашению в один из его чатов (участник чата — уже участник сообщества) или вернуться,
   * если вы в нём уже были.
   */
  public join(uid: string, id: string) {
    const community = this.access.load(id, uid);
    if (this.communities.isBanned(community.id, uid)) throw new ApiError(403, "Вас удалили из этого сообщества");
    if (!this.access.roleOf(community, uid) && !this.communities.memberRow(community.id, uid)) {
      const open = this.access.visibleChats(community, uid, this.access.rightsOf(community, uid)).some((c) => c.isPublic);
      if (!open) throw new ApiError(403, "Сообщество закрытое — вступить можно только по приглашению в один из его чатов");
    }
    this.communities.join(community.id, uid);
    // Открытые страницы сообщества у остальных обновляют число участников сразу.
    this.access.notify(community.id);
    return { community: this.access.view(community, uid) };
  }

  public leave(uid: string, id: string) {
    const community = this.access.load(id, uid, "member");
    if (community.ownerId === uid) throw new ApiError(400, "Владелец не может покинуть сообщество — его можно только удалить");
    this.communities.leave(community.id, uid);
    this.access.notify(community.id);
    return { ok: true };
  }

  /** Закрепить строку / показывать одной строкой (tweb toggleCollapsedInDialogs). */
  public setPrefs(uid: string, id: string, dto: PrefsDto) {
    const community = this.access.load(id, uid, "member");
    this.communities.setPrefs(community.id, uid, { pinned: dto.pinned, collapsed: dto.collapsed });
    return { community: this.access.view(community, uid) };
  }

  /** Без звука — сразу на все мои чаты сообщества: { forever } | { hours } | { off }. */
  public mute(uid: string, id: string, dto: MuteDto) {
    const community = this.access.load(id, uid, "member");
    const { hours } = dto;
    const value =
      dto.forever ? true : dto.off ? null : Number.isFinite(hours) && hours > 0 ? new Date(Date.now() + hours * 3600_000).toISOString() : undefined;
    if (value === undefined) throw new ApiError(400, "Укажите срок");
    const settings = this.userSettings.get(uid);
    const mutedChats = { ...(settings.notifications?.mutedChats ?? {}) };
    for (const chat of this.access.myChats(community, uid)) {
      if (value === null) delete mutedChats[chat.id];
      else mutedChats[chat.id] = value;
    }
    this.userSettings.update(uid, { notifications: { ...settings.notifications, mutedChats } });
    return { ok: true };
  }

  public read(uid: string, id: string) {
    const community = this.access.load(id, uid, "member");
    for (const chat of this.access.myChats(community, uid)) {
      const changedIds = this.messages.markChatRead(chat.id, uid, false);
      if (changedIds.length) {
        this.realtime.broadcastToUsers(
          chat.memberIds.filter((m) => m !== uid),
          { type: "message:read", chatId: chat.id, readerId: uid, messageIds: changedIds },
        );
      }
    }
    return { ok: true };
  }

  /** Участники — для выбора админа или удаления; q — поиск по имени и нику. */
  public members(uid: string, id: string, query: MembersQuery) {
    const community = this.access.load(id, uid, "member");
    const { q } = query;
    const admins = new Set(this.communities.listAdmins(community.id).map((a) => a.userId));
    const users = [];
    for (const memberId of this.communities.listMemberIds(community.id)) {
      const role = memberId === community.ownerId ? "owner" : admins.has(memberId) ? "admin" : "member";
      const u = this.access.userCard(memberId, { role });
      if (!u) continue;
      if (q && !`${u.name ?? ""} ${u.username ?? ""}`.toLowerCase().includes(q)) continue;
      users.push(u);
      if (users.length >= MAX_MEMBERS) break;
    }
    return { users };
  }
}
