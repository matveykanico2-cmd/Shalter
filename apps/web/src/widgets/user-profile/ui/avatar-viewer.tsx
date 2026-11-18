import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { uploadFile } from "@/shared/api";
import { errorText } from "@/shared/lib/error-text";
import { fileToImageDataUrl } from "@/shared/lib/image";
import { isRecordingSupported, type Recording, startRecording } from "@/shared/lib/media/recorder";
import { askConfirm, Avatar, Button, Icon } from "@/shared/ui";

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
  | { id: string; kind: "emoji"; emoji: string; background?: string | null }
  | { id: string; kind: "initials"; background?: string | null };

function displayEntries(user: Owner, raw: readonly unknown[]): DisplayEntry[] {
  const entries: DisplayEntry[] = [];
  const seen = new Set<string>();
  const addImage = (entry: AvatarEntry, sourceIndex?: number) => {
    const key = `${entry.kind}:${entry.url}`;
    if (seen.has(key)) return;
    seen.add(key);
    entries.push({ ...entry, id: `${sourceIndex === undefined ? "current" : "gallery"}:${sourceIndex ?? entry.url}:${entry.url}`, sourceIndex });
  };
  // Контактная аватарка и профильная аватарка — независимые источники. Раньше
  // ранний return для emoji скрывал и личное фото, и всю историю profile avatarImages.
  if (user.avatarEmoji) entries.push({ id: `emoji:${user.avatarEmoji}`, kind: "emoji", emoji: user.avatarEmoji, background: user.avatarColor });
  if (user.avatarImage) addImage({ url: user.avatarImage, kind: user.avatarImage.startsWith("video:") ? "video" : "image", poster: user.avatarImage.startsWith("video:") ? user.avatarImage.slice(6) : user.avatarImage });
  raw.forEach((value, sourceIndex) => {
    if (isEntry(value)) addImage(value, sourceIndex);
    else if (typeof value === "string" && value) {
      if (value.startsWith("emoji:")) entries.push({ id: `emoji:${value.slice(6)}:${sourceIndex}`, kind: "emoji", emoji: value.slice(6), background: user.avatarColor });
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
    const next = displayEntries({ ...user, ...res.user }, res.avatars);
    setAvatars(next);
    setIndex((i) => (nextIndex !== undefined ? nextIndex : Math.min(i, Math.max(0, next.length - 1))));
    onChange(res.user);
  };

  const add = async (file: File) => {
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
      apply(await avatarApi.add({ url: uploaded.url, kind: isVideo ? "video" : "image", poster }), 0);
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
    if (file) void add(file);
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
              <Button onClick={() => fileInput.current?.click()}>Добавить фото или видео</Button>
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
              {sourceIndex !== undefined ? (
                <button
                  type="button"
                  className={`${styles.barButton} ${styles.barDanger}`}
                  onClick={() =>
                    void askConfirm("Удалить эту аватарку?").then((ok) => {
                      if (ok) void act(() => avatarApi.remove(sourceIndex), "Удаляем…");
                    })
                  }
                >
                  Удалить
                </button>
              ) : null}
            </>
          ) : null}
        </div>
        <input ref={fileInput} className={styles.hidden} type="file" accept="image/*,video/*" onChange={onFile} />
      </div>
    </div>,
    document.body
  );
}
