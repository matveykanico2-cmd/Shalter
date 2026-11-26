import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";

import { chatQueries, type ChatSummary, useChats } from "@/entities/chat";
import { type Message, messageQueries } from "@/entities/message";
import type { SelfUser } from "@/entities/session";

import { Avatar, Icon } from "@/shared/ui";

import { feedQueries, reactToMessage, subscribeChannel } from "../api/feed";

import styles from "./feed-view.module.css";

type FeedPost = {
  chat: ChatSummary;
  message: Message;
  text: string;
  createdAt: string;
  views: number;
  comments: number;
  attachments: Message["attachments"];
  kind: "text" | "media" | "clip";
};

const formatDate = (value: string) => new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(value));

function postFromMessage(chat: ChatSummary, message: Message): FeedPost | null {
  if (!message || (!message.text?.trim() && !message.attachments?.length)) return null;
  return {
    chat,
    message,
    text: message.text?.trim() || "Медиа-публикация",
    createdAt: message.createdAt,
    views: message.views ?? 0,
    comments: message.commentCount ?? 0,
    attachments: message.attachments ?? [],
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
  const sourceChannels = tab === "following" ? following : channels;
  const historyQueries = useQueries({ queries: sourceChannels.slice(0, 24).map((channel) => messageQueries.history(channel.id)) });
  const posts = useMemo(() => historyQueries.flatMap((query, index) => (query.data?.messages ?? []).filter((message) => message.type !== "system").map((message) => postFromMessage(sourceChannels[index]!, message))).filter((post): post is FeedPost => !!post).filter((post) => filter === "all" || post.kind === filter).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 60), [filter, historyQueries, sourceChannels]);
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

  const toggleLike = async (post: FeedPost) => {
    toggle(liked, post.message.id, setLiked);
    try {
      await reactToMessage(post.chat.id, post.message.id, "❤️");
      await queryClient.invalidateQueries({ queryKey: messageQueries.chatHistories(post.chat.id) });
    } catch {
      toggle(liked, post.message.id, setLiked);
    }
  };

  return (
    <div className={styles.view}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Shalter Social</p>
          <h1>Лента</h1>
        </div>
        <button type="button" className={styles.explore} onClick={() => void navigate("/discover-channels")}>
          <Icon name="Globe" size={18} />
          <span>Каналы</span>
        </button>
      </header>

      <div className={styles.content}>
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

        {chatsQuery.isPending || historyQueries.some((query) => query.isPending) ? <div className={styles.empty}>Загружаем новости…</div> : posts.length ? (
          <div className={styles.posts}>
            {posts.map((post) => {
              const key = post.message.id;
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
                    <Attachments attachments={post.attachments} />
                  </button>
                  <div className={styles.actions}>
                    <button type="button" aria-label={isLiked ? "Убрать лайк" : "Поставить лайк"} className={isLiked ? styles.actionActive : undefined} onClick={() => void toggleLike(post)}><Icon name="Heart" size={22} /><span className={styles.actionLabel}>Нравится</span></button>
                    <button type="button" aria-label="Открыть комментарии" onClick={() => void navigate(`/chat/${post.chat.id}`)}><Icon name="MessageCircle" size={22} /><span>{post.comments}</span></button>
                    <button type="button" aria-label={isSaved ? "Убрать из сохранённых (только на этом устройстве)" : "Сохранить (только на этом устройстве)"} className={`${styles.save} ${isSaved ? styles.actionActive : ""}`} onClick={() => toggle(saved, key, setSaved)}><Icon name="Bookmark" size={22} /></button>
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

function Attachments({ attachments }: { attachments: Message["attachments"] }) {
  if (!attachments?.length) return null;
  const media = attachments.filter((attachment) => ["image", "video"].includes(String((attachment as { kind?: string }).kind)));
  const others = attachments.filter((attachment) => !["image", "video"].includes(String((attachment as { kind?: string }).kind)));
  return (
    <div className={styles.attachments}>
      {media.map((raw, index) => {
        const attachment = raw as { kind?: string; url?: string; thumbUrl?: string; posterUrl?: string; name?: string };
        if (!attachment.url) return null;
        return attachment.kind === "video" ? <video key={`${attachment.url}-${index}`} className={styles.media} src={attachment.url} poster={attachment.posterUrl ?? attachment.thumbUrl} controls playsInline preload="metadata" /> : <img key={`${attachment.url}-${index}`} className={styles.media} src={attachment.url} alt={attachment.name ?? "Вложение"} loading="lazy" />;
      })}
      {others.length ? <div className={styles.otherAttachments}>{others.map((raw, index) => { const attachment = raw as { kind?: string; name?: string }; return <span key={index}><Icon name={attachment.kind === "voice" || attachment.kind === "audio" ? "Mic" : "Paperclip"} size={17} />{attachment.name ?? attachment.kind ?? "Вложение"}</span>; })}</div> : null}
    </div>
  );
}
