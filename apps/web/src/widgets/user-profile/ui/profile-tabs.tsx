import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { GiftShelf } from "@/entities/gift";
import { type Attachment, mediaItem } from "@/entities/message";
import { openStoryViewer, storyDate, type StoryGroup, storyQueries } from "@/entities/story";
import { closeUserProfile } from "@/entities/user";

import { plural } from "@/shared/lib/presence";
import { Avatar, Icon, MediaViewer, type ViewerItem } from "@/shared/ui";

import { profileQueries, type SharedMedia } from "../api/profile-api";
import type { TabId } from "../lib/tabs";

import styles from "./user-profile.module.css";

const MEDIA_PAGE = 30;

type Owner = { id: string; name: string; isBot?: boolean; giftsReceived: unknown[] };
type Props = {
  tab: TabId;
  user: Owner;
  isSelf: boolean;
  shared: SharedMedia | null;
  sharedLoaded: boolean;
  /** Своя полка подарков изменилась (убрали, закрепили). */
  onGiftsChanged: (giftsReceived: unknown[]) => void;
};

const asAttachment = (a: unknown) => a as Attachment;

function mediaDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Содержимое вкладки профиля — renderTabContent в public/js/components/profileDialog.js. */
export function ProfileTabContent({ tab, user, isSelf, shared, sharedLoaded, onGiftsChanged }: Props) {
  if (tab === "gifts") return <GiftShelf user={user} isSelf={isSelf} onChanged={(u) => onGiftsChanged(u.giftsReceived)} />;
  if (tab === "stories") return <StoriesArchive user={user} isSelf={isSelf} />;
  if (tab === "groups") return <CommonGroups userId={user.id} />;
  if (tab === "voice") return <VoiceList items={shared?.voice ?? []} />;
  if (tab === "media") {
    const media = shared?.media ?? [];
    if (!media.length) return <p className={styles.emptyTab}>{sharedLoaded ? "Медиа пока нет" : "Загрузка…"}</p>;
    return <MediaGrid items={media} />;
  }
  if (tab === "files") {
    const files = shared?.files ?? [];
    if (!files.length) return <p className={styles.emptyTab}>Файлов пока нет</p>;
    return (
      <div className={styles.filesList}>
        {files.map((f) => {
          const a = asAttachment(f.attachment);
          return (
            <a key={f.messageId + (a.url ?? "")} className={styles.fileRow} href={a.url ?? undefined} target="_blank" rel="noreferrer" download={a.name ?? true}>
              <span className={styles.fileIcon}>
                <Icon name="File" size={20} />
              </span>
              <span className={styles.channelBody}>
                <span className={styles.channelTitle}>{a.name || "Файл"}</span>
                <span className={styles.channelSub}>{mediaDate(f.createdAt)}</span>
              </span>
            </a>
          );
        })}
      </div>
    );
  }
  const links = shared?.links ?? [];
  if (!links.length) return <p className={styles.emptyTab}>Ссылок пока нет</p>;
  return (
    <div className={styles.linksList}>
      {links.map((l) => {
        const preview = (l.linkPreview ?? null) as { url?: string; title?: string; description?: string; image?: string } | null;
        const url = preview?.url ?? l.text.match(/https?:\/\/\S+/)?.[0];
        if (!url) return null;
        return (
          <a key={l.messageId} className={styles.linkItem} href={url} target="_blank" rel="noreferrer">
            {preview?.title ? <span className={styles.channelTitle}>{preview.title}</span> : null}
            {preview?.description ? <span className={styles.channelSub}>{preview.description}</span> : null}
            <span className={styles.linkUrl}>{url}</span>
          </a>
        );
      })}
    </div>
  );
}

/** Плитки — порциями: сразу все фото переписки большого чата подвешивали профиль. */
function MediaGrid({ items }: { items: SharedMedia["media"] }) {
  const [shown, setShown] = useState(MEDIA_PAGE);
  const [open, setOpen] = useState<number | null>(null);
  const viewer: ViewerItem[] = items.map((m) => mediaItem(asAttachment(m.attachment), { id: m.messageId }));
  return (
    <div>
      <div className={styles.mediaGrid}>
        {viewer.slice(0, shown).map((v, i) => (
          <button key={`${items[i]?.messageId}-${i}`} type="button" className={styles.mediaCell} aria-label={v.kind === "video" ? "Видео" : "Фото"} onClick={() => setOpen(i)}>
            {v.kind === "video" && !v.thumbUrl ? <video className={styles.cellMedia} src={v.url} muted preload="metadata" /> : <img className={styles.cellMedia} src={v.thumbUrl ?? v.url} alt="" loading="lazy" />}
            {v.kind === "video" ? (
              <span className={styles.cellPlay}>
                <Icon name="Play" size={14} />
              </span>
            ) : null}
          </button>
        ))}
      </div>
      {shown < items.length ? (
        <button type="button" className={styles.actionButton} onClick={() => setShown((n) => n + MEDIA_PAGE)}>
          Показать ещё
        </button>
      ) : null}
      {open !== null ? <MediaViewer items={viewer} index={open} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

function StoriesArchive({ user, isSelf }: { user: Owner; isSelf: boolean }) {
  const archive = useQuery(storyQueries.archive(user.id));
  if (archive.isPending) return <div className={styles.spinner} />;
  if (archive.isError || !archive.data.allowed) return <p className={styles.emptyTab}>Архив историй закрыт</p>;
  const stories = archive.data.stories;
  if (!stories.length) return <p className={styles.emptyTab}>{isSelf ? "Вы ещё не выкладывали историй" : "Историй пока нет"}</p>;
  const frames = stories.flatMap((story) => (story.items?.length ? story.items : [{ kind: story.kind, url: story.url }]).map((item, index) => ({ story, item, index })));
  return (
    <div className={styles.storiesGrid}>
      {frames.map(({ story, item, index }) => (
        <button
          key={`${story.id}-${index}`}
          type="button"
          className={styles.storyCell}
          data-expired={story.expired ? "" : undefined}
          title={story.expired ? `Истекла ${storyDate(story.createdAt)}` : `Ещё в ленте · ${storyDate(story.createdAt)}`}
          onClick={() =>
            openStoryViewer([{ user, stories: [story] } as unknown as StoryGroup], 0, {
              startIndex: index,
              onChanged: () => void archive.refetch(),
            })
          }
        >
          {item.kind === "video" ? <video className={styles.cellMedia} src={item.url} muted preload="metadata" /> : <img className={styles.cellMedia} src={item.url} alt="" />}
          {item.kind === "video" ? (
            <span className={styles.cellPlay}>
              <Icon name="Play" size={14} />
            </span>
          ) : null}
          <span className={styles.storyDate}>{storyDate(story.createdAt)}</span>
        </button>
      ))}
    </div>
  );
}

function CommonGroups({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const groups = useQuery(profileQueries.commonChats(userId));
  if (groups.isPending) return <div className={styles.spinner} />;
  const list = groups.data ?? [];
  if (!list.length) return <p className={styles.emptyTab}>Общих групп нет</p>;
  return (
    <div className={styles.groupsList}>
      {list.map((g) => (
        <button
          key={g.id}
          type="button"
          className={styles.channelRow}
          onClick={() => {
            closeUserProfile();
            void navigate(`/chat/${g.id}`);
          }}
        >
          <Avatar size={38} name={g.title} color={g.avatarColor} image={g.avatarImage} />
          <span className={styles.channelBody}>
            <span className={styles.channelTitle}>{g.title}</span>
            <span className={styles.channelSub}>
              {g.members} {plural(g.members, "участник", "участника", "участников")}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

function VoiceList({ items }: { items: SharedMedia["voice"] }) {
  if (!items.length) return <p className={styles.emptyTab}>Голосовых пока нет</p>;
  return (
    <div className={styles.groupsList}>
      {items.map((v) => {
        const a = asAttachment(v.attachment);
        const note = a.kind === "video-note";
        const meta = [note ? "Видеосообщение" : "Голосовое", a.durationSec ? ` · ${Math.round(a.durationSec)} с` : "", ` · ${mediaDate(v.createdAt)}`].join("");
        return (
          <div key={v.messageId} className={styles.voiceRow}>
            <span className={styles.channelSub}>{meta}</span>
            {note ? <video className={styles.voiceNote} src={a.url ?? undefined} controls preload="metadata" playsInline /> : <CompactVoice url={a.url ?? ""} durationSec={a.durationSec ?? 0} />}
          </div>
        );
      })}
    </div>
  );
}

const fmt = (sec: number) => {
  const t = Math.max(0, Math.floor(sec || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

/** Голосовое в профиле — компактная строка (кнопка, полоска, время) вместо системного плеера. */
function CompactVoice({ url, durationSec }: { url: string; durationSec: number }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [state, setState] = useState({ current: 0, duration: 0, paused: true });
  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    const paint = () => setState({ current: a.currentTime, duration: Number.isFinite(a.duration) && a.duration > 0 ? a.duration : 0, paused: a.paused });
    const events = ["play", "pause", "ended", "timeupdate", "loadedmetadata"];
    for (const ev of events) a.addEventListener(ev, paint);
    return () => events.forEach((ev) => a.removeEventListener(ev, paint));
  }, []);
  const total = state.duration || durationSec;
  return (
    <div className={styles.voiceCompact}>
      <audio ref={audio} src={url} preload="none" />
      <button
        type="button"
        className={styles.voicePlay}
        aria-label="Слушать"
        onClick={(e) => {
          e.stopPropagation();
          const a = audio.current;
          if (!a) return;
          if (a.paused) void a.play().catch(() => {});
          else a.pause();
        }}
      >
        <Icon name={state.paused ? "PlayFill" : "PauseFill"} size={18} />
      </button>
      <span
        className={styles.voiceTrack}
        onPointerDown={(e) => {
          const a = audio.current;
          const r = e.currentTarget.getBoundingClientRect();
          if (a && total && r.width) a.currentTime = ((e.clientX - r.left) / r.width) * total;
        }}
      >
        <span className={styles.voiceFill} style={{ transform: `scaleX(${total ? Math.min(1, state.current / total) : 0})` }} />
      </span>
      <span className={styles.voiceTime}>{state.current > 0 ? `${fmt(state.current)} / ${fmt(total)}` : fmt(total)}</span>
    </div>
  );
}
