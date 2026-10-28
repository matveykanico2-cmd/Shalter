import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import type { SelfUser } from "@/entities/session";
import { hasUnseen, openStoryViewer, type StoryGroup, storyQueries } from "@/entities/story";

import { useWsEvent } from "@/shared/api";
import { errorText } from "@/shared/lib/error-text";
import { Avatar, Icon, toast } from "@/shared/ui";

import { postStory, postTextStory } from "../model/post-story";

import styles from "./stories-bar.module.css";
import { StoryEditor } from "./story-editor";

const NO_GROUPS: StoryGroup[] = [];

/** Полоса историй над списком чатов — как StoriesBar в public/js/components/storiesBar.js. */
export function StoriesBar({ me }: { me: SelfUser }) {
  const queryClient = useQueryClient();
  const groups = useQuery(storyQueries.feed()).data?.groups ?? NO_GROUPS;
  const fileRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ file: File | null; resolve: (f: File | null) => void } | null>(null);
  const [creating, setCreating] = useState<"text" | "media" | null>(null);

  const refetch = () => void queryClient.invalidateQueries({ queryKey: storyQueries.baseKey });
  useWsEvent("story:new", refetch);
  // Видео истории обработано (H.264 1080p) — подтягиваем, чтобы играла обработанная версия.
  useWsEvent("story:updated", refetch);
  useWsEvent("story:deleted", refetch);
  useWsEvent("ws:reconnected", refetch);

  const pick = async (files: File[]) => {
    try {
      const posted = await postStory(files, {
        edit: (file) => new Promise((resolve) => setEditing({ file, resolve })),
        progress: setProgress,
      });
      if (posted) await queryClient.invalidateQueries({ queryKey: storyQueries.baseKey });
    } catch (err) {
      toast(errorText(err, "Не удалось выложить историю"), { error: true });
    } finally {
      setProgress(null);
      setCreating(null);
    }
  };

  // «Текст» — пустой белый холст в редакторе; готовая картинка уходит как фото-история.
  const textStory = async () => {
    const image = await new Promise<File | null>((resolve) => setEditing({ file: null, resolve }));
    if (!image) return;
    try {
      setProgress("Загружаем историю…");
      await postTextStory(image);
      await queryClient.invalidateQueries({ queryKey: storyQueries.baseKey });
    } catch (err) {
      toast(errorText(err, "Не удалось выложить историю"), { error: true });
    } finally {
      setProgress(null);
      setCreating(null);
    }
  };

  const myIndex = groups.findIndex((g) => g.user.id === me.id);
  const myGroup = groups[myIndex] ?? null;
  const addStory = () => fileRef.current?.click();
  const openCreate = () => setCreating("media");
  const ring = (g: StoryGroup | null) => (g ? (hasUnseen(g) ? `${styles.ring} ${styles.unseen}` : `${styles.ring} ${styles.seen}`) : styles.ring);

  /** Кружок своей истории: открывает просмотр, если она есть. */
  const ownItem = myGroup ? (
    <button
      type="button"
      className={styles.item}
      onClick={() => openStoryViewer(groups, myIndex)}
      onContextMenu={(e) => {
        e.preventDefault();
        openCreate();
      }}
    >
      <span className={ring(myGroup)}>
        <Avatar name={me.name} color={me.avatarColor} image={me.avatarImage} size={52} />
      </span>
      <span className={styles.label}>{progress ?? "Моя история"}</span>
    </button>
  ) : null;

  /** Кружок «Выложить историю» — создать новую (фото/видео или текстовый пост). Всегда виден. */
  const postItem = (
    <button
      type="button"
      className={styles.item}
      onClick={openCreate}
      onContextMenu={(e) => {
        e.preventDefault();
        openCreate();
      }}
    >
      <span className={ring(null)}>
        <Avatar name={me.name} color={me.avatarColor} image={me.avatarImage} size={52} />
        <span className={styles.addBadge} title="Выложить историю" onClick={(e) => { e.stopPropagation(); openCreate(); }}>
          <Icon name="Plus" size={12} />
        </span>
      </span>
      <span className={styles.label}>Выложить историю</span>
    </button>
  );

  return (
    <div className={styles.bar}>
      {ownItem}
      {postItem}
      {creating ? (
        <div className={styles.createChoice}>
          <button type="button" className={styles.item} title="Текстовый пост" onClick={() => { setCreating("text"); void textStory(); }}>
            <span className={styles.textRing}>
              <Icon name="FileText" size={22} />
            </span>
            <span className={styles.label}>Текстовый пост</span>
          </button>
          <button type="button" className={styles.item} title="История" onClick={addStory}>
            <span className={styles.ring}>
              <Avatar name={me.name} color={me.avatarColor} image={me.avatarImage} size={44} />
            </span>
            <span className={styles.label}>История</span>
          </button>
          <button type="button" className={styles.item} onClick={() => setCreating(null)}>
            <Icon name="X" size={16} />
          </button>
        </div>
      ) : null}
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (files.length && creating === "media") void pick(files);
        }}
      />
      {groups.map((g, i) =>
        g.user.id === me.id ? null : (
          <button key={g.user.id} type="button" className={styles.item} onClick={() => openStoryViewer(groups, i)}>
            <span className={ring(g)}>
              <Avatar name={g.user.name ?? ""} color={g.user.avatarColor} image={g.user.avatarImage} size={52} />
            </span>
            <span className={styles.label}>{(g.user.name ?? "").split(" ")[0]}</span>
          </button>
        )
      )}
      {editing ? (
        <StoryEditor
          key={editing.file ? editing.file.name + editing.file.lastModified : "text"}
          file={editing.file}
          onDone={(result) => {
            setEditing(null);
            editing.resolve(result);
          }}
        />
      ) : null}
    </div>
  );
}
