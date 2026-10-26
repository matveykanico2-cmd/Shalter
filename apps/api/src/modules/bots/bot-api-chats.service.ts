import { randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { genId } from "../../common/lib/gen-id.js";
import { checkUsername, joinApproval } from "../../legacy/legacy.js";
import { ChatsRepository } from "../chats/chats.repository.js";
import { JoinRequestsRepository } from "../chats/join-requests.repository.js";
import { sanitizePermissions } from "../chats/lib/chat-permissions.js";
import type { Chat, NewChat } from "../chats/model/domain.js";
import { MessagesRepository } from "../messages/messages.repository.js";
import { RealtimeService } from "../realtime/realtime.service.js";
import { publicUser } from "../users/lib/user.presenter.js";
import type { User } from "../users/model/domain.js";
import { UserPrivacyService } from "../users/user-privacy.service.js";
import { UsersRepository } from "../users/users.repository.js";
import { BotApiAccessService } from "./bot-api-access.service.js";
import { str } from "./lib/bot-api.js";
import type { Bot } from "./model/domain.js";
import type {
  ChatIdQueryDto,
  ChatTextDto,
  CreateChannelDto,
  CreateGroupDto,
  DiscussionDto,
  InviteLinkDto,
  MemberActionDto,
  PermissionsDto,
} from "./model/schemas/bot-api.schema.js";

const hasText = (value: unknown): value is string => typeof value === "string" && !!value.trim();

// Bot API: чаты — список, карточки, участники и управление группами и каналами (server/routes/botApi.js).
@Injectable()
export class BotApiChatsService {
  public constructor(
    private readonly access: BotApiAccessService,
    private readonly chats: ChatsRepository,
    private readonly joinRequests: JoinRequestsRepository,
    private readonly messages: MessagesRepository,
    private readonly users: UsersRepository,
    private readonly privacy: UserPrivacyService,
    private readonly realtime: RealtimeService
  ) {}

  public list(bot: Bot) {
    return {
      chats: this.chats.findForUser(bot.userId).map((c) => ({
        id: c.id,
        type: c.type,
        title: c.title,
        username: c.username ?? null,
        memberCount: c.memberIds.length,
        isAdmin: (c.adminIds ?? []).includes(bot.userId),
      })),
    };
  }

  public get(bot: Bot, query: ChatIdQueryDto) {
    const chat = this.access.memberChat(bot, query.chatId);
    return {
      chat: {
        id: chat.id,
        type: chat.type,
        title: chat.title,
        username: chat.username ?? null,
        description: chat.description ?? null,
        memberCount: chat.memberIds.length,
        isAdmin: (chat.adminIds ?? []).includes(bot.userId),
      },
      members: this.usersInOrder(chat.memberIds).map(publicUser),
    };
  }

  public admins(bot: Bot, query: ChatIdQueryDto) {
    const chat = this.access.memberChat(bot, query.chatId);
    return { ownerId: chat.ownerId, admins: this.usersInOrder(chat.adminIds ?? []).map(publicUser) };
  }

  public memberCount(bot: Bot, query: ChatIdQueryDto) {
    return { count: this.access.memberChat(bot, query.chatId).memberIds.length };
  }

  public member(bot: Bot, query: ChatIdQueryDto) {
    const chat = this.access.memberChat(bot, query.chatId);
    const user = this.users.findById(query.userId);
    if (!user || !chat.memberIds.includes(user.id)) throw new ApiError(404, "User is not a member");
    return {
      user: publicUser(user),
      isAdmin: (chat.adminIds ?? []).includes(user.id),
      isOwner: chat.ownerId === user.id,
      restrictedUntil: chat.restrictions?.[user.id] ?? null,
    };
  }

  /** Заявки на вступление (chat.approveJoins) — бот-админ рассматривает их сам. */
  public joinRequestList(bot: Bot, dto: MemberActionDto) {
    const chat = this.access.adminChat(bot, dto.chatId);
    const requests = this.joinRequests.list(chat.id).map((r) => {
      const u = this.users.findById(r.userId);
      return { userId: r.userId, createdAt: r.createdAt, name: u?.name ?? "", username: u?.username ?? "", bio: u?.bio ?? "" };
    });
    return { requests };
  }

  public async decideJoinRequest(bot: Bot, dto: MemberActionDto, approve: boolean) {
    const chat = this.access.adminChat(bot, dto.chatId);
    try {
      const result = await joinApproval().decideJoinRequest(chat.id, str(dto.userId), approve, bot.userId);
      return { ok: true, approved: result.approved };
    } catch (err) {
      const e = err as { status?: number; message?: string };
      throw new ApiError(e.status ?? 500, e.message ?? "");
    }
  }

  public ban(bot: Bot, dto: MemberActionDto) {
    const chat = this.access.adminChat(bot, dto.chatId);
    const userId = dto.userId as string;
    if (userId === chat.ownerId || (chat.adminIds ?? []).includes(userId)) throw new ApiError(400, "Cannot remove the owner or an admin");
    if (!chat.memberIds.includes(userId)) throw new ApiError(404, "User is not a member");
    const updated = this.chats.update(chat.id, {
      memberIds: chat.memberIds.filter((id) => id !== userId),
      bannedIds: [...new Set([...(chat.bannedIds ?? []), userId])],
    })!;
    this.realtime.broadcastToUsers([userId], { type: "chat:deleted", chatId: chat.id });
    this.realtime.broadcastToUsers(updated.memberIds, { type: "chat:updated", chat: updated });
    return { ok: true, memberCount: updated.memberIds.length };
  }

  public unban(bot: Bot, dto: MemberActionDto) {
    const chat = this.access.adminChat(bot, dto.chatId);
    this.chats.update(chat.id, { bannedIds: (chat.bannedIds ?? []).filter((id) => id !== dto.userId) });
    return { ok: true };
  }

  public restrict(bot: Bot, dto: MemberActionDto) {
    const chat = this.access.adminChat(bot, dto.chatId);
    const userId = dto.userId as string;
    if (userId === chat.ownerId || (chat.adminIds ?? []).includes(userId)) throw new ApiError(400, "Cannot restrict the owner or an admin");
    const until = new Date(Date.now() + dto.minutes * 60000).toISOString();
    const updated = this.chats.update(chat.id, { restrictions: { ...(chat.restrictions ?? {}), [String(userId)]: until } });
    this.realtime.broadcastToUsers(chat.memberIds, { type: "chat:updated", chat: updated });
    return { ok: true, until };
  }

  public promote(bot: Bot, dto: MemberActionDto) {
    const chat = this.access.adminChat(bot, dto.chatId);
    const userId = dto.userId as string;
    if (userId === chat.ownerId || (chat.ownerIds ?? []).includes(userId)) throw new ApiError(400, "Cannot change the owner");
    if (!chat.memberIds.includes(userId)) throw new ApiError(404, "User is not a member");
    const current = new Set(chat.adminIds ?? []);
    if (dto.admin) current.add(userId);
    else current.delete(userId);
    const updated = this.chats.update(chat.id, { adminIds: [...current] })!;
    this.realtime.broadcastToUsers(updated.memberIds, { type: "chat:updated", chat: updated });
    return { ok: true, adminIds: updated.adminIds };
  }

  public addMember(bot: Bot, dto: MemberActionDto) {
    const chat = this.access.adminChat(bot, dto.chatId);
    const user = this.users.findById(str(dto.userId));
    if (!user) throw new ApiError(404, "User not found");
    if (chat.memberIds.includes(user.id)) return { ok: true, alreadyMember: true };
    if ((chat.bannedIds ?? []).includes(user.id)) throw new ApiError(403, "User is banned in this chat");
    if (!this.privacy.allowsUser(user.id, "invites", bot.userId)) throw new ApiError(403, "User does not allow being added to chats");
    const updated = this.chats.update(chat.id, { memberIds: [...chat.memberIds, user.id] })!;
    this.realtime.broadcastToUsers(updated.memberIds, { type: "chat:updated", chat: updated });
    return { ok: true, memberCount: updated.memberIds.length };
  }

  public setTitle(bot: Bot, dto: ChatTextDto) {
    const chat = this.access.adminChat(bot, dto.chatId);
    if (!hasText(dto.title)) throw new ApiError(400, "title is required");
    const updated = this.chats.update(chat.id, { title: dto.title.trim().slice(0, 120) })!;
    this.realtime.broadcastToUsers(chat.memberIds, { type: "chat:updated", chat: updated });
    return { chat: { id: updated.id, title: updated.title } };
  }

  public setDescription(bot: Bot, dto: ChatTextDto) {
    const chat = this.access.adminChat(bot, dto.chatId);
    const updated = this.chats.update(chat.id, { description: dto.description.slice(0, 500) })!;
    this.realtime.broadcastToUsers(chat.memberIds, { type: "chat:updated", chat: updated });
    return { chat: { id: updated.id, description: updated.description } };
  }

  public setPermissions(bot: Bot, dto: PermissionsDto) {
    const chat = this.access.adminChat(bot, dto.chatId);
    const clean = sanitizePermissions(dto.permissions);
    if (!clean) throw new ApiError(400, "permissions object is required");
    const updated = this.chats.update(chat.id, { permissions: { ...(chat.permissions ?? {}), ...clean } })!;
    this.realtime.broadcastToUsers(updated.memberIds, { type: "chat:updated", chat: updated });
    return { permissions: updated.permissions };
  }

  public inviteLink(bot: Bot, dto: InviteLinkDto) {
    const chat = this.access.adminChat(bot, dto.chatId);
    const code = chat.inviteCode && !dto.revoke ? chat.inviteCode : randomBytes(16).toString("base64url").slice(0, 22);
    const updated = chat.inviteCode === code ? chat : this.chats.update(chat.id, { inviteCode: code })!;
    return { code: updated.inviteCode, link: `/join/${updated.inviteCode}` };
  }

  public leave(bot: Bot, dto: MemberActionDto) {
    const chat = this.access.memberChat(bot, dto.chatId);
    const updated = this.chats.update(chat.id, { memberIds: chat.memberIds.filter((id) => id !== bot.userId) })!;
    this.realtime.broadcastToUsers(updated.memberIds, { type: "chat:updated", chat: updated });
    return { ok: true };
  }

  /** Группа с ботом-владельцем; позвать можно только тех, с кем бот уже в каком-то чате. */
  public createGroup(bot: Bot, dto: CreateGroupDto) {
    const known = new Set<string>();
    for (const c of this.chats.findForUser(bot.userId)) for (const id of c.memberIds) known.add(id);
    const invited: string[] = [];
    for (const id of new Set(dto.memberIds)) {
      if (known.has(id) && id !== bot.userId && this.privacy.allowsUser(id, "invites", bot.userId)) invited.push(id);
    }
    const chat = this.create(bot, { type: "group", title: dto.title.trim().slice(0, 120), avatarColor: "#5b8def", memberIds: [bot.userId, ...invited], adminIds: [bot.userId] });
    this.realtime.broadcastToUsers(chat.memberIds, { type: "chat:added", chat });
    return { chat: { id: chat.id, title: chat.title, memberCount: chat.memberIds.length } };
  }

  /** Канал с ботом-владельцем; владелец бота — участник и админ. */
  public async createChannel(bot: Bot, dto: CreateChannelDto) {
    const handle = dto.username;
    if (handle !== null) {
      const problem = await checkUsername(handle);
      if (problem) throw new ApiError(problem.status, problem.error);
    }
    const team = this.team(bot);
    const chat = this.create(bot, {
      type: "channel",
      title: dto.title.trim().slice(0, 120),
      description: dto.description,
      username: handle,
      isPublic: dto.isPublic && !!handle,
      avatarColor: "#5b8def",
      memberIds: team,
      adminIds: team,
    });
    this.realtime.broadcastToUsers(chat.memberIds, { type: "chat:added", chat });
    return { chat: { id: chat.id, title: chat.title, username: chat.username, isPublic: !!chat.isPublic } };
  }

  /** Обсуждение канала: создать группу, привязать свою или отвязать. */
  public setDiscussion(bot: Bot, dto: DiscussionDto) {
    const channel = this.access.runsChat(bot, dto.channelId, "channel");
    const { action } = dto;

    if (action === "unlink") {
      const updated = this.chats.update(channel.id, { linkedDiscussionChatId: null })!;
      this.realtime.broadcastToUsers(updated.memberIds, { type: "chat:updated", chat: updated });
      return { chat: updated, discussion: null };
    }

    if (action === "link") {
      const group = this.access.runsChat(bot, dto.groupId, "group");
      const taken = this.chats.findForUser(bot.userId).find((c) => c.id !== channel.id && c.linkedDiscussionChatId === group.id);
      if (taken) throw new ApiError(409, `Эта группа уже обсуждение канала «${taken.title}»`);
      const updated = this.chats.update(channel.id, { linkedDiscussionChatId: group.id })!;
      this.realtime.broadcastToUsers(updated.memberIds, { type: "chat:updated", chat: updated });
      return { chat: updated, discussion: { id: group.id, title: group.title } };
    }

    if (action === "create") {
      const team = this.team(bot);
      const discussion = this.create(bot, {
        type: "group",
        title: (dto.title ?? `${channel.title} · Обсуждение`).trim().slice(0, 120),
        avatarColor: "#5C6473",
        memberIds: team,
        adminIds: team,
      });
      const updated = this.chats.update(channel.id, { linkedDiscussionChatId: discussion.id })!;
      this.realtime.broadcastToUsers(updated.memberIds, { type: "chat:updated", chat: updated });
      return { chat: updated, discussion: { id: discussion.id, title: discussion.title } };
    }

    throw new ApiError(400, "action: create | link | unlink");
  }

  public discussion(bot: Bot, query: ChatIdQueryDto) {
    const channel = this.access.runsChat(bot, query.channelId, "channel");
    const linked = channel.linkedDiscussionChatId ? this.chats.findById(channel.linkedDiscussionChatId) : null;
    return {
      channel: { id: channel.id, title: channel.title },
      discussion: linked ? { id: linked.id, title: linked.title, memberCount: linked.memberIds.length } : null,
    };
  }

  public channelStats(bot: Bot, query: ChatIdQueryDto) {
    const chat = this.chats.findById(query.chatId);
    if (!chat || chat.type !== "channel") throw new ApiError(404, "Channel not found");
    if (!(chat.adminIds ?? []).includes(bot.userId)) throw new ApiError(403, "Bot must be an admin of this channel");
    const posts = this.messages.listFeed(chat.id, bot.userId).filter((m) => m.type !== "system");
    return {
      subscribers: chat.memberIds.length,
      posts: posts.length,
      views: posts.reduce((s, m) => s + (m.views ?? 0), 0),
      comments: posts.reduce((s, m) => s + (m.commentCount ?? 0), 0),
    };
  }

  /** Бот и его владелец (если есть). */
  private team(bot: Bot): string[] {
    return [bot.userId, bot.ownerId].filter((id): id is string => !!id);
  }

  /** Чат, где бот — владелец. Обсуждение канала server/ создаёт без chat:added, поэтому рассылка — у вызывающего. */
  private create(bot: Bot, fields: Omit<NewChat, "id" | "ownerId" | "pinned" | "muted" | "archived" | "createdAt">): Chat {
    return this.chats.create({ id: genId("c"), ...fields, ownerId: bot.userId, pinned: false, muted: false, archived: false, createdAt: new Date().toISOString() });
  }

  /** Пользователи в порядке ids, без несуществующих. */
  private usersInOrder(ids: string[]): User[] {
    return ids.map((id) => this.users.findById(id)).filter((u): u is User => !!u);
  }
}
