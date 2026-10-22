import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { genId } from "../../common/lib/gen-id.js";
import { ChatsRepository } from "../chats/chats.repository.js";
import { CommunitiesRepository } from "./communities.repository.js";
import { CommunityAccessService } from "./community-access.service.js";
import { cleanVisible, isChatAdmin } from "./lib/community-fields.js";
import type { Community, CommunityRequest } from "./model/domain.js";
import type { AddChatDto, ChatVisibleDto, DecideRequestDto } from "./model/schemas/community.schema.js";

const NOT_IN_COMMUNITY = "Чат не входит в сообщество";

// Чаты сообщества и заявки на их добавление (tweb Community.PendingRequests) — server/routes/communities.js.
@Injectable()
export class CommunityChatsService {
  public constructor(
    private readonly access: CommunityAccessService,
    private readonly communities: CommunitiesRepository,
    private readonly chats: ChatsRepository,
  ) {}

  /** Добавить свой чат; в режиме «только админы» обычный участник отправляет заявку. */
  public async add(uid: string, id: string, dto: AddChatDto) {
    const community = this.access.load(id, uid);
    const policy = this.access.addPolicy(community, uid);
    if (!policy) throw new ApiError(403, "Добавлять чаты могут только участники сообщества");
    const chat = this.access.addableChat(dto.chatId, uid);
    const visible = cleanVisible(dto.visible) ?? true;
    if (policy === "suggest") {
      const created = this.communities.addRequest({ id: genId("cr"), communityId: community.id, chatId: chat.id, suggestedBy: uid, visible });
      if (!created) throw new ApiError(409, "Заявка на этот чат уже отправлена");
      const managers = this.communities.listMemberIds(community.id).filter((m) => this.access.rightsOf(community, m).editChats);
      this.access.notifyUsers(managers, community.id);
      return { requested: true, community: this.access.view(community, uid) };
    }
    if (!(await this.access.linkChat(community, chat, { visible, addedBy: uid }))) {
      throw new ApiError(409, "Этот чат уже входит в другое сообщество");
    }
    return { community: this.access.view(this.access.reload(community.id), uid) };
  }

  /** Видимость чата в сообществе (tweb CommunityChatSettings). */
  public setVisible(uid: string, id: string, chatId: string, dto: ChatVisibleDto) {
    const community = this.access.load(id, uid, "editChats");
    if (!community.chatIds.includes(chatId)) throw new ApiError(404, NOT_IN_COMMUNITY);
    const visible = cleanVisible(dto.visible);
    if (visible === undefined) throw new ApiError(400, "Нужно visible: true или false");
    this.communities.setChatVisible(community.id, chatId, visible);
    this.access.notify(community.id);
    return { community: this.access.view(this.access.reload(community.id), uid) };
  }

  /** Убрать чат может тот, кто управляет чатами сообщества, или админ самого чата. */
  public async remove(uid: string, id: string, chatId: string) {
    const community = this.access.load(id, uid);
    if (!community.chatIds.includes(chatId)) throw new ApiError(404, NOT_IN_COMMUNITY);
    const chat = this.chats.findById(chatId);
    const allowed = this.access.rightsOf(community, uid).editChats || (chat && chat.memberIds.includes(uid) && isChatAdmin(chat, uid));
    if (!allowed) throw new ApiError(403, "Недостаточно прав");
    await this.access.unlinkChat(community, chatId, chat);
    return { community: this.access.view(this.access.reload(community.id), uid) };
  }

  public listRequests(uid: string, id: string) {
    const community = this.access.load(id, uid, "editChats");
    const requests = [];
    for (const r of this.communities.listRequests(community.id)) {
      const chat = this.chats.findById(r.chatId);
      if (!chat) continue;
      requests.push({ ...r, chat: this.access.chatCard(community, chat, uid), suggestedBy: this.access.userCard(r.suggestedBy) });
    }
    return { requests };
  }

  /** { approve } для одной заявки или для всех (requestId === "all"). */
  public async decide(uid: string, id: string, requestId: string, dto: DecideRequestDto) {
    const community = this.access.load(id, uid, "editChats");
    const approve = dto.approve === true;
    const list =
      requestId === "all"
        ? this.communities.listRequests(community.id)
        : [this.communities.findRequest(requestId)].filter((r): r is CommunityRequest => !!r && r.communityId === community.id);
    if (!list.length) throw new ApiError(404, "Заявка не найдена");
    let added = 0;
    for (const r of list) if (await this.resolve(community, r, approve, uid)) added++;
    return { added, declined: list.length - added, community: this.access.view(this.access.reload(community.id), uid) };
  }

  private async resolve(community: Community, request: CommunityRequest, approve: boolean, uid: string): Promise<boolean> {
    this.communities.deleteRequest(request.id);
    const chat = this.chats.findById(request.chatId);
    if (approve && chat && !this.communities.findByChat(chat.id)) {
      await this.access.linkChat(community, chat, { visible: request.visible, addedBy: request.suggestedBy });
      return true;
    }
    this.access.notifyUsers([request.suggestedBy, uid], community.id);
    return false;
  }
}
