import { randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { SYSTEM_BOT_ID } from "../../common/config/accounts.js";
import { ApiError } from "../../common/errors/api-error.js";
import { hasAdminSection } from "../../common/lib/admin-access.js";
import { findOrCreateDm, isSafeUrl, mediaJobs, push, queueJob, sendMessageAndBroadcast, usesForeignUpload } from "../../legacy/legacy.js";
import { ChatsRepository } from "../chats/chats.repository.js";
import type { Chat } from "../chats/model/domain.js";
import { RealtimeService } from "../realtime/realtime.service.js";
import { publicUser } from "../users/lib/user.presenter.js";
import type { User } from "../users/model/domain.js";
import { UserPrivacyService } from "../users/user-privacy.service.js";
import { UsersRepository } from "../users/users.repository.js";
import { STORY_TTL_MS } from "./lib/story.mapper.js";
import type { Story, StoryItem } from "./model/domain.js";
import type { CreateStoryDto, EditStoryCommentDto, StoryCommentDto } from "./model/schemas/story.schema.js";
import { StoriesRepository } from "./stories.repository.js";
import { StoryAudienceService } from "./story-audience.service.js";

// Истории людей и каналов, лайки, комментарии, просмотры — как server/routes/stories.js.
const MAX_ITEMS = 10;

/** Автор истории в ответе: профиль человека или карточка канала. */
type Author = ReturnType<typeof publicUser> | ChannelAuthor;
interface ChannelAuthor {
  id: string;
  name: string;
  username: string | null;
  avatarColor: string | undefined;
  avatarImage: string | null;
  isChannel: true;
  canManage: boolean;
}

const isChannelId = (id: unknown): id is string => typeof id === "string" && id.startsWith("c_");

const isChannelStaff = (chat: Chat | undefined | null, uid: string): boolean => chat?.ownerId === uid || (chat?.adminIds ?? []).includes(uid);

const newStoryId = (now: number) => `st_${now}_${randomBytes(4).toString("hex")}`;

function sanitizeStoryItems(body: CreateStoryDto): StoryItem[] {
  const { kind, url } = body;
  const rawItems: any[] = Array.isArray(body.items) && body.items.length ? body.items : [{ kind, url }];
  return rawItems
    .slice(0, MAX_ITEMS)
    .filter((it) => it && ["image", "video"].includes(it.kind) && it.url && isSafeUrl(it.url))
    .map((it) => ({ kind: it.kind, url: it.url }));
}

// Кто посмотрел и лайкнул — видит только автор (или админ канала).
function storyFor(st: Story, uid: string, author: object | null) {
  const own = st.userId === uid || !!(author as { canManage?: boolean } | null)?.canManage;
  const out: Partial<Story> & Record<string, unknown> = {
    ...st,
    viewed: st.viewedByIds.includes(uid),
    liked: st.likedByIds.includes(uid),
    likeCount: st.likedByIds.length,
    viewCount: st.viewedByIds.length,
  };
  if (!own) {
    delete out.viewedByIds;
    delete out.likedByIds;
  }
  return out;
}

@Injectable()
export class StoriesService {
  public constructor(
    private readonly stories: StoriesRepository,
    private readonly audience: StoryAudienceService,
    private readonly chats: ChatsRepository,
    private readonly users: UsersRepository,
    private readonly privacy: UserPrivacyService,
    private readonly realtime: RealtimeService
  ) {}

  public feed(uid: string) {
    const list = this.stories.listActiveFor(this.audience.visibleAuthorIds(uid));
    const byAuthor = new Map<string, Story[]>();
    for (const s of list) {
      if (!byAuthor.has(s.userId)) byAuthor.set(s.userId, []);
      byAuthor.get(s.userId)!.push(s);
    }
    const groups = [...byAuthor.entries()].map(([authorId, items]) => {
      if (this.blockedBy(authorId, uid)) return { user: null };
      const user = this.authorInfo(authorId, uid);
      const sorted = items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      return { user, stories: sorted.map((s) => storyFor(s, uid, user)) };
    });
    return { groups: groups.filter((g) => g.user) };
  }

  public ofUser(uid: string, targetId: string) {
    const allowed = this.audience.visibleAuthorIds(uid);
    if (!allowed.includes(targetId) || this.blockedBy(targetId, uid)) return { group: null };
    const list = this.stories.listActiveFor([targetId]);
    if (!list.length) return { group: null };
    const user = this.authorInfo(targetId, uid);
    if (!user) return { group: null };
    return {
      group: {
        user,
        stories: list.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((st) => storyFor(st, uid, user)),
      },
    };
  }

  public archive(uid: string, targetId: string) {
    const isSelf = targetId === uid;
    let channelChat: Chat | undefined;
    if (isChannelId(targetId)) {
      const chat = this.chats.findById(targetId);
      channelChat = chat;
      if (!chat || chat.type !== "channel" || !chat.memberIds.includes(uid)) return { stories: [], allowed: false };
    } else if (!isSelf) {
      const allowed = this.audience.visibleAuthorIds(uid);
      if (!allowed.includes(targetId)) return { stories: [], allowed: false };
      if (!this.privacy.allowsUser(targetId, "storiesArchive", uid)) return { stories: [], allowed: false };
    }

    const now = Date.now();
    return {
      allowed: true,
      stories: this.stories.listArchivedFor(targetId).map((st) => ({
        ...storyFor(st, uid, isChannelId(targetId) ? { canManage: isChannelStaff(channelChat, uid) } : null),
        expired: new Date(st.expiresAt).getTime() <= now,
      })),
    };
  }

  public create(uid: string, body: CreateStoryDto) {
    const story = this.addStory(uid, uid, body);
    this.realtime.broadcastToUsers(this.audience.audienceOf(uid), { type: "story:new", storyId: story.id, userId: uid });
    this.queueMedia(story);
    this.pushNewStory(uid).catch((err) => console.error("story push failed:", err));
    return { story };
  }

  public createForChannel(uid: string, chatId: string, body: CreateStoryDto) {
    const chat = this.chats.findById(chatId);
    if (!chat || chat.type !== "channel") throw new ApiError(400, "Истории есть только у каналов");
    if (!isChannelStaff(chat, uid)) throw new ApiError(403, "Недостаточно прав");
    const story = this.addStory(uid, chat.id, body);
    this.realtime.broadcastToUsers(chat.memberIds, { type: "story:new", storyId: story.id, userId: chat.id });
    this.queueMedia(story);
    return { story };
  }

  public view(uid: string, id: string) {
    this.visibleStory(uid, id);
    const story = this.stories.markViewed(id, uid);
    return { story: story ? this.storyForOne(story, uid) : story };
  }

  public like(uid: string, id: string) {
    this.visibleStory(uid, id);
    const story = this.stories.toggleLike(id, uid)!;
    this.realtime.broadcastToUsers(this.audienceForStory(story), {
      type: "story:liked",
      storyId: story.id,
      userId: story.userId,
      likeCount: story.likedByIds.length,
    });
    return { story: this.storyForOne(story, uid), liked: story.likedByIds.includes(uid), likeCount: story.likedByIds.length };
  }

  public comments(uid: string, id: string) {
    this.visibleStory(uid, id);
    const comments = this.stories.listComments(id);
    const byId = new Map(this.uniqueUsers(comments.map((c) => c.userId)).map((u) => [u.id, publicUser(u)]));
    return { comments: comments.map((c) => ({ ...c, author: byId.get(c.userId) ?? null })) };
  }

  public addComment(uid: string, id: string, dto: StoryCommentDto) {
    const visible = this.visibleStory(uid, id);
    const text = dto.text.trim().slice(0, 500);
    if (!text) throw new ApiError(400, "empty comment");

    let parentId: string | null = null;
    if (dto.parentId) {
      const parent = this.stories.findComment(String(dto.parentId));
      if (parent && parent.storyId === id) parentId = parent.parentId ?? parent.id;
    }
    const comment = this.stories.addComment({
      id: `stc_${Date.now()}_${randomBytes(4).toString("hex")}`,
      storyId: id,
      userId: uid,
      text,
      createdAt: new Date().toISOString(),
      parentId,
    });
    const author = publicUser(this.users.findById(uid)!);
    this.realtime.broadcastToUsers(this.audienceForStory(visible), { type: "story:commented", storyId: id, comment: { ...comment, author } });
    return { comment: { ...comment, author } };
  }

  public likeComment(uid: string, id: string, commentId: string) {
    const visible = this.visibleStory(uid, id);
    const existing = this.stories.findComment(commentId);
    if (!existing || existing.storyId !== id) throw new ApiError(404, "not found");

    const comment = this.stories.toggleCommentLike(commentId, uid)!;
    this.realtime.broadcastToUsers(this.audienceForStory(visible), {
      type: "story:comment-liked",
      storyId: id,
      commentId: comment.id,
      likeCount: comment.likeCount,
      likedByIds: comment.likedByIds,
    });
    return { comment, liked: comment.likedByIds.includes(uid), likeCount: comment.likeCount };
  }

  public editComment(uid: string, id: string, commentId: string, dto: EditStoryCommentDto) {
    const found = this.storyComment(id, commentId);
    if (found.comment.userId !== uid) throw new ApiError(403, "Править можно только свой комментарий");
    // Как и остальные действия с историей — только пока она видна. Удалить свой
    // комментарий (DELETE) можно и после: это уборка своих данных.
    this.visibleStory(uid, found.story.id);
    const text = dto.text.trim().slice(0, 500);
    if (!text) throw new ApiError(400, "empty comment");

    const comment = this.stories.editComment(found.comment.id, text);
    const author = publicUser(this.users.findById(uid)!);
    this.realtime.broadcastToUsers(this.audienceForStory(found.story), {
      type: "story:comment-updated",
      storyId: found.story.id,
      comment: { ...comment, author },
    });
    return { comment: { ...comment, author } };
  }

  public deleteComment(uid: string, id: string, commentId: string) {
    const { story, comment } = this.storyComment(id, commentId);
    let allowed = comment.userId === uid;
    if (!allowed && isChannelId(story.userId)) allowed = isChannelStaff(this.chats.findById(story.userId), uid);
    else if (!allowed) allowed = story.userId === uid;
    if (!allowed) allowed = hasAdminSection(this.users.findById(uid), "moderation");
    if (!allowed) throw new ApiError(403, "Недостаточно прав");

    this.stories.deleteComment(comment.id);
    this.realtime.broadcastToUsers(this.audienceForStory(story), { type: "story:comment-deleted", storyId: story.id, commentId: comment.id });
    return { ok: true };
  }

  public viewers(uid: string, id: string) {
    const story = this.stories.findById(id);
    if (!story) throw new ApiError(404, "not found");
    if (isChannelId(story.userId)) {
      const chat = this.chats.findById(story.userId);
      if (!chat || !isChannelStaff(chat, uid)) throw new ApiError(403, "Недостаточно прав");
    } else if (story.userId !== uid) {
      throw new ApiError(403, "Недостаточно прав");
    }
    const viewers = story.viewedByIds
      .filter((id) => id !== uid)
      .map((id) => this.users.findById(id))
      .filter((u): u is User => !!u);
    return { viewers: viewers.map(publicUser) };
  }

  public async remove(uid: string, id: string) {
    const story = this.stories.findById(id);
    if (!story) throw new ApiError(404, "not found");

    let audience: string[];
    let byModerator = false;
    const moderator = () => hasAdminSection(this.users.findById(uid), "moderation");
    if (isChannelId(story.userId)) {
      const chat = this.chats.findById(story.userId);
      if (!chat) throw new ApiError(404, "not found");
      if (!isChannelStaff(chat, uid)) {
        if (!moderator()) throw new ApiError(403, "Недостаточно прав");
        byModerator = true;
      }
      audience = chat.memberIds;
    } else if (story.userId !== uid) {
      if (!moderator()) throw new ApiError(403, "Недостаточно прав");
      byModerator = true;
      audience = [...new Set([story.userId, uid, ...this.audience.audienceOf(story.userId)])];
    } else {
      audience = this.audience.audienceOf(uid);
    }

    if (!this.stories.delete(id, story.userId)) throw new ApiError(404, "not found");
    this.realtime.broadcastToUsers(audience, { type: "story:deleted", storyId: id, userId: story.userId });
    if (byModerator) {
      const chat = isChannelId(story.userId) ? this.chats.findById(story.userId) : undefined;
      const authorId = chat ? chat.ownerId : story.userId;
      if (authorId) {
        const dm = await findOrCreateDm(SYSTEM_BOT_ID, authorId);
        await sendMessageAndBroadcast(
          dm,
          SYSTEM_BOT_ID,
          chat ? `🛡 История канала «${chat.title}» удалена модерацией Shalter за нарушение правил.` : "🛡 Ваша история удалена модерацией Shalter за нарушение правил."
        );
      }
    }
    return { ok: true };
  }

  private addStory(uid: string, authorId: string, body: CreateStoryDto): Story {
    const items = sanitizeStoryItems(body);
    if (!items.length) throw new ApiError(400, "invalid story");
    if (usesForeignUpload(uid, items)) throw new ApiError(400, "Некорректная ссылка на файл");
    const now = Date.now();
    return this.stories.create({
      id: newStoryId(now),
      userId: authorId,
      items,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + STORY_TTL_MS).toISOString(),
    });
  }

  /** Видео истории обрабатывает фоновый процесс (server/lib/mediaJobs.js). */
  private queueMedia(story: Story): void {
    if (mediaJobs().storyNeedsMedia(story)) queueJob("story-videos", { storyId: story.id });
  }

  private async pushNewStory(uid: string): Promise<void> {
    const author = this.users.findById(uid);
    const name = author?.name || "Кто-то";
    const targets = this.audience.audienceOf(uid).filter((id) => id !== uid);
    const notify = push();
    await Promise.all(
      targets.map(async (id) =>
        notify.sendPushToUser(
          id,
          { title: name, body: "Опубликовал(а) новую историю", ...(await notify.userPushAvatar(author, id)), url: "/", tag: `story-new:${uid}` },
          notify.MESSAGE_PUSH
        )
      )
    );
  }

  /** Неистёкшая история автора, которого uid видит; иначе 404. */
  private visibleStory(uid: string, id: string): Story {
    const story = this.stories.findActive(id);
    if (!story || !this.audience.visibleAuthorIds(uid).includes(story.userId)) throw new ApiError(404, "not found");
    return story;
  }

  private storyComment(id: string, commentId: string) {
    const story = this.stories.findById(id);
    const comment = story ? this.stories.findComment(commentId) : undefined;
    if (!story || !comment || comment.storyId !== story.id) throw new ApiError(404, "not found");
    return { story, comment };
  }

  // Для ответов про одну историю: у истории канала списки видят и его админы.
  private storyForOne(st: Story, uid: string) {
    const author = isChannelId(st.userId) ? { canManage: isChannelStaff(this.chats.findById(st.userId), uid) } : null;
    return storyFor(st, uid, author);
  }

  private audienceForStory(story: Story): string[] {
    if (isChannelId(story.userId)) return this.chats.findById(story.userId)?.memberIds ?? [];
    return this.audience.audienceOf(story.userId);
  }

  private blockedBy(authorId: string, uid: string): boolean {
    if (isChannelId(authorId)) return false;
    return !!this.users.findById(authorId)?.blockedUserIds?.includes(uid);
  }

  private authorInfo(id: string, viewerId: string): Author | null {
    if (isChannelId(id)) {
      const chat = this.chats.findById(id);
      if (!chat || chat.type !== "channel") return null;
      return {
        id: chat.id,
        name: chat.title,
        username: chat.username ?? null,
        avatarColor: chat.avatarColor,
        avatarImage: chat.avatarImage ?? null,
        isChannel: true,
        canManage: isChannelStaff(chat, viewerId),
      };
    }
    const user = this.users.findById(id);
    return user ? publicUser(user) : null;
  }

  /** Пользователи по id, каждый один раз. */
  private uniqueUsers(ids: string[]): User[] {
    return [...new Set(ids)].map((id) => this.users.findById(id)).filter((u): u is User => !!u);
  }
}
