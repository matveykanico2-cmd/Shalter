import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { ChatsRepository } from "../chats/chats.repository.js";
import type { Chat } from "../chats/model/domain.js";
import { CommunitiesRepository } from "./communities.repository.js";
import { CommunityAccessService } from "./community-access.service.js";
import { cleanRights, DEFAULT_ADMIN_RIGHTS, RIGHTS } from "./lib/community-rights.js";
import type { Community } from "./model/domain.js";
import type { AdminRightsDto } from "./model/schemas/community.schema.js";

const OWNER_RIGHTS = "Права владельца не меняются";

// Администраторы сообщества и удалённые из него участники — server/routes/communities.js.
@Injectable()
export class CommunityAdminsService {
  public constructor(
    private readonly access: CommunityAccessService,
    private readonly communities: CommunitiesRepository,
    private readonly chats: ChatsRepository,
  ) {}

  public listAdmins(uid: string, id: string) {
    const community = this.access.load(id, uid, "member");
    const admins = [this.access.userCard(community.ownerId, { role: "owner", rights: this.access.rightsOf(community, community.ownerId) })];
    for (const a of this.communities.listAdmins(community.id)) admins.push(this.access.userCard(a.userId, { role: "admin", rights: a.rights }));
    return { admins: admins.filter(Boolean) };
  }

  /** Назначить или изменить права; админ не может выдать прав больше, чем есть у него самого. */
  public setAdmin(uid: string, id: string, target: string, dto: AdminRightsDto) {
    const community = this.access.load(id, uid, "addAdmins");
    if (target === community.ownerId) throw new ApiError(400, OWNER_RIGHTS);
    if (!this.access.roleOf(community, target)) throw new ApiError(400, "Этот пользователь не участник сообщества");
    const mine = this.access.rightsOf(community, uid);
    const rights = cleanRights(dto.rights ?? DEFAULT_ADMIN_RIGHTS);
    for (const r of RIGHTS) if (rights[r] && !mine[r]) throw new ApiError(403, "Нельзя выдать право, которого нет у вас");
    this.communities.setAdmin(community.id, target, rights);
    this.access.notifyUsers([target], community.id);
    return { ok: true };
  }

  /** Снять себя может любой админ; других — только с правом addAdmins. */
  public removeAdmin(uid: string, id: string, target: string) {
    const community = this.access.load(id, uid);
    const self = target === uid;
    const denied = self ? this.access.roleOf(community, uid) !== "admin" && community.ownerId !== uid : !this.access.rightsOf(community, uid).addAdmins;
    if (denied) throw new ApiError(403, "Недостаточно прав");
    if (target === community.ownerId) throw new ApiError(400, OWNER_RIGHTS);
    this.communities.removeAdmin(community.id, target);
    this.access.notifyUsers([target], community.id);
    return { ok: true };
  }

  public listBans(uid: string, id: string) {
    const community = this.access.load(id, uid, "ban");
    const users = [];
    for (const b of this.communities.listBans(community.id)) {
      const u = this.access.userCard(b.userId, { bannedAt: b.bannedAt });
      if (u) users.push(u);
    }
    return { users };
  }

  /** Сколько чатов уберётся вместе с пользователем (tweb Community.BanWarning). */
  public banPreview(uid: string, id: string, target: string) {
    const community = this.access.load(id, uid, "ban");
    return { chats: this.chatsOwnedIn(community, target).map((c) => ({ id: c.id, title: c.title })) };
  }

  /** Удалить из сообщества; его чаты уходят из сообщества вместе с ним. */
  public async ban(uid: string, id: string, target: string) {
    const community = this.access.load(id, uid, "ban");
    if (target === uid) throw new ApiError(400, "Нельзя удалить себя");
    if (target === community.ownerId) throw new ApiError(403, "Владельца удалить нельзя");
    if (this.access.roleOf(community, target) === "admin" && community.ownerId !== uid) {
      throw new ApiError(403, "Администратора может удалить только владелец");
    }
    const before = this.communities.listMemberIds(community.id);
    const owned = this.chatsOwnedIn(community, target);
    this.communities.ban(community.id, target, uid);
    for (const chat of owned) {
      this.communities.removeChat(community.id, chat.id);
      await this.access.announce(chat, this.access.leftText(community, chat));
    }
    this.access.notify(community.id, before);
    return { ok: true, removedChats: owned.length };
  }

  public unban(uid: string, id: string, target: string) {
    const community = this.access.load(id, uid, "ban");
    this.communities.unban(community.id, target);
    return { ok: true };
  }

  private chatsOwnedIn(community: Community, userId: string): Chat[] {
    return community.chatIds
      .map((chatId) => this.chats.findById(chatId))
      .filter((c): c is Chat => !!c && (c.ownerId === userId || (c.ownerIds ?? []).includes(userId)));
  }
}
