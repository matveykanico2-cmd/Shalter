import { Injectable } from "@nestjs/common";
import { SYSTEM_BOT_ID } from "../../common/config/accounts.js";
import { ApiError } from "../../common/errors/api-error.js";
import { genId } from "../../common/lib/gen-id.js";
import {
  fetchLinkPreview,
  getBotByUserId,
  messageCost,
  push,
  queueJob,
  responders,
  sanitizers,
  sendOnce,
  uploadAccess,
  type Attachment,
} from "../../legacy/legacy.js";
import { markPendingPreviews, messageNeedsMedia } from "../background/lib/media-attachments.js";
import { ChatsRepository } from "../chats/chats.repository.js";
import { can, DENIED, isStaff, type Permission } from "../chats/lib/chat-permissions.js";
import type { Chat } from "../chats/model/domain.js";
import { RealtimeService } from "../realtime/realtime.service.js";
import { TopicsRepository } from "../topics/topics.repository.js";
import type { User } from "../users/model/domain.js";
import { isQuietNow } from "../users/lib/settings.defaults.js";
import { StarsRepository } from "../users/stars.repository.js";
import { UsersRepository } from "../users/users.repository.js";
import { UserPrivacyService } from "../users/user-privacy.service.js";
import { UserSettingsService } from "../users/user-settings.service.js";
import { incrementCommentCount, setLinkPreview } from "./lib/message-edits.js";
import {
  MAX_MESSAGE_TEXT,
  MAX_PAID_STARS,
  MESSAGE_EFFECTS,
  messagePreview,
  sanitizeMessageEmoji,
  sanitizeStoryReply,
} from "./lib/message-content.js";
import { MessagesRepository } from "./messages.repository.js";
import { PaidMediaRepository } from "./paid-media.repository.js";
import type { ForwardedFrom, Message } from "./model/domain.js";
import type { SendMessageDto } from "./model/schemas/message.schema.js";

/**
 * Поля сообщения из запроса. Проверка (gate) заменяет в нём пересылаемое содержимым
 * исходного сообщения и приводит topicId к теме этого чата.
 */
export type MessageDraft = Omit<SendMessageDto, "clientId">;

/** Платный пост: настоящие вложения и заглушка, которая уходит в чат вместо них. */
interface PaidPost {
  stars: number;
  real: Attachment[];
  placeholder: Attachment;
}

const BLUR_RE = /^data:image\/(jpeg|webp|png);base64,[A-Za-z0-9+/=]+$/;

const asRecord = (value: unknown): Record<string, any> => (value ?? {}) as Record<string, any>;

// Отправка сообщения: все проверки «можно ли этому человеку сюда писать» (общие с
// отложенными), платный пост, доставка участникам, ботам и в пуш.
@Injectable()
export class MessageSendService {
  public constructor(
    private readonly messages: MessagesRepository,
    private readonly chats: ChatsRepository,
    private readonly topics: TopicsRepository,
    private readonly users: UsersRepository,
    private readonly realtime: RealtimeService,
    private readonly userSettings: UserSettingsService,
    private readonly stars: StarsRepository,
    private readonly privacy: UserPrivacyService,
    private readonly paidMedia: PaidMediaRepository
  ) {}

  /** Повтор с тем же clientId (в том числе одновременный) получает ответ первой отправки. */
  public async send(uid: string, chat: Chat, dto: SendMessageDto) {
    if (dto.text != null && typeof dto.text !== "string") throw new ApiError(400, "Некорректный текст");
    // Вложения считаем после очистки: иначе { attachments: [{ kind: "bogus" }] } уходило
    // пустым сообщением. У пересылки текст и вложения берутся из исходного сообщения.
    const text = dto.text as string | null | undefined;
    if (!text?.trim() && !sanitizers().sanitizeAttachments(dto.attachments)?.length && !dto.sticker && !dto.forwardedFrom) {
      throw new ApiError(400, "empty message");
    }
    const { clientId, ...fields } = dto;
    return sendOnce(uid, chat.id, clientId, async () => {
      const { charged } = await this.gate(chat, uid, fields);
      const paid = this.preparePaidMedia(chat, uid, fields);
      const message = await this.deliver(chat, uid, fields, { paidStars: charged, paid });
      // Отправили — черновик этого чата больше не нужен (иначе «Черновик: …» мог вернуться
      // в списке чатов, если очистка с клиента разошлась с сохранением).
      if (this.userSettings.get(uid).drafts?.[chat.id]) this.userSettings.setDraft(uid, chat.id, "");
      return { message, ...(charged ? { chargedStars: charged, balance: this.stars.balanceOf(uid) } : {}) };
    });
  }

  /**
   * Все проверки «можно ли этому человеку сюда писать». Общие для обычной отправки и
   * отложенной: иначе через расписание можно было постить в чужой канал, писать при запрете
   * или тому, кто заблокировал. charge — списывать ли звёзды за платные сообщения (при
   * планировании нет, при отправке да). Отказ — ApiError.
   */
  public async gate(chat: Chat, uid: string, body: MessageDraft, { charge = true, skipSlowMode = false } = {}): Promise<{ charged: number }> {
    if (body.text != null && typeof body.text !== "string") throw new ApiError(400, "Некорректный текст");
    if (((body.text as string | undefined) ?? "").length > MAX_MESSAGE_TEXT) throw new ApiError(400, `Сообщение длиннее ${MAX_MESSAGE_TEXT} символов`);
    if (chat.type === "channel" && !isStaff(chat, uid)) throw new ApiError(403, "Публиковать в канале могут только администраторы");

    const restrictedUntil = chat.restrictions?.[uid];
    if (restrictedUntil && (restrictedUntil === "forever" || restrictedUntil > new Date().toISOString())) {
      throw new ApiError(403, "Вам запрещено писать в этом чате");
    }

    // Пересылка: подпись «Переслано от …» и содержимое берём из исходного сообщения в
    // базе, а не из тела запроса — иначе её можно подделать.
    if (body.forwardedFrom && chat.secret) throw new ApiError(403, "В секретный чат нельзя пересылать");
    if (body.forwardedFrom) {
      const request = asRecord(body.forwardedFrom);
      const sourceMsg = typeof request.messageId === "string" ? this.messages.findById(request.messageId) : undefined;
      const source = sourceMsg ? this.chats.findById(sourceMsg.chatId) : undefined;
      if (!sourceMsg || !source?.memberIds.includes(uid) || sourceMsg.deletedForIds?.includes(uid)) {
        throw new ApiError(404, "Исходное сообщение не найдено");
      }
      if (source.protectedBy?.length || source.secret) throw new ApiError(403, "В этом чате запрещена пересылка");
      // «Скрыть имя отправителя»: копия уходит как своё сообщение, без подписи.
      body.forwardedFrom = request.hideAuthor === true ? undefined : (sourceMsg.forwardedFrom ?? this.forwardOrigin(source, sourceMsg, uid));
      body.text = sourceMsg.text ?? "";
      body.attachments = (sourceMsg.attachments ?? []).map((a) => (a.kind === "poll" ? { ...a, meta: { ...a.meta, voterIds: [], votes: [] } } : a));
      body.sticker = sourceMsg.sticker;
      body.customEmoji = sourceMsg.customEmoji;
    }

    // Тема: только существующая тема этого чата; в закрытую пишут только админы.
    if (!chat.topicsEnabled) body.topicId = null;
    if (body.topicId != null) {
      const topic = typeof body.topicId === "string" ? this.topics.findById(body.topicId) : undefined;
      if (!topic || topic.chatId !== chat.id) throw new ApiError(404, "Тема не найдена");
      if (topic.closed && !isStaff(chat, uid)) throw new ApiError(403, "Тема закрыта — писать в неё могут только администраторы");
      body.topicId = topic.id;
    }

    const kinds = new Set((Array.isArray(body.attachments) ? body.attachments : []).map((a) => asRecord(a).kind));
    const needs: Permission[] = [
      "sendMessages",
      ...(kinds.has("poll") || kinds.has("checklist") ? (["sendPolls"] as const) : []),
      ...([...kinds].some((k) => k !== "poll" && k !== "checklist" && k !== "dice" && k !== "game") ? (["sendMedia"] as const) : []),
      ...(body.sticker || kinds.has("dice") || kinds.has("game") ? (["sendStickers"] as const) : []),
    ];
    for (const need of needs) {
      if (!can(chat, uid, need)) throw new ApiError(403, DENIED[need]);
    }

    if (!skipSlowMode && chat.type === "group" && (chat.slowModeSeconds ?? 0) > 0 && !isStaff(chat, uid)) {
      const lastAt = this.messages.lastSentAt(chat.id, uid);
      if (lastAt) {
        const waited = (Date.now() - new Date(lastAt).getTime()) / 1000;
        if (waited < chat.slowModeSeconds!) {
          const left = Math.ceil(chat.slowModeSeconds! - waited);
          throw new ApiError(429, `Медленный режим: следующее сообщение можно отправить через ${left} с`, { retryAfter: left });
        }
      }
    }

    if (chat.type === "dm") return { charged: await this.dmGate(chat, uid, charge) };
    if (chat.type === "group") return { charged: this.commentGate(chat, uid, charge) };
    return { charged: 0 };
  }

  /** Личка: блокировка, служебный чат, «кто может мне писать», плата за сообщения незнакомцам. */
  private async dmGate(chat: Chat, uid: string, charge: boolean): Promise<number> {
    const otherId = chat.memberIds.find((m) => m !== uid);
    const other = otherId ? this.users.findById(otherId) : undefined;
    if (other?.blockedUserIds?.includes(uid)) throw new ApiError(403, "Пользователь заблокировал вас");
    if (otherId === SYSTEM_BOT_ID) throw new ApiError(403, "Shalter — служебный чат, отвечать в нём нельзя");
    if (!other) return 0;

    if (!this.privacy.allowsUser(other.id, "messages", uid)) {
      const { privacy: theirPrivacy } = this.userSettings.get(other.id);
      const level = theirPrivacy?.messages ?? "everyone";
      const deniedByName = (theirPrivacy?.exceptions?.messages?.deny ?? []).includes(uid);
      // «Только контакты» пропускает Premium и тех, кому собеседник уже писал сам.
      const bypass = level === "contacts" && !deniedByName && (!!this.users.findById(uid)?.isPremium || this.messages.hasSentIn(chat.id, other.id));
      if (!bypass) {
        throw new ApiError(
          403,
          level === "nobody"
            ? "Этот пользователь никому не разрешает писать первым"
            : "Этот пользователь принимает сообщения только от своих контактов. С Premium писать можно",
          { privacyBlocked: true }
        );
      }
    }

    if (!charge) return 0;
    const { price, mustPay } = await messageCost(uid, other, chat.id);
    if (!mustPay) return 0;
    if (!this.stars.transfer(uid, other.id, price)) {
      throw new ApiError(402, `Этот пользователь берёт ${price} ⭐ за сообщение от незнакомых. Не хватает звёзд. С Premium писать можно бесплатно`, {
        needStars: price,
        balance: this.stars.balanceOf(uid),
        premiumHelps: true,
      });
    }
    return price;
  }

  /** Группа обсуждения канала: комментарии могут стоить звёзд (кроме владельца, админов канала и Premium). */
  private commentGate(chat: Chat, uid: string, charge: boolean): number {
    const channel = this.chats.findChannelByDiscussion(chat.id);
    const price = channel?.commentPriceStars ?? 0;
    if (!charge || price <= 0 || channel!.ownerId === uid || isStaff(channel, uid)) return 0;
    if (this.users.findById(uid)?.isPremium) return 0;
    if (!this.stars.transfer(uid, channel!.ownerId!, price)) {
      throw new ApiError(402, `Комментарии в этом канале стоят ${price} ⭐. Не хватает звёзд. С Premium — бесплатно`, {
        needStars: price,
        balance: this.stars.balanceOf(uid),
        premiumHelps: true,
      });
    }
    return price;
  }

  /** Подпись пересланного: анонимные админы и посты каналов подписываются названием чата. */
  public forwardOrigin(source: Chat, message: Message, uid: string): ForwardedFrom {
    if (source.type === "channel" || message.anonymous) {
      return { chatId: source.id, chatTitle: source.title, senderName: source.title };
    }
    const author = this.users.findById(message.senderId);
    let chatTitle = source.title;
    if (source.type === "dm") {
      const otherId = source.memberIds.find((id) => id !== uid) ?? uid;
      chatTitle = this.users.findById(otherId)?.name ?? source.title;
    }
    return { chatId: source.id, chatTitle, senderId: message.senderId, senderName: author?.name ?? "Аноним" };
  }

  /**
   * Платный пост: звёзды 1…10000, только фото и видео, в канале — только админы. null — пост
   * обычный; ошибка — 400.
   */
  public preparePaidMedia(chat: Chat, senderId: string, body: MessageDraft): PaidPost | null {
    const request = asRecord(body.paidMedia);
    const price = Math.floor(Number(request.stars));
    if (!body.paidMedia) return null;
    if (chat.secret) throw new ApiError(400, "В секретном чате платный контент недоступен");
    if (chat.type === "channel" && !isStaff(chat, senderId)) throw new ApiError(400, "Платный контент в канале публикуют админы");
    if (!Number.isSafeInteger(price) || price < 1 || price > MAX_PAID_STARS) throw new ApiError(400, `Цена — от 1 до ${MAX_PAID_STARS} ⭐`);
    const real = (sanitizers().sanitizeAttachments(body.attachments) ?? []).filter((a) => (a.kind === "image" || a.kind === "video") && a.url);
    if (!real.length) throw new ApiError(400, "Платным можно сделать только фото или видео");
    // Иначе, зная адрес чужого файла, можно было бы «продать» его себе и скачать как автор.
    const { canAccessUpload } = uploadAccess();
    if (real.some((a) => [a.url, a.thumbUrl].some((u) => u && /^\/uploads\//.test(u) && !canAccessUpload(senderId, u.slice("/uploads/".length))))) {
      throw new ApiError(400, "Файл не найден — загрузите его заново");
    }
    const blur = typeof request.blur === "string" && request.blur.length <= 8000 && BLUR_RE.test(request.blur) ? request.blur : null;
    const w = Number(request.width);
    const h = Number(request.height);
    const placeholder: Attachment = {
      kind: "paid",
      meta: {
        stars: price,
        count: real.length,
        photos: real.filter((a) => a.kind === "image").length,
        videos: real.filter((a) => a.kind === "video").length,
        blur,
        ...(w > 0 && h > 0 && w < 20000 && h < 20000 ? { width: Math.round(w), height: Math.round(h) } : {}),
      },
    };
    return { stars: price, real, placeholder };
  }

  /** Сохраняет сообщение и рассылает его: участникам по WS, ботам, ИИ, в пуш; фоном — превью. */
  public async deliver(chat: Chat, senderId: string, body: MessageDraft, { paidStars = 0, paid = null as PaidPost | null } = {}): Promise<Message> {
    let forwardedFrom = body.forwardedFrom as ForwardedFrom | undefined;
    if (forwardedFrom?.senderId) {
      const linkAllowed = forwardedFrom.senderId === senderId || this.privacy.allowsUser(forwardedFrom.senderId, "forwards", senderId);
      forwardedFrom = { ...forwardedFrom, linkAllowed };
    }
    const text = body.text as string | undefined;

    // Ответ и ветка — только на сообщение из этого же чата: иначе счётчик комментариев и
    // рассылка уходили бы в чужой чат.
    const inThisChat = (id: unknown): id is string => typeof id === "string" && !!id && this.messages.findById(id)?.chatId === chat.id;
    const replyToId = inThisChat(body.replyToId) ? body.replyToId : null;
    const threadRootId = inThisChat(body.threadRootId) ? body.threadRootId : null;
    const clean = sanitizers();

    const message = this.messages.create({
      id: genId("m"),
      chatId: chat.id,
      senderId,
      type: body.sticker ? "sticker" : "text",
      text: text ?? "",
      createdAt: new Date().toISOString(),
      pinned: false,
      mentionedUserIds: this.resolveMentions(text, chat.memberIds, senderId),
      reactions: [],
      replyToId,
      threadRootId,
      topicId: threadRootId ? null : ((body.topicId as string | null | undefined) ?? null),
      storyReply: sanitizeStoryReply(body.storyReply),
      attachments: paid ? [paid.placeholder] : markPendingPreviews(clean.sanitizeAttachments(body.attachments)),
      forwardedFrom,
      sticker: clean.sanitizeSticker(body.sticker),
      customEmoji: sanitizeMessageEmoji(body.customEmoji),
      readByIds: [senderId],
      paidStars,
      anonymous: !!(body.anonymous && chat.type === "group" && chat.anonymousAdmins && isStaff(chat, senderId)),
      // Эффекты — только в личных чатах, как в Telegram.
      effect: chat.type === "dm" && MESSAGE_EFFECTS.includes(body.effect as string) ? (body.effect as string) : null,
    });

    const { registerAttachments } = uploadAccess();
    registerAttachments(chat.id, message.attachments, { by: senderId });
    // Настоящие файлы платного поста к чату не привязываются: их отдают только автору,
    // админам канала и купившим (server/lib/uploadAccess.js).
    if (paid) this.paidMedia.save(message.id, chat.id, paid.stars, paid.real);
    if (message.sticker?.kind === "image") registerAttachments(chat.id, [{ url: message.sticker.url }], { by: senderId });

    if (message.threadRootId) {
      const updatedRoot = this.messages.mutate(message.threadRootId, incrementCommentCount);
      this.realtime.broadcastToUsers(chat.memberIds, { type: "thread:message", chatId: chat.id, rootId: message.threadRootId, message });
      if (updatedRoot) this.realtime.broadcastToOthers(chat, senderId, { type: "message:updated", chatId: chat.id, message: updatedRoot });
      if (updatedRoot?.anchorForPostId) {
        const updatedPost = this.messages.mutate(updatedRoot.anchorForPostId, incrementCommentCount);
        const channel = updatedPost ? this.chats.findById(updatedPost.chatId) : undefined;
        if (channel) this.realtime.broadcastToUsers(channel.memberIds, { type: "message:updated", chatId: channel.id, message: updatedPost });
      }
    } else {
      this.realtime.broadcastToOthers(chat, senderId, { type: "message:new", chatId: chat.id, message, ...(body.silent === true ? { silent: true } : {}) });
    }

    const respond = responders();
    for (const memberId of chat.memberIds) {
      if (memberId === senderId) continue;
      getBotByUserId(memberId)
        .then((bot) => {
          if (!bot?.code?.trim()) return;
          return respond.runBotCode(bot, bot.code, { id: message.id, chatId: chat.id, senderId, text: message.text, createdAt: message.createdAt });
        })
        .catch((err) => console.error(`bot sandbox dispatch failed for ${memberId}:`, err));
    }
    respond.dispatchHugo(chat.id, message);
    respond.dispatchGuestHugo(chat, message);
    respond.dispatchShalterAi(chat.id, message);
    respond.dispatchHelperBot(chat, message);
    respond.dispatchBusinessAutoReply(chat, message);

    if (message.replyToId) {
      const anchor = this.messages.findById(message.replyToId);
      if (anchor?.anchorForPostId) this.messages.mutate(anchor.anchorForPostId, incrementCommentCount);
    }

    // «Отправить без звука»: уведомление придёт, но тихое.
    const sender = this.users.findById(senderId);
    this.pushNewMessage(chat, sender, message, { silent: body.silent === true }).catch((err) => console.error("push notify failed:", err));

    // Превью и длительность вложений — в фоновом процессе; готовое придёт событием message:updated.
    if (messageNeedsMedia(message)) queueJob("message-media", { messageId: message.id });

    // В секретном чате превью ссылок не запрашиваем: сервер не ходит по ссылкам из переписки.
    if (message.type === "text" && message.text && !chat.secret) {
      fetchLinkPreview(message.text)
        .then((linkPreview) => {
          if (!linkPreview) return;
          const updated = this.messages.mutate(message.id, (m) => setLinkPreview(m, linkPreview));
          this.realtime.broadcastToUsers(chat.memberIds, { type: "message:updated", chatId: chat.id, message: updated });
        })
        .catch((err) => console.error("link preview fetch failed:", err));
    }
    return message;
  }

  /** @ник из текста → id упомянутых участников, кроме автора. */
  private resolveMentions(text: string | undefined, memberIds: string[], senderId: string): string[] {
    if (!text) return [];
    const handles = [...new Set([...text.matchAll(/@(\w+)/g)].map((m) => m[1]!.toLowerCase()))];
    if (!handles.length) return [];
    const members = new Set(memberIds);
    return this.users
      .findIdsByUsernames(handles)
      .filter((u) => u.id !== senderId && members.has(u.id))
      .map((u) => u.id);
  }

  /** Пуш остальным участникам, кроме заглушивших чат; в секретном чате — без текста и имени. */
  public async pushNewMessage(chat: Chat, sender: User | undefined, message: Message, { silent = false } = {}): Promise<void> {
    const isGroupLike = chat.type === "group" || chat.type === "channel";
    const title = isGroupLike ? chat.title : (sender?.name ?? "Новое сообщение");
    const preview = messagePreview(message);
    const recipients = chat.memberIds.filter((id) => id !== message.senderId);
    const notify = push();
    const chatAvatar = isGroupLike ? notify.pushAvatar(chat) : null;
    await Promise.all(
      recipients.map(async (uid) => {
        const userSettings = this.userSettings.get(uid);
        if (isQuietNow(userSettings, chat.id)) return;
        const mentioned = message.mentionedUserIds?.includes(uid);
        const body = chat.secret
          ? "🔒 Новое сообщение в секретном чате"
          : !userSettings.notifications?.previewText
            ? mentioned
              ? "Вас упомянули"
              : "Новое сообщение"
            : mentioned
              ? `${sender?.name ?? "Кто-то"} упомянул(а) вас: ${preview}`
              : isGroupLike
                ? `${sender?.name ?? "Кто-то"}: ${preview}`
                : preview;
        const avatar = chatAvatar ?? (await notify.userPushAvatar(sender, uid));
        await notify.sendPushToUser(
          uid,
          {
            title: chat.secret ? "Shalter" : title,
            body,
            ...(chat.secret ? {} : avatar),
            url: `/chat/${chat.id}`,
            kind: "message",
            tag: `chat-${chat.id}`,
            // Для кнопок в уведомлении: «Ответить», «Прочитано», «Удалить».
            chatId: chat.id,
            messageId: message.id,
            ...(silent ? { silent: true } : {}),
          },
          notify.MESSAGE_PUSH
        );
      })
    );
  }
}
