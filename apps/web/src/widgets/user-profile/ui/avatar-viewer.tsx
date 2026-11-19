import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { uploadFile } from "@/shared/api";
import { errorText } from "@/shared/lib/error-text";
import { fileToImageDataUrl } from "@/shared/lib/image";
import { isRecordingSupported, type Recording, startRecording } from "@/shared/lib/media/recorder";
import { askConfirm, Avatar, AvatarBackgroundPicker, Button, EmojiAvatarPicker, Icon } from "@/shared/ui";

import { avatarApi, type AvatarEntry } from "../api/profile-api";
import { videoDuration, videoPosterDataUrl } from "../lib/video-poster";

import styles from "./avatar-viewer.module.css";

const MAX_VIDEO_SECONDS = 180;
const EMPTY_AVATARS: readonly unknown[] = [];

type Owner = {
  name: string;
  avatarImage?: string | null;
  avatarEmoji?: string | null;
  avatarImages?: readonly unknown[];
  avatarColor?: string | null;
};
type Props = {
  user: Owner;
  canEdit: boolean;
  /** Сервер вернул обновлённого себя (аватар сменился). */
  onChange: (user: Record<string, unknown>) => void;
  onClose: () => void;
  /** В редакторе открываем историю фото; в профиле — активный смайл. */
  photosFirst?: boolean;
  /** Локальная история аватаров контакта (она не входит в публичный профиль). */
  avatars?: readonly unknown[];
};

const isEntry = (a: unknown): a is AvatarEntry => !!a && typeof a === "object" && typeof (a as AvatarEntry).url === "string";

type DisplayEntry =
  | (AvatarEntry & { id: string; sourceIndex?: number })
  | { id: string; kind: "emoji"; emoji: string; background?: string | null; sourceIndex?: number }
  | { id: string; kind: "initials"; background?: string | null };

function displayEntries(user: Owner, raw: readonly unknown[]): DisplayEntry[] {
  const entries: DisplayEntry[] = [];
  const editableCount = user.avatarImages?.length ?? 0;
  const addImage = (entry: AvatarEntry, sourceIndex?: number) => {
    // Не удаляем одинаковые URL: два файла могут быть одним фото в разном
    // разрешении и каждый должен оставаться удаляемым по своему индексу.
    entries.push({ ...entry, id: `${sourceIndex === undefined ? "current" : "gallery"}:${sourceIndex ?? entry.url}:${entry.url}`, sourceIndex });
  };
  // Контактная аватарка и профильная аватарка — независимые источники. Раньше
  // ранний return для emoji скрывал и личное фото, и всю историю profile avatarImages.
  const hasStoredEmoji = raw.some((value) => !!value && typeof value === "object" && (value as { kind?: unknown }).kind === "emoji");
  if (user.avatarEmoji && !hasStoredEmoji) entries.push({ id: `emoji:${user.avatarEmoji}`, kind: "emoji", emoji: user.avatarEmoji, background: user.avatarColor });
  // avatarImages — канонический список сервера, где первая запись является главной.
  // Не добавляем avatarImage раньше списка: иначе дедупликация съедала индекс 0,
  // и после удаления любой фотографии следующая оставалась без кнопки «Удалить».
  // Для основной фотографии сервер хранит в avatarImage именно poster, а не URL
  // исходного файла. Учитываем оба варианта, иначе главная фотография дублируется
  // без sourceIndex и у неё пропадает действие удаления.
  const hasCurrentInGallery = !!user.avatarImage && raw.some((value) => {
    if (isEntry(value)) return value.url === user.avatarImage || value.poster === user.avatarImage;
    if (typeof value !== "string") return false;
    return value === user.avatarImage || value === `video:${user.avatarImage}`;
  });
  if (user.avatarImage && !hasCurrentInGallery) {
    addImage({ url: user.avatarImage, kind: user.avatarImage.startsWith("video:") ? "video" : "image", poster: user.avatarImage.startsWith("video:") ? user.avatarImage.slice(6) : user.avatarImage });
  }
  raw.forEach((value, sourceIndex) => {
    if (isEntry(value)) {
      if (value.kind === "emoji" && typeof value.emoji === "string") entries.push({ id: `emoji:${value.emoji}:${sourceIndex}`, kind: "emoji", emoji: value.emoji, background: value.background ?? user.avatarColor, sourceIndex: sourceIndex < editableCount ? sourceIndex : undefined });
      else addImage(value, sourceIndex < editableCount ? sourceIndex : undefined);
    }
    else if (typeof value === "string" && value) {
      if (value.startsWith("emoji:")) entries.push({ id: `emoji:${value.slice(6)}:${sourceIndex}`, kind: "emoji", emoji: value.slice(6), background: user.avatarColor, sourceIndex: sourceIndex < editableCount ? sourceIndex : undefined });
      else {
        const video = value.startsWith("video:");
        const url = video ? value.slice(6) : value;
        addImage({ url, kind: video ? "video" : "image", poster: video ? url : url }, sourceIndex);
      }
    }
  });
  return entries.length ? entries : [{ id: "initials", kind: "initials", background: user.avatarColor }];
}

/**
 * Аватары с листанием — как public/js/components/avatarViewer.js: стрелки, свайп, точки,
 * нажатие на половину фото; себе — добавить фото или видео, сделать основной, удалить.
 */
export function AvatarViewer({ user, canEdit, onChange, onClose, photosFirst = false, avatars: contactAvatars = EMPTY_AVATARS }: Props) {
  const [avatars, setAvatars] = useState<DisplayEntry[]>(() => displayEntries(user, [...(user.avatarImages ?? []), ...contactAvatars]));
  const initialEntries = displayEntries(user, [...(user.avatarImages ?? []), ...contactAvatars]);
  const [index, setIndex] = useState(() => photosFirst ? Math.max(0, initialEntries.findIndex((entry) => "url" in entry)) : 0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mediaFailure, setMediaFailure] = useState<{ id: string; attempt: number; failed: boolean } | null>(null);
  const [mediaFallback, setMediaFallback] = useState<string | null>(null);
  const [emojiPicker, setEmojiPicker] = useState(false);
  const [backgroundPicker, setBackgroundPicker] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  // «Записать видео» — видеоаватар с камеры, квадратом (startVideo в avatarViewer.js).
  const [recording, setRecording] = useState<Recording | null>(null);
  const [recordSec, setRecordSec] = useState(0);
  const preview = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (!recording) return;
    const started = Date.now();
    const t = setInterval(() => setRecordSec(Math.floor((Date.now() - started) / 1000)), 500);
    return () => clearInterval(t);
  }, [recording]);
  useEffect(() => {
    const v = preview.current;
    if (!v || !recording) return;
    v.srcObject = recording.previewStream ?? recording.stream;
    v.play().catch(() => {});
  }, [recording]);
  // Закрыли окно во время записи — камеру выключаем.
  useEffect(() => () => recording?.cancel(), [recording]);

  const go = (delta: number) => {
    if (avatars.length < 2) return;
    setIndex((i) => (i + delta + avatars.length) % avatars.length);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const apply = (res: { avatars: AvatarEntry[]; user: Record<string, unknown> }, nextIndex?: number) => {
    // Ответ операции уже содержит канонический список. Не смешиваем его со
    // старым user из замыкания — именно из-за этого ранее стикер мог оставаться
    // первым после добавления/удаления фото.
    const first = res.avatars[0];
    const nextUser = { ...user, ...res.user, avatarEmoji: first?.kind === "emoji" ? first.emoji : null, avatarImages: res.avatars, avatarImage: first?.kind === "emoji" ? null : first?.poster ?? null };
    const next = displayEntries(nextUser, res.avatars);
    setAvatars(next);
    setIndex((i) => (nextIndex !== undefined ? nextIndex : Math.min(i, Math.max(0, next.length - 1))));
    onChange(res.user);
  };

  const add = async (file: File, replaceIndex?: number) => {
    setError(null);
    const isVideo = file.type.startsWith("video/");
    setBusy("Загружаем…");
    try {
      const poster = isVideo ? await videoPosterDataUrl(file) : await fileToImageDataUrl(file, 256);
      if (isVideo) {
        const seconds = await videoDuration(file);
        if (Number.isFinite(seconds) && seconds > MAX_VIDEO_SECONDS) {
          throw new Error(`Видео-аватар — не длиннее ${MAX_VIDEO_SECONDS} секунд (у этого ${Math.round(seconds)})`);
        }
      }
      const uploaded = await uploadFile(file, isVideo ? "avatar-video" : "avatar", { onProgress: (p) => setBusy(`Загружаем… ${Math.round(p * 100)}%`) });
      const entry = { url: uploaded.url, kind: isVideo ? "video" : "image", poster } as const;
      apply(await (replaceIndex === undefined ? avatarApi.add(entry) : avatarApi.replace(replaceIndex, entry)), replaceIndex === undefined ? 0 : replaceIndex);
    } catch (err) {
      setError(errorText(err, "Не удалось загрузить"));
    } finally {
      setBusy(null);
    }
  };

  const startVideo = async () => {
    setError(null);
    setRecordSec(0);
    try {
      setRecording(await startRecording("avatar-video"));
    } catch {
      setError("Не удалось включить камеру");
    }
  };

  const stopVideo = async (keep: boolean) => {
    const handle = recording;
    if (!handle) return;
    setRecording(null);
    if (!keep) return handle.cancel();
    handle.stop();
    const res = await handle.result;
    if (!res?.blob) return;
    const type = res.mimeType || "video/webm";
    void add(new File([res.blob], `avatar-${Date.now()}.${type.includes("mp4") ? "mp4" : "webm"}`, { type }));
  };

  const act = async (fn: () => ReturnType<typeof avatarApi.remove>, label: string) => {
    setBusy(label);
    setError(null);
    try {
      apply(await fn());
    } catch (err) {
      setError(errorText(err, "Не удалось"));
    } finally {
      setBusy(null);
    }
  };

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void add(file, current && "sourceIndex" in current ? current.sourceIndex : undefined);
  };

  const pickEmoji = async (emoji: string) => {
    const sourceIndex = current && "sourceIndex" in current ? current.sourceIndex : undefined;
    setEmojiPicker(false);
    setBusy("Сохраняем…");
    setError(null);
    try {
      const result = await (sourceIndex === undefined ? avatarApi.addEmoji(emoji, user.avatarColor) : current.kind === "emoji" ? avatarApi.replaceEmoji(sourceIndex, emoji, current.background) : avatarApi.replaceEmoji(sourceIndex, emoji, user.avatarColor));
      apply(result, sourceIndex ?? 0);
    } catch (err) {
      setError(errorText(err, "Не удалось сохранить смайл"));
    } finally {
      setBusy(null);
    }
  };

  const pickBackground = async (background: string) => {
    const selected = current;
    const emoji = selected.kind === "emoji" ? selected.emoji : user.avatarEmoji;
    if (!emoji) {
      setEmojiPicker(true);
      setError("Сначала выберите смайл, затем его фон");
      return;
    }
    const sourceIndex = selected.kind === "emoji" && "sourceIndex" in selected ? selected.sourceIndex : undefined;
    setBusy("Сохраняем фон…");
    setError(null);
    try {
      const result = sourceIndex === undefined ? await avatarApi.addEmoji(emoji, background) : await avatarApi.replaceEmoji(sourceIndex, emoji, background);
      apply(result, sourceIndex ?? 0);
      setBackgroundPicker(false);
    } catch (err) {
      setError(errorText(err, "Не удалось сохранить фон"));
    } finally {
      setBusy(null);
    }
  };

  const current = avatars[index] ?? avatars[0]!;
  const sourceIndex = "sourceIndex" in current ? current.sourceIndex : undefined;
  const mediaError = mediaFailure?.id === current.id && mediaFailure.failed;
  const mediaAttempt = mediaError ? mediaFailure.attempt : 0;
  const hasDistinctPoster = "poster" in current && !!current.poster && current.poster !== current.url;
  const showPoster = mediaFallback === current.id && hasDistinctPoster;
  const mediaUrl = showPoster ? current.poster! : "url" in current ? current.url : "";
  const handleMediaError = () => {
    if (!showPoster && hasDistinctPoster) {
      setMediaFallback(current.id);
      return;
    }
    setMediaFailure({ id: current.id, attempt: mediaAttempt, failed: true });
  };
  const retryMedia = () => {
    setMediaFallback(null);
    setMediaFailure({ id: current.id, attempt: mediaAttempt + 1, failed: false });
  };
  return createPortal(
    <div
      className={styles.overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.viewer} role="dialog" aria-modal="true" aria-label="Фото профиля">
        <div className={styles.head}>
          <span className={styles.name}>{user.name}</span>
          <button type="button" className={styles.iconButton} title="Закрыть" aria-label="Закрыть" onClick={onClose}>
            <Icon name="X" size={20} />
          </button>
        </div>
        <div
          className={styles.stage}
          onClick={(e) => {
            // Поля вокруг фотографии относятся к затемнённому фону просмотрщика.
            // Закрываем только его и не пропускаем нажатие в профиль под порталом.
            if (e.target === e.currentTarget) {
              e.stopPropagation();
              onClose();
            }
          }}
          onTouchStart={(e) => {
            const t = e.touches[0];
            if (t) touch.current = { x: t.clientX, y: t.clientY };
          }}
          onTouchEnd={(e) => {
            const start = touch.current;
            const t = e.changedTouches[0];
            touch.current = null;
            if (!start || !t) return;
            const dx = t.clientX - start.x;
            const dy = t.clientY - start.y;
            if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
          }}
        >
          {recording ? (
            <video ref={preview} className={styles.media} autoPlay muted playsInline />
          ) : current.kind === "emoji" ? (
            <div className={styles.avatarPreview}>
              <Avatar name={user.name} color={current.background} emoji={current.emoji} size={280} />
            </div>
          ) : current.kind === "initials" ? (
            <div className={styles.avatarPreview}>
              <Avatar name={user.name} color={current.background} size={280} />
            </div>
          ) : current.kind === "video" ? (
            <video key={`${current.url}:${mediaAttempt}`} className={styles.media} src={current.url} poster={current.poster} autoPlay loop muted playsInline controls onError={handleMediaError} />
          ) : (
            <img
              key={`${mediaUrl}:${mediaAttempt}`}
              className={styles.media}
              src={mediaUrl}
              alt={user.name}
              onError={handleMediaError}
              // Как в Telegram: нажатие на левую/правую половину фото листает.
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                go(e.clientX < r.left + r.width / 2 ? -1 : 1);
              }}
            />
          )}
          {mediaError ? (
            <div className={styles.mediaError} role="alert">
              <Icon name="RotateCw" size={26} />
              <span>{navigator.onLine === false ? "Нет подключения к сети" : "Не удалось загрузить медиа"}</span>
              <div className={styles.mediaErrorActions}>
                <button type="button" onClick={retryMedia}>Повторить</button>
                <button type="button" className={styles.barButton} onClick={onClose}>Закрыть</button>
              </div>
            </div>
          ) : null}
          {avatars.length > 1 ? (
            <>
              <button type="button" className={`${styles.nav} ${styles.prev}`} aria-label="Предыдущее" onClick={() => go(-1)}>
                <Icon name="ChevronLeft" size={26} />
              </button>
              <button type="button" className={`${styles.nav} ${styles.next}`} aria-label="Следующее" onClick={() => go(1)}>
                <Icon name="ChevronRight" size={26} />
              </button>
            </>
          ) : null}
        </div>
        {avatars.length > 1 ? (
          <div className={styles.dots}>
            {avatars.map((a, i) => (
              <button
                key={a.id}
                type="button"
                className={i === index ? `${styles.dot} ${styles.dotActive}` : styles.dot}
                title={`${i + 1} из ${avatars.length}`}
                aria-label={`${i + 1} из ${avatars.length}`}
                onClick={() => setIndex(i)}
              />
            ))}
          </div>
        ) : null}
        {error ? <p className={styles.error}>{error}</p> : null}
        <div className={styles.bar}>
          {recording ? (
            <>
              <p className={styles.muted}>{`Запись… ${String(Math.floor(recordSec / 60)).padStart(2, "0")}:${String(recordSec % 60).padStart(2, "0")}`}</p>
              <Button onClick={() => void stopVideo(true)}>Готово</Button>
              <button type="button" className={styles.barButton} onClick={() => void stopVideo(false)}>
                Отмена
              </button>
            </>
          ) : busy ? (
            <p className={styles.muted}>{busy}</p>
          ) : canEdit ? (
            <>
              <Button onClick={() => fileInput.current?.click()}>{current && "sourceIndex" in current ? "Заменить фото" : "Добавить фото или видео"}</Button>
              <button type="button" className={styles.barButton} onClick={() => setEmojiPicker((open) => !open)}>
                {current?.kind === "emoji" ? "Заменить смайл" : "Добавить смайл"}
              </button>
              <button type="button" className={styles.barButton} onClick={() => setBackgroundPicker((open) => !open)}>
                Фон смайла
              </button>
              {isRecordingSupported() ? (
                <button type="button" className={styles.barButton} onClick={() => void startVideo()}>
                  Записать видео
                </button>
              ) : null}
              {sourceIndex !== undefined && sourceIndex !== 0 ? (
                <button type="button" className={styles.barButton} onClick={() => void act(() => avatarApi.setMain(sourceIndex), "Сохраняем…")}>
                  Сделать основной
                </button>
              ) : null}
              {sourceIndex !== undefined || current.kind === "emoji" ? (
                <button
                  type="button"
                  className={`${styles.barButton} ${styles.barDanger}`}
                  onClick={() =>
                    void askConfirm("Удалить эту аватарку?").then((ok) => {
                      if (ok) void act(() => sourceIndex === undefined ? avatarApi.removeLegacyEmoji() : avatarApi.remove(sourceIndex), "Удаляем…");
                    })
                  }
                >
                  Удалить
                </button>
              ) : null}
            </>
          ) : null}
        </div>
        {backgroundPicker ? <AvatarBackgroundPicker color={current.kind === "emoji" ? current.background : user.avatarColor} onPick={(background) => void pickBackground(background)} /> : null}
        {emojiPicker ? <EmojiAvatarPicker withStickers onPick={(emoji) => void pickEmoji(emoji)} /> : null}
        <input ref={fileInput} className={styles.hidden} type="file" accept="image/*,video/*" onChange={onFile} />
      </div>
    </div>,
    document.body
  );
}
