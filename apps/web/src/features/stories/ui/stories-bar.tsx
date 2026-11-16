import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import type { SelfUser } from "@/entities/session";
import { hasUnseen, openStoryViewer, storyApi, type StoryGroup, storyQueries } from "@/entities/story";

import { useWsEvent } from "@/shared/api";
import { errorText } from "@/shared/lib/error-text";
import { plural } from "@/shared/lib/presence";
import { askText, Avatar, Icon, toast } from "@/shared/ui";

import { postStory, postTextStory } from "../model/post-story";

import styles from "./stories-bar.module.css";
import { StoryEditor } from "./story-editor";

const NO_GROUPS: StoryGroup[] = [];

/** Полоса историй над списком чатов — как StoriesBar в public/js/components/storiesBar.js. */
export function StoriesBar({ me }: { me: SelfUser }) {
  const queryClient = useQueryClient();
  const groups = useQuery(storyQueries.feed()).data?.groups ?? NO_GROUPS;
  const fileRef = useRef<HTMLInputElement>(null);
  const publishingRef = useRef(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ file: File | null; resolve: (f: { file: File; sound?: File } | null) => void } | null>(null);
  const [creating, setCreating] = useState<"media" | null>(null);
  /** Выбранные файлы для одной истории — можно добавить ещё фото/видео перед публикацией. */
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const refetch = () => void queryClient.invalidateQueries({ queryKey: storyQueries.baseKey });
  useWsEvent("story:new", refetch);
  // Видео истории обработано (H.264 1080p) — подтягиваем, чтобы играла обработанная версия.
  useWsEvent("story:updated", refetch);
  useWsEvent("story:deleted", refetch);
  useWsEvent("ws:reconnected", refetch);

  const pick = async (files: File[]) => {
    setSelectedFiles((prev) => [...prev, ...files]);
    setProgress(null);
    setCreating(null);
  };

  const previewUrls = useMemo(() => selectedFiles.map((file) => URL.createObjectURL(file)), [selectedFiles]);
  useEffect(() => () => previewUrls.forEach((url) => URL.revokeObjectURL(url)), [previewUrls]);

  /** Опубликовать все выбранные файлы одной историей. */
  const publish = async () => {
    // Двойной тап на телефоне раньше запускал два postStory одновременно. Второй
    // вызов перезаписывал resolve открытого редактора, первый навсегда оставался
    // ждать и после «Готово» снова открывал редактор вместо публикации.
    if (!selectedFiles.length || publishingRef.current) return;
    publishingRef.current = true;
    try {
      setProgress("Загружаем историю…");
      const posted = await postStory(selectedFiles, {
        edit: (file) => new Promise((resolve) => setEditing({ file, resolve })),
        progress: setProgress,
      });
      if (posted) await queryClient.invalidateQueries({ queryKey: storyQueries.baseKey });
    } catch (err) {
      toast(errorText(err, "Не удалось выложить историю"), { error: true });
    } finally {
      publishingRef.current = false;
      setProgress(null);
      setSelectedFiles([]);
    }
  };

  const addMore = () => {
    fileRef.current?.click();
  };

  const removeFile = (index: number) => {
    setSelectedFiles(selectedFiles.filter((_, i) => i !== index));
  };

  // «Текст» — пустой белый холст в редакторе; готовая картинка уходит как фото-история.
  const textStory = async () => {
    const result = await new Promise<{ file: File; sound?: File } | null>((resolve) => setEditing({ file: null, resolve }));
    if (!result) return;
    try {
      setProgress("Загружаем историю…");
      await postTextStory(result.file, result.sound);
      await queryClient.invalidateQueries({ queryKey: storyQueries.baseKey });
    } catch (err) {
      toast(errorText(err, "Не удалось выложить историю"), { error: true });
    } finally {
      setProgress(null);
    }
  };

  const attachmentStory = async (kind: "poll" | "checklist" | "contact" | "location" | "game" | "dice") => {
    const titleLabel = kind === "poll" ? "Вопрос опроса" : kind === "checklist" ? "Название чек-листа" : kind === "contact" ? "Имя контакта" : kind === "location" ? "Название места" : kind === "game" ? "Название игры" : "Название броска";
    const title = await askText(titleLabel, { placeholder: "Введите название", okLabel: kind === "poll" || kind === "checklist" ? "Дальше" : "Опубликовать" });
    if (!title?.trim()) return;
    if (!["poll", "checklist"].includes(kind)) {
      const details = await askText(kind === "contact" ? "Телефон или ник контакта" : kind === "location" ? "Адрес или координаты" : "Описание", { placeholder: "Можно оставить пустым", okLabel: "Опубликовать" });
      try {
        setProgress("Публикуем историю…");
        await storyApi.post([{ kind, meta: { title: title.trim(), text: details?.trim() ?? "" } }]);
        await queryClient.invalidateQueries({ queryKey: storyQueries.baseKey });
      } catch (err) {
        toast(errorText(err, "Не удалось выложить историю"), { error: true });
      } finally {
        setProgress(null);
        setCreating(null);
      }
      return;
    }
    const raw = await askText(kind === "poll" ? "Варианты ответа через запятую" : "Пункты через запятую", { placeholder: kind === "poll" ? "Море, горы, город" : "Позвонить, купить продукты", okLabel: "Опубликовать" });
    const values = (raw ?? "").split(",").map((v) => v.trim()).filter(Boolean).slice(0, 10);
    if (values.length < 2) {
      toast(kind === "poll" ? "Добавьте минимум два варианта" : "Добавьте минимум два пункта", { error: true });
      return;
    }
    try {
      setProgress("Публикуем историю…");
      await storyApi.post([{ kind, meta: kind === "poll" ? { question: title.trim(), options: values, votes: values.map(() => 0) } : { title: title.trim(), items: values.map((text) => ({ text, done: false })) } }]);
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
        <Avatar name={me.name} color={me.avatarColor} image={me.avatarImage} emoji={me.avatarEmoji} size={52} />
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
        <Avatar name={me.name} color={me.avatarColor} image={me.avatarImage} emoji={me.avatarEmoji} size={52} />
        <span className={styles.addBadge} title="Выложить историю" onClick={(e) => { e.stopPropagation(); openCreate(); }}>
          <Icon name="Plus" size={12} />
        </span>
      </span>
      <span className={styles.label}>Выложить историю</span>
    </button>
  );

  return (
    <div className={styles.bar}>
      {postItem}
      {ownItem}
      {creating ? (
        <div className={styles.createChoice}>
          <button type="button" className={styles.createAction} title="Статья" onClick={() => void textStory()}>
            <Icon name="FileText" size={18} /> Статья
          </button>
          <button type="button" className={styles.createAction} title="История" onClick={addStory}>
            <Icon name="Image" size={18} /> История
          </button>
          <button type="button" className={styles.createAction} title="Опрос" onClick={() => void attachmentStory("poll")}>
            <Icon name="BarChart" size={18} /> Опрос
          </button>
          <button type="button" className={styles.createAction} title="Чек-лист" onClick={() => void attachmentStory("checklist")}>
            <Icon name="CheckCheck" size={18} /> Чек-лист
          </button>
          <button type="button" className={styles.createAction} title="Контакт" onClick={() => void attachmentStory("contact")}>
            <Icon name="User" size={18} /> Контакт
          </button>
          <button type="button" className={styles.createAction} title="Геопозиция" onClick={() => void attachmentStory("location")}>
            <Icon name="MapPin" size={18} /> Место
          </button>
          <button type="button" className={styles.createAction} title="Игра" onClick={() => void attachmentStory("game")}>
            <Icon name="Zap" size={18} /> Игра
          </button>
          <button type="button" className={styles.createAction} title="Кубик" onClick={() => void attachmentStory("dice")}>
            <Icon name="Star" size={18} /> Кубик
          </button>
          <button type="button" className={styles.createClose} aria-label="Закрыть" onClick={() => setCreating(null)}><Icon name="X" size={16} /></button>
        </div>
      ) : null}
      {selectedFiles.length > 0 ? (
        <div className={styles.mediaSelection}>
          <div className={styles.mediaSelectionTitle}>Выбрано {selectedFiles.length} {plural(selectedFiles.length, "файл", "файла", "файлов")}</div>
          <div className={styles.mediaSelectionGrid}>
            {selectedFiles.map((file, i) => {
              const url = previewUrls[i]!;
              return (
                <div key={i} className={styles.mediaSelectionItem}>
                  <span className={styles.mediaSelectionKind}>{file.type.startsWith("video/") ? "Видео" : "Фото"}</span>
                  {file.type.startsWith("video/") ? (
                    <video src={url} className={styles.mediaSelectionThumb} muted playsInline preload="metadata" />
                  ) : (
                    <img src={url} alt="" className={styles.mediaSelectionThumb} />
                  )}
                  <button type="button" className={styles.mediaSelectionRemove} title="Удалить" onClick={() => void removeFile(i)}>
                    <Icon name="X" size={12} />
                  </button>
                </div>
              );
            })}
            <button type="button" className={styles.mediaSelectionAdd} onClick={addMore} aria-label="Добавить фото или видео">
              <Icon name="Plus" size={14} />
              Ещё фото/видео
            </button>
          </div>
          <div className={styles.mediaSelectionActions}>
            <button type="button" className={styles.mediaSelectionCancel} onClick={() => setSelectedFiles([])}>
              Отмена
            </button>
            <button type="button" className={styles.mediaSelectionPublish} disabled={progress !== null} onClick={publish}>
              {progress ?? "Опубликовать историю"}
            </button>
          </div>
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
          if (files.length) void pick(files);
        }}
      />
      {groups.map((g, i) =>
        g.user.id === me.id ? null : (
          <button key={g.user.id} type="button" className={styles.item} onClick={() => openStoryViewer(groups, i)}>
            <span className={ring(g)}>
              <Avatar name={g.user.name ?? ""} color={g.user.avatarColor} image={g.user.avatarImage} emoji={g.user.avatarEmoji} size={52} />
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
