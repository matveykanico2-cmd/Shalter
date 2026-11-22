import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";

import { StoriesBar } from "@/features/stories";

import { chatQueries, type ChatSummary, useChats } from "@/entities/chat";
import type { SelfUser } from "@/entities/session";

import { Avatar, Icon } from "@/shared/ui";

import { feedQueries, subscribeChannel } from "../api/feed";

import styles from "./feed-view.module.css";

type FeedPost = {
  chat: ChatSummary;
  text: string;
  createdAt: string;
  views: number;
  comments: number;
  attachments: number;
  kind: "text" | "media" | "clip";
};

const formatDate = (value: string) => new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(value));

function postFromChat(chat: ChatSummary): FeedPost | null {
  const message = chat.lastMessage;
  if (!message || (!message.text?.trim() && !message.attachments?.length)) return null;
  return {
    chat,
    text: message.text?.trim() || "Медиа-публикация",
    createdAt: message.createdAt,
    views: message.views ?? 0,
    comments: message.commentCount ?? 0,
    attachments: message.attachments?.length ?? 0,
    kind: message.attachments?.some((attachment) => (attachment as { kind?: string }).kind === "video") ? "clip" : message.attachments?.length ? "media" : "text",
  };
}

export function FeedView({ me }: { me: SelfUser }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const chatsQuery = useChats();
  const discoverQuery = useQuery(feedQueries.channels());
  const [tab, setTab] = useState<"for-you" | "following">("following");
  const [filter, setFilter] = useState<"all" | "text" | "media" | "clip">("all");
  const [liked, setLiked] = useState<Set<string>>(() => new Set());
  const [saved, setSaved] = useState<Set<string>>(() => new Set());
  const channels = useMemo(() => (chatsQuery.data ?? []).filter((chat) => chat.type === "channel"), [chatsQuery.data]);
  const following = useMemo(() => channels.filter((chat) => chat.memberIds.includes(me.id)), [channels, me.id]);
  const posts = useMemo(() => (tab === "following" ? following : channels).map(postFromChat).filter((post): post is FeedPost => !!post).filter((post) => filter === "all" || post.kind === filter).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [channels, filter, following, tab]);
  const suggestions = useMemo(() => (discoverQuery.data ?? []).filter((channel) => !channel.isMember).slice(0, 4), [discoverQuery.data]);

  const subscribe = async (channelId: string) => {
    await subscribeChannel(channelId);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: chatQueries.list().queryKey }),
      queryClient.invalidateQueries({ queryKey: feedQueries.channels().queryKey }),
    ]);
  };

  const toggle = (set: Set<string>, id: string, setter: (next: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  };

  return (
    <div className={styles.view}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Shalter</p>
          <h1>Лента</h1>
        </div>
        <button type="button" className={styles.explore} onClick={() => void navigate("/discover-channels")}>
          <Icon name="Globe" size={18} />
          <span>Каналы</span>
        </button>
      </header>

      <div className={styles.content}>
        <section className={styles.storiesCard} aria-label="Истории">
          <div className={styles.sectionHead}>
            <div>
              <h2>Истории</h2>
              <span>Что нового у ваших контактов</span>
            </div>
            <Icon name="ChevronRight" size={18} />
          </div>
          <StoriesBar me={me} />
        </section>

        <div className={styles.feedHead}>
          <div>
            <h2>Новости</h2>
            <span>{posts.length ? `${posts.length} публикаций` : "Публикации каналов"}</span>
          </div>
          <div className={styles.tabs} role="tablist" aria-label="Режим ленты">
            <button type="button" className={tab === "for-you" ? styles.tabActive : ""} onClick={() => setTab("for-you")}>Для вас</button>
            <button type="button" className={tab === "following" ? styles.tabActive : ""} onClick={() => setTab("following")}>Подписки</button>
          </div>
        </div>
        <div className={styles.filters} aria-label="Фильтры ленты">
          {(["all", "text", "media", "clip"] as const).map((value) => (
            <button key={value} type="button" className={filter === value ? styles.filterActive : ""} onClick={() => setFilter(value)}>
              {value === "all" ? "Все" : value === "text" ? "Текст" : value === "media" ? "Фото и файлы" : "Клипы"}
            </button>
          ))}
        </div>

        {chatsQuery.isPending ? <div className={styles.empty}>Загружаем новости…</div> : posts.length ? (
          <div className={styles.posts}>
            {posts.map((post) => {
              const key = post.chat.id;
              const isLiked = liked.has(key);
              const isSaved = saved.has(key);
              return (
                <article key={key} className={styles.post}>
                  <button type="button" className={styles.postAuthor} onClick={() => void navigate(post.chat.username && !post.chat.memberIds.includes(me.id) ? `/u/${post.chat.username}` : `/chat/${post.chat.id}`)}>
                    <Avatar name={post.chat.title ?? "Канал"} color={post.chat.avatarColor} image={post.chat.avatarImage} emoji={post.chat.avatarEmoji} size={44} />
                    <span className={styles.authorText}>
                      <strong>{post.chat.title || "Канал"}{post.chat.isVerified ? <Icon name="Verified" size={14} /> : null}</strong>
                      <small>{post.chat.username ? `@${post.chat.username}` : "Канал Shalter"} · {formatDate(post.createdAt)}</small>
                    </span>
                    {!post.chat.memberIds.includes(me.id) ? <span className={styles.followPill} onClick={(event) => { event.stopPropagation(); void subscribe(post.chat.id); }}>Подписаться</span> : null}
                    <Icon name="MoreVertical" size={19} />
                  </button>
                  <button type="button" className={styles.postBody} onClick={() => void navigate(`/chat/${post.chat.id}`)}>
                    <p>{post.text}</p>
                    {post.attachments ? <div className={styles.mediaPlaceholder}><Icon name="Image" size={28} /><span>{post.attachments} вложение{post.attachments === 1 ? "" : "я"}</span></div> : null}
                  </button>
                  <div className={styles.actions}>
                    <button type="button" aria-label={isLiked ? "Убрать лайк" : "Поставить лайк"} className={isLiked ? styles.actionActive : undefined} onClick={() => toggle(liked, key, setLiked)}><Icon name="Star" size={20} /><span>{post.views + (isLiked ? 1 : 0)}</span></button>
                    <button type="button" aria-label="Открыть комментарии" onClick={() => void navigate(`/chat/${post.chat.id}`)}><Icon name="MessageCircle" size={20} /><span>{post.comments}</span></button>
                    <button type="button" aria-label={isSaved ? "Убрать из сохранённых" : "Сохранить"} className={`${styles.save} ${isSaved ? styles.actionActive : ""}`} onClick={() => toggle(saved, key, setSaved)}><Icon name="Bookmark" size={20} /></button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}><Icon name="Megaphone" size={28} /></span>
            <h3>Лента пока пустая</h3>
            <p>Подпишитесь на публичные каналы, и их новые публикации появятся здесь.</p>
            <button type="button" onClick={() => void navigate("/discover-channels")}>Найти каналы</button>
          </div>
        )}

        {suggestions.length ? (
          <section className={styles.suggestions} aria-label="Рекомендации каналов">
            <div className={styles.feedHead}>
              <div><h2>Вам может понравиться</h2><span>Публичные каналы Shalter</span></div>
              <button type="button" className={styles.allChannels} onClick={() => void navigate("/discover-channels")}>Все</button>
            </div>
            <div className={styles.suggestionGrid}>
              {suggestions.map((channel) => (
                <article key={channel.id} className={styles.suggestion}>
                  <button type="button" className={styles.suggestionProfile} onClick={() => void navigate(channel.username ? `/u/${channel.username}` : `/chat/${channel.id}`)}>
                    <Avatar name={channel.title ?? "Канал"} color={channel.avatarColor} image={channel.avatarImage} emoji={channel.avatarEmoji} size={42} />
                    <strong>{channel.title || "Канал"}</strong>
                    <span>{channel.username ? `@${channel.username}` : "Публичный канал"}</span>
                  </button>
                  <button type="button" className={styles.subscribeButton} onClick={() => void subscribe(channel.id)}>Подписаться</button>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
