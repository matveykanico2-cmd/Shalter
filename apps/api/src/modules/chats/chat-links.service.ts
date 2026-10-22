import { randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { joinApproval, messages } from "../../legacy/legacy.js";
import { RealtimeService } from "../realtime/realtime.service.js";
import { publicUser } from "../users/lib/user.presenter.js";
import { UsersRepository } from "../users/users.repository.js";
import { UserPrivacyService } from "../users/user-privacy.service.js";
import { ChatNotesService } from "./chat-notes.service.js";
import { ChatsRepository } from "./chats.repository.js";
import { JoinRequestsRepository } from "./join-requests.repository.js";
import { isOwnerOrAdminOf } from "./lib/chat-roles.js";
import type { Chat } from "./model/domain.js";

// Вход в группу или канал со стороны: превью публичного чата, @юзернейм, ссылка-приглашение,
// вступление и заявки на него.
@Injectable()
export class ChatLinksService {
  public constructor(
    private readonly chats: ChatsRepository,
    private readonly users: UsersRepository,
    private readonly joinRequests: JoinRequestsRepository,
    private readonly notes: ChatNotesService,
    private readonly realtime: RealtimeService,
    private readonly privacy: UserPrivacyService
  ) {}

  /**
   * Превью публичного канала или группы для тех, кто ещё не вступил: лента и кнопка
   * «Подписаться», как в tweb. Без скрытых ответов ботов; прочитанным ничего не отмечается.
   */
  public async preview(uid: string, chatId: string, rawLimit: unknown) {
    const chat = this.chats.findById(chatId);
    if (!chat || !chat.isPublic || chat.secret || (chat.type !== "group" && chat.type !== "channel")) throw new ApiError(404, "Чат не найден");
    if (chat.bannedIds.includes(uid)) throw new ApiError(403, "Вас заблокировали в этом чате");
    const limit = Math.min(Math.max(Number(rawLimit) || 50, 1), 100);
    const page = messages().listMessagesPage(chat.id, uid, undefined, { limit });
    const feed = page.messages.filter((m) => !m.visibleToId && !m.threadRootId);
    const senders = this.privacy.publicUsersFor(this.users.findByIds(feed.map((m) => m.senderId)), uid);
    return {
      chat: { ...this.card(uid, chat), approveJoins: !!chat.approveJoins, requestPending: this.joinRequests.has(chat.id, uid) },
      messages: feed,
      senders,
      hasMore: page.hasMore,
    };
  }

  public byUsername(uid: string, username: string) {
    const chat = this.chats.findByUsername(username.replace(/^@/, ""));
    if (!chat || !chat.isPublic) throw new ApiError(404, "not found");
    return {
      chat: {
        ...this.card(uid, chat),
        banned: chat.bannedIds.includes(uid),
        approveJoins: !!chat.approveJoins,
        requestPending: this.joinRequests.has(chat.id, uid),
      },
    };
  }

  /** Вступить в публичную группу или канал; с одобрением — заявка админам. */
  public async join(uid: string, chatId: string) {
    const chat = this.chats.findById(chatId);
    if (!chat || !chat.isPublic || (chat.type !== "group" && chat.type !== "channel")) throw new ApiError(404, "Чат не найден");
    if (chat.memberIds.includes(uid)) return { chat };
    if (chat.bannedIds.includes(uid)) throw new ApiError(403, "Вас заблокировали в этом чате");
    if (chat.approveJoins) {
      await joinApproval().submitJoinRequest(chat, uid);
      return { pending: true };
    }
    return { chat: await this.addMember(uid, chat, "вступил(а) в группу") };
  }

  /** Ссылка-приглашение: та же или (revoke) новая, старая перестаёт работать. */
  public invite(uid: string, chat: Chat, revoke: unknown) {
    if (chat.type === "dm") throw new ApiError(400, "Пригласительная ссылка есть только у групп и каналов");
    if (!isOwnerOrAdminOf(chat, uid)) throw new ApiError(403, "Недостаточно прав");
    const code = chat.inviteCode && !revoke ? chat.inviteCode : randomBytes(16).toString("base64url").slice(0, 22);
    const updated = chat.inviteCode === code ? chat : this.chats.update(chat.id, { inviteCode: code });
    return { code, chat: updated };
  }

  public inviteInfo(uid: string, code: string) {
    const chat = this.chats.findByInviteCode(code);
    if (!chat) throw new ApiError(404, "Ссылка недействительна или отозвана");
    return {
      chat: {
        id: chat.id,
        type: chat.type,
        title: chat.title,
        description: chat.description,
        avatarColor: chat.avatarColor,
        avatarImage: chat.avatarImage,
        isVerified: chat.isVerified,
        memberCount: chat.memberIds.length,
        alreadyMember: chat.memberIds.includes(uid),
        banned: chat.bannedIds.includes(uid),
        approveJoins: !!chat.approveJoins,
        requestPending: this.joinRequests.has(chat.id, uid),
      },
    };
  }

  public async joinByInvite(uid: string, code: string) {
    const chat = this.chats.findByInviteCode(code);
    if (!chat) throw new ApiError(404, "Ссылка недействительна или отозвана");
    if (chat.memberIds.includes(uid)) return { chat };
    if (chat.bannedIds.includes(uid)) throw new ApiError(403, "Вас заблокировали в этом чате");
    if (chat.approveJoins) {
      await joinApproval().submitJoinRequest(chat, uid);
      return { pending: true, chat: { id: chat.id, title: chat.title, type: chat.type } };
    }
    return { chat: await this.addMember(uid, chat, "вступил(а) в группу по ссылке-приглашению") };
  }

  public listJoinRequests(uid: string, chat: Chat) {
    if (!isOwnerOrAdminOf(chat, uid)) throw new ApiError(403, "Недостаточно прав");
    const requests = this.joinRequests.list(chat.id).map((r) => {
      const user = this.users.findById(r.userId);
      return { ...r, user: user && publicUser(user) };
    });
    return { requests: requests.filter((r) => r.user) };
  }

  public async decideJoinRequest(uid: string, chat: Chat, userId: string, approve: unknown) {
    if (!isOwnerOrAdminOf(chat, uid)) throw new ApiError(403, "Недостаточно прав");
    try {
      const result = await joinApproval().decideJoinRequest(chat.id, userId, approve !== false, uid);
      return { ok: true, approved: result.approved, ...(result.approved ? { chat: result.chat } : {}) };
    } catch (err) {
      const { status, message } = err as { status?: number; message?: string };
      throw new ApiError(status ?? 500, message ?? "");
    }
  }

  // Карточка чата для того, кто его ищет: без участников, с их числом.
  private card(uid: string, chat: Chat) {
    return {
      id: chat.id,
      type: chat.type,
      title: chat.title,
      username: chat.username,
      description: chat.description ?? null,
      avatarColor: chat.avatarColor,
      avatarImage: chat.avatarImage,
      isVerified: !!chat.isVerified,
      subscribers: chat.memberIds.length,
      isMember: chat.memberIds.includes(uid),
    };
  }

  // Вступление без одобрения: новый участник получает чат, остальные — обновление; в
  // группе — строка в ленте и приветствие.
  private async addMember(uid: string, chat: Chat, joinedText: string): Promise<Chat> {
    const updated = this.chats.update(chat.id, { memberIds: [...chat.memberIds, uid] })!;
    this.realtime.broadcastToUsers([uid], { type: "chat:added", chat: updated });
    this.realtime.broadcastToUsers(chat.memberIds, { type: "chat:updated", chat: updated });
    if (chat.type === "group") {
      await this.notes.system(updated, `${this.users.findById(uid)?.name ?? "Кто-то"} ${joinedText}`);
      await joinApproval().sendWelcome(updated, uid);
    }
    return updated;
  }
}
