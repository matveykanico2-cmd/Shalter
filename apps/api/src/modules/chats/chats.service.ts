import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { genId } from "../../common/lib/gen-id.js";
import { hasAdminSection } from "../../common/lib/admin-access.js";
import {
  chatSummary,
  checkUsername,
  getBotByUserId,
  isSafeUrl,
  messageCost,
  messages,
  moderateDeleteChat,
  privacyRules,
  serviceLine,
  settings,
  typing,
  usesForeignUpload,
  type ChatFlags,
  type UserSettings,
} from "../../legacy/legacy.js";
import { RealtimeService } from "../realtime/realtime.service.js";
import type { User } from "../users/model/domain.js";
import { UsersRepository } from "../users/users.repository.js";
import { AdminLogService } from "./admin-log.service.js";
import { ChatNotesService } from "./chat-notes.service.js";
import { ChatsRepository } from "./chats.repository.js";
import { colorState, colorUnlocked, lockedColorError } from "./lib/chat-features.js";
import { isOwnerOrAdminOf } from "./lib/chat-roles.js";
import { durationLabel } from "./lib/duration-label.js";
import type { Chat, ChatPatch } from "./model/domain.js";
import type {
  CreateCommunityDto,
  CreateDmDto,
  PatchChatDto,
  WallpaperDto,
  MuteDto,
} from "./model/schemas/chat.schema.js";

const PERSONAL_FLAGS = ["pinned", "archived", "muted", "unread"] as const;
const EDITABLE_BY_STAFF = ["title", "description", "avatarImage", "avatarColor", "autoDeleteSeconds"] as const;
type PersonalFlag = (typeof PERSONAL_FLAGS)[number];

// Чаты пользователя: список, создание, правка, удаление, выход, «печатает…».
@Injectable()
export class ChatsService {
  public constructor(
    private readonly chats: ChatsRepository,
    private readonly users: UsersRepository,
    private readonly notes: ChatNotesService,
    private readonly adminLog: AdminLogService,
    private readonly realtime: RealtimeService
  ) {}

  public async list(uid: string, deviceId: string | null) {
    const chats = this.chats.findForUser(uid, deviceId);
    const { hiddenChats } = await settings().getSettings(uid);
    const summary = chatSummary();
    return { chats: summary.withoutHidden(await summary.attachSummaries(chats, uid), hiddenChats) };
  }

  public async setPinnedOrder(uid: string, ids: unknown) {
    if (!Array.isArray(ids) || ids.length > 500 || !ids.every((id) => typeof id === "string")) {
      throw new ApiError(400, "Нужен список чатов");
    }
    const current = await settings().getSettings(uid);
    const flags = current.chatFlags ?? {};
    const mine = new Set(this.chats.findForUser(uid).map((c) => c.id));
    const wanted = [...new Set(ids as string[])].filter((id) => mine.has(id) && flags[id]?.pinned === true);
    const rest = (current.pinnedOrder ?? []).filter((id) => !wanted.includes(id));
    await settings().updateSettings(uid, { pinnedOrder: [...wanted, ...rest] });
    return { ok: true, pinnedOrder: [...wanted, ...rest] };
  }

  /** Личка с userId (с собой — «Избранное»); уже есть — она же. */
  public createDm(uid: string, { userId, title, avatarColor }: CreateDmDto) {
    const self = userId === uid;
    if (!self && !(typeof userId === "string" && this.users.findById(userId))) throw new ApiError(404, "Пользователь не найден");
    const otherId = userId as string;
    const existing = this.chats.findDmBetween(uid, otherId);
    if (existing) return { chat: existing };
    const chat = this.chats.create({
      id: genId("c"),
      type: "dm",
      title: title as string | undefined,
      avatarColor: avatarColor as string | undefined,
      memberIds: [uid, otherId],
      pinned: false,
      muted: false,
      archived: false,
      createdAt: new Date().toISOString(),
    });
    return { chat };
  }

  /**
   * Секретный чат: личка со своим ключом шифрования, привязанная к устройству. С одним
   * человеком их может быть несколько — как в Telegram.
   */
  public async createSecret(uid: string, deviceId: string | undefined, userId: unknown) {
    if (!deviceId) throw new ApiError(400, "Не удалось определить устройство");
    if (typeof userId !== "string" || userId === uid) throw new ApiError(400, "Выберите собеседника");
    const other = this.users.findById(userId);
    if (!other) throw new ApiError(404, "Пользователь не найден");
    if (other.isBot) throw new ApiError(400, "С ботом секретный чат не начать");
    if ((other.blockedUserIds ?? []).includes(uid)) throw new ApiError(403, "Пользователь заблокировал вас");

    const chat = this.chats.create({
      id: genId("c"),
      type: "dm",
      title: "",
      memberIds: [uid, userId],
      pinned: false,
      muted: false,
      archived: false,
      createdAt: new Date().toISOString(),
      secret: true,
      secretDevices: { [uid]: deviceId },
    });
    // Без сообщения пустая личка не показывается в списке чатов.
    await serviceLine(
      chat,
      uid,
      (name) => `${name} начал(а) секретный чат. Сообщения шифруются ключом этого чата, их нельзя переслать, а сам чат доступен только на этом устройстве.`
    );
    return { chat: this.chats.findById(chat.id) };
  }

  public async createChannel(uid: string, body: CreateCommunityDto) {
    const { title, avatarImage, memberIds, adminIds } = body;
    if (typeof title !== "string" || !title.trim()) throw new ApiError(400, "Введите название канала");
    if (usesForeignUpload(uid, avatarImage)) throw new ApiError(400, "Некорректное изображение");
    const identity = await this.newChatIdentity(body);
    const now = new Date().toISOString();
    const members = new Set([uid, ...(await this.invitableIds(memberIds, uid))]);
    const discussion = this.chats.create({
      id: genId("c"),
      type: "group",
      title: `${title.trim()} · Обсуждение`,
      avatarColor: "#5C6473",
      memberIds: [uid],
      ownerId: uid,
      adminIds: [uid],
      pinned: false,
      muted: false,
      archived: false,
      createdAt: now,
    });
    const channel = this.chats.create({
      id: genId("c"),
      type: "channel",
      title: title.trim(),
      ...identity,
      avatarColor: "#D9822E",
      avatarImage: (avatarImage as string) || undefined,
      memberIds: [...members],
      ownerId: uid,
      adminIds: staffOf(members, uid, adminIds),
      pinned: false,
      muted: false,
      archived: false,
      linkedDiscussionChatId: discussion.id,
      createdAt: now,
    });
    await this.notes.note(channel, null, () => `Канал «${channel.title}» создан`);
    await this.notes.note(discussion, null, () => `Группа обсуждения канала «${channel.title}» создана`);
    // Приглашённые видят новый канал сразу, без перезагрузки списка чатов.
    this.realtime.broadcastToUsers(channel.memberIds.filter((id) => id !== uid), { type: "chat:added", chat: channel });
    return { chat: channel };
  }

  public async createGroup(uid: string, body: CreateCommunityDto) {
    const { title, avatarImage, memberIds, adminIds } = body;
    if (typeof title !== "string" || !title.trim()) throw new ApiError(400, "Введите название группы");
    if (usesForeignUpload(uid, avatarImage)) throw new ApiError(400, "Некорректное изображение");
    const identity = await this.newChatIdentity(body);
    const members = new Set([uid, ...(await this.invitableIds(memberIds, uid))]);
    const chat = this.chats.create({
      id: genId("c"),
      type: "group",
      title: title.trim(),
      ...identity,
      avatarColor: "#2E56D9",
      avatarImage: (avatarImage as string) || undefined,
      memberIds: [...members],
      ownerId: uid,
      adminIds: staffOf(members, uid, adminIds),
      pinned: false,
      muted: false,
      archived: false,
      createdAt: new Date().toISOString(),
    });
    await this.notes.note(chat, uid, (name) => `${name} создал(а) группу «${chat.title}»`);
    this.realtime.broadcastToUsers(chat.memberIds.filter((id) => id !== uid), { type: "chat:added", chat });
    return { chat };
  }

  /** Чат с участниками (подписчику канала — только админы и он сам), командами бота и ценой сообщений. */
  public async detail(uid: string, chat: Chat) {
    const [summary] = await chatSummary().attachSummaries([chat], uid);
    const visibleIds = hidesMembers(chat, uid) ? chat.memberIds.filter((id) => id === uid || isOwnerOrAdminOf(chat, id)) : chat.memberIds;
    const users = this.users.findByIds(visibleIds);
    const byId = new Map(users.map((u) => [u.id, u]));
    const memberUsers = visibleIds.map((id) => byId.get(id)).filter((u): u is User => u !== undefined);
    const members = await privacyRules().publicUsersFor(memberUsers, uid);

    const botMember = members.find((u) => u.isBot && u.id !== uid);
    const bot = botMember ? await getBotByUserId(botMember.id) : undefined;
    const commands = bot?.commands?.length ? bot.commands : null;

    let paidMessages: { stars: number; youPay: boolean; kind?: "comment" } | null = null;
    if (chat.type === "dm") {
      const other = users.find((u) => u.id !== uid);
      if (other && !other.isBot) {
        const { price, mustPay } = await messageCost(uid, other, chat.id);
        if (price > 0) paidMessages = { stars: price, youPay: mustPay };
      }
    } else if (chat.type === "group") {
      const channel = this.chats.findChannelByDiscussion(chat.id);
      const price = channel?.commentPriceStars ?? 0;
      if (channel && price > 0) {
        const me = this.users.findById(uid);
        const youPay = channel.ownerId !== uid && !isOwnerOrAdminOf(channel, uid) && !me?.isPremium;
        paidMessages = { stars: price, youPay, kind: "comment" };
      }
    }
    return { chat: summary, members, commands, paidMessages };
  }

  /**
   * Правка чата. Только перечисленные поля: раньше тело целиком уходило в updateChat, и
   * любой участник мог вписать себя в владельцы, поменять участников, снять баны.
   * pinned/archived/muted/unread — личные флаги в настройках пользователя.
   */
  public async update(uid: string, chat: Chat, body: PatchChatDto) {
    const patch: ChatPatch = {};
    const personal: Partial<Record<PersonalFlag, boolean>> = {};
    if (typeof body.title === "string") {
      patch.title = body.title.trim().slice(0, 128);
      if (!patch.title) throw new ApiError(400, "Название не может быть пустым");
    }
    if (typeof body.description === "string") patch.description = body.description.trim().slice(0, 500) || null;
    if ("avatarImage" in body) {
      if (body.avatarImage && (!(typeof body.avatarImage === "string" && isSafeUrl(body.avatarImage)) || usesForeignUpload(uid, body.avatarImage, chat.avatarImage))) {
        throw new ApiError(400, "Некорректное изображение");
      }
      patch.avatarImage = (body.avatarImage as string) || null;
    }
    if (typeof body.avatarColor === "string") patch.avatarColor = body.avatarColor.slice(0, 32);
    if ("autoDeleteSeconds" in body) {
      const sec = Number(body.autoDeleteSeconds) || 0;
      if (!Number.isInteger(sec) || sec < 0 || sec > 366 * 86400) throw new ApiError(400, "Некорректный срок автоудаления");
      patch.autoDeleteSeconds = sec || null;
    }
    for (const k of PERSONAL_FLAGS) if (k in body) personal[k] = !!body[k];

    if (patch.avatarColor !== undefined && !colorUnlocked(chat, patch.avatarColor)) {
      throw new ApiError(403, lockedColorError(patch.avatarColor));
    }
    if (chat.type !== "dm" && EDITABLE_BY_STAFF.some((k) => k in patch) && !isOwnerOrAdminOf(chat, uid)) {
      throw new ApiError(403, "Менять настройки чата могут владельцы и админы");
    }

    if (Object.keys(personal).length) await this.setPersonalFlags(uid, chat.id, personal);
    if (!Object.keys(patch).length) {
      const [summary] = await chatSummary().attachSummaries([chat], uid);
      return { chat: summary };
    }

    const updated = this.chats.update(chat.id, patch)!;
    this.realtime.broadcastToUsers(updated.memberIds, { type: "chat:updated", chat: updated });
    if (chat.type !== "dm") {
      for (const k of ["title", "description", "avatarImage", "autoDeleteSeconds"] as const) {
        if (k in patch && patch[k] !== chat[k]) {
          this.adminLog.record(chat.id, uid, `chat_${k}`, { details: k === "avatarImage" ? null : { value: patch[k] } });
        }
      }
    }
    if (chat.type === "group" || chat.type === "channel") await this.announceUpdate(uid, chat, updated, patch);
    return { chat: updated };
  }

  public features(chat: Chat) {
    return { colors: colorState(chat), points: chat.points ?? 0 };
  }

  /** Удалить для всех: владелец или админ, в личке — любой из двоих; модератор Shalter — с причиной. */
  public async remove(uid: string, chatId: string, reason: unknown) {
    const chat = this.chats.findById(chatId);
    if (!chat) throw new ApiError(404, "not found");
    const member = chat.memberIds.includes(uid);
    const ownStaff = member && (chat.type === "dm" || chat.type === "bot" || isOwnerOrAdminOf(chat, uid));
    const moderator = !ownStaff && chat.type !== "dm" && hasAdminSection(this.users.findById(uid), "moderation");
    if (!member && !moderator) throw new ApiError(404, "not found");
    if (!ownStaff && !moderator) throw new ApiError(403, "Удалить чат для всех может только владелец или админ");
    if (moderator) {
      await moderateDeleteChat(chat, { adminId: uid, reason: String(reason ?? "").trim().slice(0, 500) });
      return { ok: true };
    }
    this.realtime.broadcastToUsers(chat.memberIds, { type: "chat:deleted", chatId: chat.id });
    await messages().deleteMessagesForChat(chat.id);
    this.chats.delete(chat.id);
    return { ok: true };
  }

  public async clear(uid: string, chat: Chat, forEveryone: unknown) {
    if (forEveryone && chat.type !== "dm" && !isOwnerOrAdminOf(chat, uid)) {
      throw new ApiError(403, "Очистить историю у всех могут только владельцы и админы");
    }
    if (forEveryone) await messages().deleteMessagesForChat(chat.id);
    else await settings().setChatCleared(uid, chat.id, new Date().toISOString());
    return { ok: true };
  }

  /** Фон чата: себе — в настройках, всем — в самом чате (в группе и канале — владельцы и админы). */
  public async setWallpaper(uid: string, chat: Chat, { wallpaper, forEveryone, label }: WallpaperDto) {
    const own = (await settings().getSettings(uid))?.chatWallpapers?.[chat.id];
    if (usesForeignUpload(uid, wallpaper, [chat.wallpaper, own])) throw new ApiError(400, "Некорректная ссылка на файл");
    if (forEveryone && chat.type !== "dm" && !isOwnerOrAdminOf(chat, uid)) {
      throw new ApiError(403, "Менять фон для всех могут только владельцы и админы");
    }
    if (forEveryone) {
      const updated = this.chats.update(chat.id, { wallpaper: wallpaper ?? null })!;
      this.realtime.broadcastToUsers(updated.memberIds, { type: "chat:updated", chat: updated });
      const what = typeof label === "string" && label.trim() ? label.trim().slice(0, 40) : null;
      await this.notes.note(updated, uid, (name) =>
        !wallpaper ? `${name} сбросил(а) фон чата` : what ? `${name} поменял(а) фон чата на «${what}»` : `${name} поменял(а) фон чата`
      );
      return { chat: updated };
    }
    return { settings: await settings().setChatWallpaper(uid, chat.id, wallpaper ?? null) };
  }

  public async setDraft(uid: string, chatId: string, text: unknown) {
    await settings().setDraft(uid, chatId, typeof text === "string" ? text.slice(0, 8192) : "");
    return { ok: true };
  }

  public async markRead(uid: string, chat: Chat) {
    const recordTime = await privacyRules().recordsReadTime(chat, uid);
    const changedIds = await messages().markChatRead(chat.id, uid, { recordTime });
    await settings().clearUnreadMark(uid, chat.id);
    if (changedIds.length > 0) {
      this.realtime.broadcastToUsers(
        chat.memberIds.filter((m) => m !== uid),
        { type: "message:read", chatId: chat.id, readerId: uid, messageIds: changedIds, readAt: recordTime ? new Date().toISOString() : undefined }
      );
    }
    return { ok: true, count: changedIds.length };
  }

  public async deleteForMe(uid: string, chatId: string) {
    await settings().deleteChatForUser(uid, chatId, new Date().toISOString());
    return { ok: true };
  }

  /**
   * Выход из группы или канала. Последний вышел — чат удаляется; ушёл последний владелец —
   * владельцем становится админ, а не первый попавшийся подписчик.
   */
  public async leave(uid: string, chat: Chat) {
    // Из лички не выходят, её удаляют (у себя или у обоих): иначе у собеседника
    // она превращалась во второе «Избранное».
    if (chat.type !== "group" && chat.type !== "channel") throw new ApiError(400, "Покинуть можно только группу или канал");
    const memberIds = chat.memberIds.filter((m) => m !== uid);
    const adminIds = chat.adminIds.filter((m) => m !== uid);
    const moderatorIds = chat.moderatorIds.filter((m) => m !== uid);
    // У старых чатов есть только ownerId: он тоже считается, иначе выход обычного
    // участника отдавал бы владение первому в списке.
    let ownerIds = [...new Set([chat.ownerId, ...chat.ownerIds])].filter((m): m is string => !!m && m !== uid);

    if (memberIds.length === 0) {
      await messages().deleteMessagesForChat(chat.id);
      this.chats.delete(chat.id);
      return { ok: true, deleted: true };
    }
    if (ownerIds.length === 0) ownerIds = [adminIds.find((m) => memberIds.includes(m)) ?? memberIds[0]!];

    const afterLeave = this.chats.update(chat.id, {
      memberIds,
      adminIds,
      moderatorIds,
      ownerIds,
      ownerId: chat.ownerId === uid ? ownerIds[0] : chat.ownerId,
    })!;
    this.realtime.broadcastToUsers(memberIds, { type: "chat:updated", chat: afterLeave });
    if (chat.type === "group") await this.notes.note(afterLeave, uid, (name) => `${name} покинул(а) группу`);
    return { ok: true, deleted: false };
  }

  /** Без звука: на hours часов, навсегда (forever) или снять (off). */
  public async mute(uid: string, chat: Chat, { hours, forever, off }: MuteDto) {
    const h = Number(hours);
    const value = forever === true ? true : off === true ? null : Number.isFinite(h) && h > 0 ? new Date(Date.now() + h * 3600_000).toISOString() : undefined;
    if (value === undefined) throw new ApiError(400, "Укажите срок");

    const current = await settings().getSettings(uid);
    const mutedChats = { ...(current.notifications?.mutedChats ?? {}) };
    if (value === null) delete mutedChats[chat.id];
    else mutedChats[chat.id] = value;
    await settings().updateSettings(uid, { notifications: { ...current.notifications, mutedChats } });
    return { chat: { ...chat, ...settings().mutedStateFor({ notifications: { mutedChats } }, chat.id) } };
  }

  public getTyping(uid: string, chatId: string) {
    let current = typing().getTyping(chatId, uid);
    if (current && blockedBetween(this.users.findById(current.userId), this.users.findById(uid))) current = null;
    return { typingUserId: current?.userId ?? null, typingAction: current?.action ?? null };
  }

  public setTyping(uid: string, chat: Chat, rawAction: unknown) {
    const cancel = rawAction === "cancel";
    const action = cancel ? "cancel" : typing().normalizeAction(rawAction);
    if (cancel) typing().clearTyping(chat.id, uid);
    else typing().markTyping(chat.id, uid, action);
    this.realtime.broadcastToUsers(this.typingAudience(chat, uid), { type: "typing:update", chatId: chat.id, userId: uid, action });
    return { ok: true };
  }

  /** Буст группы или канала (Premium): раз в сутки, +1 балл к уровню. */
  public vote(uid: string, chat: Chat) {
    if (chat.type !== "group" && chat.type !== "channel") throw new ApiError(400, "Бусты доступны только для групп и каналов");
    if (!this.users.findById(uid)?.isPremium) throw new ApiError(403, "Бустить могут только пользователи с Shalter Premium");
    const lastVote = chat.votes[uid];
    if (lastVote && Date.now() - new Date(lastVote).getTime() < 24 * 3600_000) {
      throw new ApiError(429, "Вы уже бустили этот чат сегодня — следующий буст через сутки", {
        nextAt: new Date(new Date(lastVote).getTime() + 24 * 3600_000).toISOString(),
      });
    }
    const updated = this.chats.update(chat.id, { points: (chat.points ?? 0) + 1, votes: { ...chat.votes, [uid]: new Date().toISOString() } });
    return { chat: updated };
  }

  /**
   * Запрет пересылки и сохранения в личке: включает любой из двоих (с Premium), действует
   * на обоих, снять может только тот, кто включил.
   */
  public async protect(uid: string, chat: Chat, enabled: unknown) {
    if (chat.type !== "dm") throw new ApiError(400, "Только для личных чатов");
    const on = !!enabled;
    const list = new Set(chat.protectedBy);
    const me = this.users.findById(uid);
    if (on) {
      if (!me?.isPremium) throw new ApiError(402, "Запрет пересылки доступен с Premium", { premiumHelps: true });
      list.add(uid);
    } else {
      list.delete(uid);
    }
    const updated = this.chats.update(chat.id, { protectedBy: [...list] })!;
    this.realtime.broadcastToUsers(updated.memberIds, { type: "chat:updated", chat: { id: updated.id, protectedBy: updated.protectedBy } });
    if (on !== chat.protectedBy.includes(uid)) {
      const who = me?.name ?? "Собеседник";
      await this.notes
        .system(updated, on ? `${who} запретил(а) пересылку и сохранение в этом чате` : `${who} снова разрешил(а) пересылку`)
        .catch(() => {});
    }
    return { chat: updated, protectedBy: updated.protectedBy };
  }

  private async setPersonalFlags(uid: string, chatId: string, personal: Partial<Record<PersonalFlag, boolean>>): Promise<void> {
    const current = await settings().getSettings(uid);
    const chatFlags = { ...(current.chatFlags ?? {}) };
    const flags: ChatFlags = { ...(chatFlags[chatId] ?? {}) };
    if (personal.pinned !== undefined) flags.pinned = personal.pinned;
    if (personal.archived !== undefined) {
      flags.archived = personal.archived;
      if (flags.archived) flags.archivedAt = new Date().toISOString();
      else delete flags.archivedAt;
    }
    if (personal.muted !== undefined) flags.muted = personal.muted;
    if (personal.unread) flags.unread = true;
    else if (personal.unread !== undefined) delete flags.unread;
    chatFlags[chatId] = flags;
    const next: Partial<UserSettings> = { chatFlags };
    if (personal.pinned !== undefined) {
      const order = (current.pinnedOrder ?? []).filter((id) => id !== chatId);
      next.pinnedOrder = personal.pinned ? [chatId, ...order] : order;
    }
    if (personal.muted !== undefined) {
      const mutedChats = { ...(current.notifications?.mutedChats ?? {}) };
      if (personal.muted) mutedChats[chatId] = true;
      else delete mutedChats[chatId];
      next.notifications = { ...current.notifications, mutedChats };
    }
    await settings().updateSettings(uid, next);
  }

  // Строки в ленте группы или канала о смене названия, описания, автоудаления и фото.
  private async announceUpdate(uid: string, chat: Chat, updated: Chat, patch: ChatPatch): Promise<void> {
    const channel = chat.type === "channel";
    const where = channel ? "канала" : "группы";
    if (typeof patch.title === "string" && patch.title.trim() && patch.title.trim() !== chat.title) {
      await this.notes.note(updated, uid, (name) =>
        channel ? `Название канала изменено на «${updated.title}»` : `${name} изменил(а) название группы на «${updated.title}»`
      );
    }
    if ("description" in patch && (patch.description ?? null) !== (chat.description ?? null)) {
      await this.notes.note(updated, uid, (name) =>
        channel ? null : patch.description ? `${name} изменил(а) описание группы` : `${name} удалил(а) описание группы`
      );
    }
    if ("autoDeleteSeconds" in patch && (patch.autoDeleteSeconds ?? null) !== (chat.autoDeleteSeconds ?? null)) {
      await this.notes.note(updated, uid, (name) =>
        patch.autoDeleteSeconds
          ? `${name} включил(а) автоудаление сообщений: ${durationLabel(patch.autoDeleteSeconds)}`
          : `${name} выключил(а) автоудаление сообщений`
      );
    }
    if ("avatarImage" in patch && (patch.avatarImage ?? null) !== (chat.avatarImage ?? null)) {
      await this.notes.note(updated, uid, (name) =>
        patch.avatarImage
          ? channel
            ? `Фото ${where} обновлено`
            : `${name} изменил(а) фото группы`
          : channel
            ? `Фото ${where} удалено`
            : `${name} удалил(а) фото группы`
      );
    }
  }

  // Описание и @юзернейм новой группы или канала; без публичности юзернейм не занимается.
  private async newChatIdentity({ description, username, isPublic }: CreateCommunityDto) {
    const desc = typeof description === "string" ? description.trim().slice(0, 500) : "";
    if (!isPublic || !String(username ?? "").trim()) return { description: desc || null, username: null, isPublic: false };
    const handle = String(username ?? "").trim().replace(/^@/, "");
    const problem = await checkUsername(handle);
    if (problem) throw new ApiError(problem.status, problem.error);
    return { description: desc || null, username: handle, isPublic: true };
  }

  // Создать чат с людьми — то же, что добавить их, поэтому действует та же настройка
  // приватности «кто может добавлять меня в чаты», что и при добавлении участника.
  private async invitableIds(ids: unknown, actorId: string): Promise<string[]> {
    if (!Array.isArray(ids)) return [];
    const out: string[] = [];
    for (const id of new Set(ids)) {
      if (typeof id !== "string" || id === actorId || !this.users.findById(id)) continue;
      if (await privacyRules().allowsUser(id, "invites", actorId)) out.push(id);
    }
    return out;
  }

  // «Печатает…» не проходит через блокировку ни в одну сторону.
  private typingAudience(chat: Chat, typerId: string): string[] {
    const typer = this.users.findById(typerId);
    const others = this.users.findByIds(chat.memberIds.filter((id) => id !== typerId));
    return others.filter((u) => !blockedBetween(typer, u)).map((u) => u.id);
  }
}

// Админы нового чата: создатель и выбранные им из участников.
function staffOf(members: Set<string>, uid: string, adminIds: unknown): string[] {
  return [...new Set([uid, ...(Array.isArray(adminIds) ? adminIds.filter((id) => members.has(id)) : [])])];
}

// Подписчику канала список подписчиков не показывается (server/lib/chatForViewer.js).
function hidesMembers(chat: Chat, uid: string): boolean {
  return chat.type === "channel" && !isOwnerOrAdminOf(chat, uid);
}

function blockedBetween(a: User | undefined, b: User | undefined): boolean {
  return !!a && !!b && ((a.blockedUserIds ?? []).includes(b.id) || (b.blockedUserIds ?? []).includes(a.id));
}
