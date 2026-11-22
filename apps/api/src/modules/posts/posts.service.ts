import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { genId } from "../../common/lib/gen-id.js";
import { findOrCreateDm, sanitizers, sendMessageAndBroadcast, sendMessagePush, sendOnce, uploadAccess } from "../../legacy/legacy.js";
import { SYSTEM_BOT_ID } from "../../common/config/accounts.js";
import { ChatsRepository } from "../chats/chats.repository.js";
import { can, DENIED, isStaff } from "../chats/lib/chat-permissions.js";
import type { Chat } from "../chats/model/domain.js";
import { incrementViews, setAnchorForPost, setDiscussionAnchor } from "../messages/lib/message-edits.js";
import { MessageSendService } from "../messages/message-send.service.js";
import { MessagesRepository } from "../messages/messages.repository.js";
import type { Message } from "../messages/model/domain.js";
import type { SendMessageDto } from "../messages/model/schemas/message.schema.js";
import { PaidMediaRepository } from "../messages/paid-media.repository.js";
import { RealtimeService } from "../realtime/realtime.service.js";
import { publicUser } from "../users/lib/user.presenter.js";
import type { User } from "../users/model/domain.js";
import { UsersRepository } from "../users/users.repository.js";
import type { PublishPostDto } from "./model/schemas/post.schema.js";
import { PostViewsRepository } from "./post-views.repository.js";

type PaidPost = ReturnType<MessageSendService["preparePaidMedia"]>;

interface Comments {
  post: Message;
  channel: Chat;
  discussion: Chat;
  anchor: Message;
}

// Посты каналов: публикация, просмотры и комментарии в группе обсуждения — как server/routes/posts.js.
@Injectable()
export class PostsService {
  public constructor(
    private readonly chats: ChatsRepository,
    private readonly messages: MessagesRepository,
    private readonly users: UsersRepository,
    private readonly paidMedia: PaidMediaRepository,
    private readonly views: PostViewsRepository,
    private readonly sender: MessageSendService,
    private readonly realtime: RealtimeService
  ) {}

  public async publish(uid: string, channelId: string, body: PublishPostDto) {
    const chat = this.chats.findById(channelId);
    // Постороннему закрытый канал не раскрываем: 404, как будто его нет.
    if (!chat || chat.type !== "channel" || (!chat.isPublic && !chat.memberIds.includes(uid))) throw new ApiError(404, "not found");
    // Публикация в канале доступна только владельцу/админам; право publishPosts
    // дополнительно позволяет ограничить публикацию для отдельных участников.
    if (!isStaff(chat, uid)) throw new ApiError(403, "Публиковать могут только администраторы канала");
    if (!can(chat, uid, "publishPosts")) throw new ApiError(403, DENIED.publishPosts);

    if (body.text != null && typeof body.text !== "string") throw new ApiError(400, "Некорректный текст");
    const text = body.text as string | null | undefined;
    if (!text?.trim() && !(body.attachments as { length?: number } | null | undefined)?.length) throw new ApiError(400, "empty post");
    if (typeof text === "string" && text.length > 4096) throw new ApiError(400, "Пост длиннее 4096 символов");

    const paid = this.sender.preparePaidMedia(chat, uid, body);
    const post = await sendOnce(uid, chat.id, body.clientId, async () => this.publishPost(chat, uid, body, paid));
    return { message: post };
  }

  private publishPost(chat: Chat, uid: string, body: PublishPostDto, paid: PaidPost): Message {
    let post = this.messages.create({
      id: genId("m"),
      chatId: chat.id,
      senderId: uid,
      type: "text",
      text: (body.text as string | null | undefined) ?? "",
      createdAt: new Date().toISOString(),
      pinned: false,
      reactions: [],
      attachments: paid ? [paid.placeholder] : sanitizers().sanitizeAttachments(body.attachments),
      readByIds: [uid],
      views: 0,
      commentCount: 0,
      // Для ленты сохраняем выбранный способ публикации: старые посты без
      // подписи считаются постами канала, новые можно отправить от пользователя.
      signedBy: body.asChannel === false ? (this.users.findById(uid)?.name ?? null) : (chat.title ?? null),
    });

    // Комментарии выключены — пост не копируем в группу обсуждения: под ним их не будет.
    if (chat.linkedDiscussionChatId && !chat.commentsOff) {
      const discussionChat = this.chats.findById(chat.linkedDiscussionChatId);
      if (discussionChat) {
        const author = this.users.findById(uid);
        const anchor = this.messages.create({
          id: genId("m"),
          chatId: discussionChat.id,
          senderId: uid,
          type: "text",
          text: post.text,
          createdAt: new Date().toISOString(),
          pinned: false,
          reactions: [],
          attachments: post.attachments,
          readByIds: [uid],
          forwardedFrom: {
            chatId: chat.id,
            chatTitle: chat.title ?? "",
            senderId: uid,
            senderName: author?.name ?? "",
          },
          // Якорь комментариев — обычное сообщение в обсуждении, а не пересылка:
          // в комментариях не показываем лишнюю подпись «Переслано от…».
          signedBy: chat.signMessages ? (author?.name ?? null) : null,
          anonymous: !chat.signMessages,
        });
        this.messages.mutate(anchor.id, setAnchorForPost(post.id));
        post = this.messages.mutate(post.id, setDiscussionAnchor(anchor.id))!;
      }
    }
    uploadAccess().registerAttachments(chat.id, post.attachments, { by: uid });
    // Настоящие файлы платного поста к каналу не привязываются (server/lib/uploadAccess.js).
    if (paid) this.paidMedia.save(post.id, chat.id, paid.stars, paid.real);
    this.realtime.broadcastToUsers(
      chat.memberIds.filter((id) => id !== uid),
      { type: "message:new", chatId: chat.id, message: post }
    );
    this.sender.pushNewMessage(chat, this.users.findById(uid), post).catch((err) => console.error("channel post push failed:", err));
    return post;
  }

  public view(uid: string, postId: string) {
    const post = this.messages.findById(postId);
    if (!post) throw new ApiError(404, "Пост не найден");
    const channel = this.chats.findById(post.chatId);
    if (!channel || channel.type !== "channel") throw new ApiError(400, "Просмотры считаются только у постов канала");
    if (!channel.memberIds.includes(uid) && !channel.username) throw new ApiError(403, "Пост недоступен");
    if (post.senderId === uid) return { views: post.views ?? 0, counted: false };
    if (!this.views.record(post.id, uid)) return { views: post.views ?? 0, counted: false };

    const updated = this.messages.mutate(post.id, incrementViews);
    return { views: updated?.views ?? (post.views ?? 0) + 1, counted: true };
  }

  public comments(uid: string, postId: string) {
    const found = this.resolveComments(postId, uid);
    const replies = this.messages.listThreadReplies(found.anchor.id);
    const memberIds = [...new Set([...found.discussion.memberIds, ...replies.map((r) => r.senderId)])];
    const byId = new Map(
      memberIds
        .map((id) => this.users.findById(id))
        .filter((u): u is User => !!u)
        .map((u) => [u.id, u])
    );
    // Сколько стоит комментарий и берёт ли его этот пользователь: платёж живёт в
    // MessageSendService.gate, условия повторяем здесь, чтобы панель показала цену заранее,
    // а не после неудачной отправки.
    const price = found.channel.commentPriceStars ?? 0;
    const sender = this.users.findById(uid);
    const priceFree = !price || sender?.isPremium || isStaff(found.channel, uid);
    return {
      post: found.post,
      anchor: found.anchor,
      chat: { id: found.discussion.id, title: found.discussion.title },
      // Участники обсуждения и авторы ответов — каждый по одному разу.
      members: memberIds
        .map((id) => byId.get(id))
        .filter((u): u is User => !!u)
        .map(publicUser),
      replies,
      // Те же условия, что у POST: доступ к ветке (resolveComments) и нет бана в обсуждении.
      canComment: !(found.discussion.bannedIds ?? []).includes(uid),
      commentPriceStars: price,
      commentPriceFree: priceFree,
      commentAllowedTypes: found.channel.commentAllowedTypes ?? null,
    };
  }

  public async comment(uid: string, postId: string, dto: SendMessageDto) {
    const found = this.resolveComments(postId, uid);
    let discussion = found.discussion;
    if ((discussion.bannedIds ?? []).includes(uid)) throw new ApiError(403, "Вас заблокировали в обсуждении");
    const allowed = found.channel.commentAllowedTypes;
    if (allowed?.length) {
      const kinds = new Set((Array.isArray(dto.attachments) ? dto.attachments : []).map((a) => String((a as Record<string, unknown>)?.kind ?? "")));
      const types = new Set<string>();
      if (typeof dto.text === "string" && dto.text.trim()) types.add("text");
      if (dto.forwardedFrom) types.add("forward");
      if (dto.sticker || kinds.has("sticker")) types.add("sticker");
      for (const kind of kinds) {
        if (kind === "image" || kind === "video") types.add("media");
        else if (kind === "voice" || kind === "audio" || kind === "music") types.add("audio");
        else if (kind === "poll") types.add("poll");
        else if (kind) types.add("file");
      }
      const blocked = [...types].find((type) => !allowed.includes(type as never));
      if (blocked) throw new ApiError(403, `В комментариях запрещён тип: ${blocked}`);
    }

    if (dto.text != null && typeof dto.text !== "string") throw new ApiError(400, "Некорректный текст");
    const text = dto.text as string | null | undefined;
    if (!text?.trim() && !(dto.attachments as { length?: number } | null | undefined)?.length) throw new ApiError(400, "Напишите комментарий");

    // Те же проверки, что у обычной отправки: ограничения, права, платные комментарии.
    // Проверяем как будто уже участник, а в обсуждение добавляем только после успеха —
    // иначе после 402 человек оставался бы в группе, так и не прокомментировав.
    const { clientId: _clientId, ...fields } = dto;
    if (fields.asChannel === true && !isStaff(found.channel, uid)) {
      throw new ApiError(403, "От имени канала могут комментировать только администраторы");
    }
    const joining = !discussion.memberIds.includes(uid);
    const gate = await this.sender.gate(joining ? { ...discussion, memberIds: [...discussion.memberIds, uid] } : discussion, uid, fields);
    if (joining) discussion = this.chats.update(discussion.id, { memberIds: [...discussion.memberIds, uid] })!;

    const message = await this.sender.deliver(discussion, uid, { ...fields, threadRootId: found.anchor.id }, { paidStars: gate.charged });
    // Комментарий уже сохранён и отправлен участникам. Уведомление владельцу
    // выполняем отдельно, чтобы медленный push/создание DM не задерживали ответ
    // автору комментария и не превращались в повторную ошибку отправки.
    void this.notifyChannelOwner(found.channel, found.post, uid, message, discussion.id);
    return { message, ...(gate.charged ? { chargedStars: gate.charged } : {}) };
  }

  private async notifyChannelOwner(channel: Chat, post: Message, commenterId: string, comment: Message, discussionId: string) {
    const recipients = [...new Set([channel.ownerId, ...(channel.ownerIds ?? [])].filter((id): id is string => !!id && id !== commenterId))];
    if (!recipients.length) return;
    const commenter = this.users.findById(commenterId);
    const name = commenter?.name || commenter?.username || "Пользователь";
    const text = comment.text?.trim().replace(/\s+/g, " ") || "вложение";
    const channelName = channel.title || (channel.username ? `@${channel.username}` : "канале");
    const shortText = text.length > 240 ? `${text.slice(0, 237)}…` : text;
    await Promise.all(
      recipients.map(async (ownerId) => {
        try {
          const dm = await findOrCreateDm(SYSTEM_BOT_ID, ownerId);
          await sendMessageAndBroadcast(dm, SYSTEM_BOT_ID, `💬 Новый комментарий в «${channelName}»\n${name}: ${shortText}`);
          void sendMessagePush(ownerId, {
            title: `Новый комментарий · ${channelName}`,
            body: `${name}: ${shortText}`,
            url: `/chat/${discussionId}?msg=${encodeURIComponent(post.id)}`,
            tag: `channel-comment-${post.id}`,
          }).catch(() => {});
        } catch (err) {
          console.error(`channel comment notification failed (${channel.id}/${ownerId}):`, err);
        }
      })
    );
  }

  private resolveComments(postId: string, uid: string): Comments {
    const post = this.messages.findById(postId);
    if (!post) throw new ApiError(404, "Пост не найден");
    const channel = this.chats.findById(post.chatId);
    if (!channel) throw new ApiError(404, "Канал не найден");
    const canSee = channel.memberIds.includes(uid) || !!channel.username;
    if (!canSee) throw new ApiError(403, "Комментарии доступны подписчикам канала");
    if (channel.commentsOff) throw new ApiError(403, "В этом канале комментарии отключены");
    if (!can(channel, uid, "commentPosts")) throw new ApiError(403, DENIED.commentPosts);
    if (!post.discussionAnchorId || !channel.linkedDiscussionChatId) {
      throw new ApiError(404, "У канала нет группы обсуждения — комментарии выключены");
    }
    const discussion = this.chats.findById(channel.linkedDiscussionChatId);
    const anchor = this.messages.findById(post.discussionAnchorId);
    if (!discussion || !anchor) throw new ApiError(404, "Обсуждение недоступно");
    return { post, channel, discussion, anchor };
  }
}
