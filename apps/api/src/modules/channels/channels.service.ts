import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { ChatsRepository } from "../chats/chats.repository.js";
import type { Chat } from "../chats/model/domain.js";
import { MessagesRepository } from "../messages/messages.repository.js";
import { RealtimeService } from "../realtime/realtime.service.js";

// Каталог каналов, похожие каналы, подписка и статистика (/api/channels) — как server/routes/channels.js.
const STATS_DAYS = 14;

@Injectable()
export class ChannelsService {
  public constructor(
    private readonly chats: ChatsRepository,
    private readonly messages: MessagesRepository,
    private readonly realtime: RealtimeService
  ) {}

  /** Каталог — только каналы: подписка (/subscribe) работает только для них. */
  public catalog(uid: string, q: string | undefined) {
    const channels = this.chats.searchPublic(q as string, { channelsOnly: true });
    return {
      channels: channels.map((c) => ({
        id: c.id,
        title: c.title,
        username: c.username,
        description: c.description,
        avatarColor: c.avatarColor,
        avatarImage: c.avatarImage,
        subscriberCount: c.memberIds.length,
        isMember: c.memberIds.includes(uid),
      })),
    };
  }

  public similar(uid: string, id: string) {
    const chat = this.visibleChannel(uid, id);
    return {
      channels: this.chats
        .similarChannels(chat.id, 10)
        .filter((c) => !(c.bannedIds ?? []).includes(uid))
        .map((c) => ({
          id: c.id,
          title: c.title,
          username: c.username,
          avatarColor: c.avatarColor,
          avatarImage: c.avatarImage,
          isVerified: !!c.isVerified,
          subscriberCount: c.memberIds.length,
          isMember: c.memberIds.includes(uid),
        })),
    };
  }

  public subscribe(uid: string, id: string) {
    const chat = this.chats.findById(id);
    if (!chat || chat.type !== "channel" || !chat.isPublic) throw new ApiError(404, "not found");
    if (chat.memberIds.includes(uid)) return { chat };
    if ((chat.bannedIds ?? []).includes(uid)) throw new ApiError(403, "Вас заблокировали в этом канале");

    const updated = this.chats.update(id, { memberIds: [...chat.memberIds, uid] })!;
    this.realtime.broadcastToUsers([uid], { type: "chat:added", chat: updated });
    return { chat: updated };
  }

  /** Сводка по постам для админов канала: просмотры, реакции, комментарии, по дням, топ. */
  public stats(uid: string, id: string) {
    const chat = this.visibleChannel(uid, id);
    const canSee = chat.ownerId === uid || (chat.ownerIds ?? []).includes(uid) || (chat.adminIds ?? []).includes(uid);
    if (!canSee) throw new ApiError(403, "Статистика доступна администраторам канала");

    const posts = this.messages.listFeed(chat.id, uid).filter((m) => m.type !== "system");
    const viewsOf = (list: typeof posts) => list.reduce((sum, m) => sum + (m.views ?? 0), 0);
    const views = viewsOf(posts);
    const comments = posts.reduce((sum, m) => sum + (m.commentCount ?? 0), 0);
    const reactions = posts.reduce((sum, m) => sum + (m.reactions ?? []).reduce((n, r) => n + (r.userIds?.length ?? 0), 0), 0);

    const today = new Date();
    const byDay = [];
    for (let i = STATS_DAYS - 1; i >= 0; i--) {
      const day = new Date(today);
      day.setDate(today.getDate() - i);
      const key = day.toISOString().slice(0, 10);
      const ofDay = posts.filter((m) => (m.createdAt ?? "").slice(0, 10) === key);
      byDay.push({ date: key, posts: ofDay.length, views: viewsOf(ofDay) });
    }

    const top = [...posts]
      .sort((a, b) => (b.views ?? 0) - (a.views ?? 0) || (b.commentCount ?? 0) - (a.commentCount ?? 0))
      .slice(0, 5)
      .map((m) => ({
        id: m.id,
        text: (m.text ?? "").slice(0, 120),
        createdAt: m.createdAt,
        views: m.views ?? 0,
        commentCount: m.commentCount ?? 0,
      }));

    return {
      subscribers: chat.memberIds.length,
      posts: posts.length,
      views,
      comments,
      reactions,
      averageViews: posts.length ? Math.round(views / posts.length) : 0,
      firstPostAt: posts.length ? posts[0].createdAt : null,
      lastPostAt: posts.length ? posts[posts.length - 1].createdAt : null,
      byDay,
      top,
    };
  }

  /** Канал, который видно: подписчикам или всем, если он публичный. Постороннему закрытый не раскрываем. */
  private visibleChannel(uid: string, id: string): Chat {
    const chat = this.chats.findById(id);
    if (!chat || chat.type !== "channel" || (!chat.isPublic && !chat.memberIds.includes(uid))) throw new ApiError(404, "Канал не найден");
    return chat;
  }
}
