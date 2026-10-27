import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { sanitizers, serviceLine, uploadAccess } from "../../legacy/legacy.js";
import { ChatsRepository } from "../chats/chats.repository.js";
import { can, isStaff } from "../chats/lib/chat-permissions.js";
import type { Chat } from "../chats/model/domain.js";
import { RealtimeService } from "../realtime/realtime.service.js";
import { UsersRepository } from "../users/users.repository.js";
import * as edits from "./lib/message-edits.js";
import { hasArticleTitle, textLimit } from "./lib/message-content.js";
import { MessageAccessService } from "./message-access.service.js";
import { MessagesRepository } from "./messages.repository.js";
import type { Message } from "./model/domain.js";
import type { ChecklistDto, DeleteMessageDto, EditMessageDto, LocationDto, PinDto, ReactDto, VoteDto } from "./model/schemas/message.schema.js";

/** Закреплять: в личке — любой, в группе — по праву pinMessages, иначе владельцы, админы и модераторы. */
function canPin(chat: Chat, userId: string): boolean {
  if (!chat.memberIds.includes(userId)) return false;
  if (chat.type === "dm") return true;
  if (chat.type === "group" && can(chat, userId, "pinMessages")) return true;
  return isStaff(chat, userId);
}

/** Звонок из журнала звонков до 2026-10-03 — обычный текст, но править его нельзя. */
const isLegacyCallLog = (m: Message): boolean =>
  m.createdAt < "2026-10-03" && /^📞 (Звонок|Видеозвонок|Пропущенный звонок|Звонок отклонён)/.test(m.text ?? "");

// Действия с отправленным сообщением: правка, удаление, закрепление, реакции, опросы,
// чек-листы, живая геолокация. Изменение — message:updated участникам.
@Injectable()
export class MessageActionsService {
  public constructor(
    private readonly messages: MessagesRepository,
    private readonly chats: ChatsRepository,
    private readonly users: UsersRepository,
    private readonly access: MessageAccessService,
    private readonly realtime: RealtimeService
  ) {}

  public edit(uid: string, chatId: string, messageId: string, dto: EditMessageDto) {
    const { message: existing } = this.access.messageInChat(chatId, messageId, uid);
    if (existing.senderId !== uid) throw new ApiError(403, "forbidden");
    // Пересланное нельзя править: иначе подпись «Переслано от …» стояла бы под чужим
    // текстом. Подарок — тоже: его текст и сумма заданы при отправке.
    if (existing.type === "call" || isLegacyCallLog(existing) || existing.forwardedFrom || existing.type === "gift") {
      throw new ApiError(400, "Это сообщение нельзя изменить");
    }
    const { text } = dto;
    if (typeof text !== "string") throw new ApiError(400, "Некорректный текст");
    const limit = textLimit(existing.type === "article");
    if (text.length > limit) throw new ApiError(400, `Сообщение длиннее ${limit} символов`);
    if (existing.type === "article" && !hasArticleTitle(text)) throw new ApiError(400, "У статьи должен быть заголовок");
    if (!text.trim() && !existing.attachments?.length) throw new ApiError(400, "Сообщение не может быть пустым");
    const message = this.messages.mutate(messageId, (m) => edits.editText(m, text));
    // Всем участникам, включая автора: его другие устройства и список чатов тоже должны обновиться.
    const chat = this.chats.findById(chatId);
    if (chat) this.realtime.broadcastToUsers(chat.memberIds, { type: "message:updated", chatId, message });
    return { message };
  }

  /**
   * Удаление у себя или у всех. У всех чужое удаляют владельцы, админы и модераторы чата,
   * админы канала в его обсуждении, любой из двоих в личке и модераторы Shalter.
   */
  public async remove(uid: string, chatId: string, messageId: string, dto: DeleteMessageDto) {
    const { forEveryone } = dto;
    const found = this.access.messageInChat(chatId, messageId, uid, { allowModerator: forEveryone });
    const existing = found.message;
    // Подарок удалить нельзя: запись о нём — часть истории чата. Для всех, включая модераторов.
    if (existing.type === "gift") throw new ApiError(400, "Сообщение с подарком удалить нельзя");

    if (!forEveryone) {
      this.messages.mutate(messageId, (m) => edits.deleteForUser(m, uid));
      return { ok: true, id: messageId, forEveryone: false };
    }

    const chat = found.chat;
    const mine = existing.senderId === uid;
    const staff = chat.type !== "dm" && isStaff(chat, uid);
    const inDm = chat.type === "dm";
    const channelOfDiscussion = !mine && !staff && !inDm ? this.chats.findChannelByDiscussion(chat.id) : undefined;
    const channelStaff = !!channelOfDiscussion && isStaff(channelOfDiscussion, uid);
    const moderator = found.moderator || (!mine && !staff && !inDm && !channelStaff && this.access.isServerModerator(uid));
    if (!mine && !staff && !inDm && !channelStaff && !moderator) {
      throw new ApiError(403, "Удалить чужое сообщение у всех могут владельцы, админы и модераторы");
    }
    this.deleteMessage(messageId);
    if (existing.discussionAnchorId) {
      const anchor = this.messages.findById(existing.discussionAnchorId);
      if (anchor) {
        this.deleteMessage(anchor.id);
        const discussionChat = this.chats.findById(anchor.chatId);
        if (discussionChat) this.realtime.broadcastToUsers(discussionChat.memberIds, { type: "message:deleted", chatId: discussionChat.id, id: anchor.id });
      }
    }
    // Сам файл не трогаем: одинаковые файлы хранятся один раз (sha_…), и его может держать
    // пересланная копия или стикер-пак. Без ссылок его уберёт orphanSweep.
    this.realtime.broadcastToOthers(chat, uid, { type: "message:deleted", chatId, id: messageId });
    return { ok: true, id: messageId, forEveryone: true };
  }

  /** Удаление у всех: файлы, на которые больше не ссылается ни одно сообщение чата, перестают быть доступны его участникам. */
  private deleteMessage(id: string): void {
    const refs = this.messages.delete(id);
    if (refs) uploadAccess().revokeAttachments(refs.chatId, [{ url: refs.attachments ?? "" }, { url: refs.sticker ?? "" }]);
  }

  public pin(uid: string, chatId: string, messageId: string, dto: PinDto) {
    const found = this.access.messageInChat(chatId, messageId, uid);
    const { chat } = found;
    if (!canPin(chat, uid)) throw new ApiError(403, "Закреплять сообщения могут владельцы, админы и модераторы");
    const wasPinned = !!found.message.pinned;
    const message = this.messages.mutate(messageId, (m) => edits.setPinned(m, dto.pinned));
    this.realtime.broadcastToOthers(chat, uid, { type: "message:updated", chatId, message });
    // «Иван закрепил(а) „…“» — как в Telegram; только в группах и только при закреплении.
    if (chat.type === "group" && message?.pinned && !wasPinned) {
      const snippet = (message.text ?? "").replace(/\s+/g, " ").trim();
      const what = snippet ? `«${snippet.length > 40 ? `${snippet.slice(0, 40)}…` : snippet}»` : "сообщение";
      setImmediate(() => void serviceLine(chat, uid, (name) => `${name} закрепил(а) ${what}`));
    }
    return { message };
  }

  /** Реакция переключается; без Premium — одна на человека, с Premium — до трёх. */
  public react(uid: string, chatId: string, messageId: string, dto: ReactDto) {
    const found = this.access.messageInChat(chatId, messageId, uid);
    const { emoji } = dto;
    const allowed = found.chat.allowedReactions;
    if (Array.isArray(allowed) && !allowed.includes(emoji as string)) {
      // Уже стоящую реакцию снять можно, даже если её убрали из списка канала.
      const already = found.message.reactions.some((r) => r.emoji === emoji && r.userIds.includes(uid));
      if (!already) throw new ApiError(400, "Эта реакция недоступна в этом канале");
    }
    const maxPerUser = this.users.findById(uid)?.isPremium ? 3 : 1;
    const clean = edits.cleanReaction(emoji);
    const message = clean ? this.messages.mutate(messageId, (m) => edits.toggleReaction(m, clean, uid, maxPerUser)) : this.messages.findById(messageId);
    this.realtime.broadcastToOthers(found.chat, uid, { type: "message:updated", chatId, message });
    return { message };
  }

  public vote(uid: string, chatId: string, messageId: string, dto: VoteDto) {
    return this.update(uid, chatId, messageId, (m) => edits.votePoll(m, dto.optionIndex, uid));
  }

  public retractVote(uid: string, chatId: string, messageId: string) {
    return this.update(uid, chatId, messageId, (m) => edits.retractPollVote(m, uid));
  }

  /** Остановить опрос может его автор или администратор. */
  public closePoll(uid: string, chatId: string, messageId: string) {
    const found = this.access.messageInChat(chatId, messageId, uid);
    if (found.message.senderId !== uid && !isStaff(found.chat, uid)) {
      throw new ApiError(403, "Остановить опрос может только его автор или администратор");
    }
    if (!found.message.attachments?.some((a) => a.kind === "poll")) throw new ApiError(400, "Это не опрос");
    const message = this.messages.mutate(messageId, edits.closePoll);
    this.realtime.broadcastToOthers(found.chat, uid, { type: "message:updated", chatId, message });
    return { message };
  }

  /** Чек-лист: отметить/снять пункт, дописать пункты. Автор может всё; остальные — если он разрешил. */
  public checklist(uid: string, chatId: string, messageId: string, dto: ChecklistDto) {
    const found = this.access.messageInChat(chatId, messageId, uid);
    const list = found.message.attachments?.find((a) => a.kind === "checklist");
    if (!list) throw new ApiError(400, "Это не чек-лист");
    const author = found.message.senderId === uid;
    if (found.chat.type === "channel" && !isStaff(found.chat, uid)) throw new ApiError(403, "Недостаточно прав");

    const { MAX_CHECKLIST_ITEMS } = sanitizers();
    let message: Message | undefined;
    if (dto.add) {
      if (!author && !list.meta?.othersCanAdd) throw new ApiError(403, "Добавлять пункты может только автор");
      const texts = dto.add.slice(0, MAX_CHECKLIST_ITEMS);
      if (!texts.length) throw new ApiError(400, "Введите текст пункта");
      if ((list.meta?.items?.length ?? 0) >= MAX_CHECKLIST_ITEMS) throw new ApiError(400, `Не больше ${MAX_CHECKLIST_ITEMS} пунктов`);
      message = this.messages.mutate(found.message.id, (m) => edits.addChecklistItems(m, texts, MAX_CHECKLIST_ITEMS));
    } else {
      if (!author && list.meta?.othersCanMark === false) throw new ApiError(403, "Отмечать пункты может только автор");
      const { itemId } = dto;
      if (!list.meta?.items?.some((it: { id: number }) => it.id === itemId)) throw new ApiError(404, "Пункт не найден");
      message = this.messages.mutate(found.message.id, (m) => edits.toggleChecklistItem(m, itemId, uid));
    }
    this.realtime.broadcastToOthers(found.chat, uid, { type: "message:updated", chatId, message });
    return { message };
  }

  /** Новая точка живой геолокации; обновляет только автор, событие — всем участникам. */
  public location(uid: string, chat: Chat, messageId: string, dto: LocationDto) {
    const { lat, lng } = dto;
    const target = this.messages.findById(messageId);
    if (!target || target.chatId !== chat.id) throw new ApiError(404, "not found");
    const message = this.messages.mutate(messageId, (m) => edits.updateLiveLocation(m, uid, lat, lng));
    if (!message) throw new ApiError(404, "not found");
    this.realtime.broadcastToUsers(chat.memberIds, { type: "message:updated", chatId: chat.id, message });
    return { message };
  }

  private update(uid: string, chatId: string, messageId: string, fn: (m: Message) => Message) {
    const found = this.access.messageInChat(chatId, messageId, uid);
    const message = this.messages.mutate(messageId, fn);
    this.realtime.broadcastToOthers(found.chat, uid, { type: "message:updated", chatId, message });
    return { message };
  }
}
