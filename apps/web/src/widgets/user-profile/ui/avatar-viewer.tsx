import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { uploadFile } from "@/shared/api";
import { errorText } from "@/shared/lib/error-text";
import { fileToImageDataUrl } from "@/shared/lib/image";
import { isRecordingSupported, type Recording, startRecording } from "@/shared/lib/media/recorder";
import { askConfirm, Button, Icon } from "@/shared/ui";

import { avatarApi,type AvatarEntry } from "../api/profile-api";
import { videoDuration, videoPosterDataUrl } from "../lib/video-poster";

import styles from "./avatar-viewer.module.css";

const MAX_VIDEO_SECONDS = 180;

type Owner = { name: string; avatarImage?: string | null; avatarImages?: readonly unknown[] };
type Props = {
  user: Owner;
  canEdit: boolean;
  /** Сервер вернул обновлённого себя (аватар сменился). */
  onChange: (user: Record<string, unknown>) => void;
  onClose: () => void;
};

const isEntry = (a: unknown): a is AvatarEntry => !!a && typeof a === "object" && typeof (a as AvatarEntry).url === "string";

/**
 * Аватары с листанием — как public/js/components/avatarViewer.js: стрелки, свайп, точки,
 * нажатие на половину фото; себе — добавить фото или видео, сделать основной, удалить.
 */
export function AvatarViewer({ user, canEdit, onChange, onClose }: Props) {
  const [avatars, setAvatars] = useState<AvatarEntry[]>(() => {
    const list = (user.avatarImages ?? []).filter(isEntry);
    return list.length || !user.avatarImage ? list : [{ url: user.avatarImage, kind: "image", poster: user.avatarImage }];
  });
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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
    setAvatars(res.avatars);
    setIndex((i) => (nextIndex !== undefined ? nextIndex : Math.min(i, Math.max(0, res.avatars.length - 1))));
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

  const current = avatars[index];
  return createPortal(
    <div
      className={styles.overlay}
      onPointerDown={(e) => {
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
          ) : !current ? (
            <p className={styles.muted}>{canEdit ? "Фото профиля пока нет" : "Нет фото профиля"}</p>
          ) : current.kind === "video" ? (
            <video key={current.url} className={styles.media} src={current.url} poster={current.poster} autoPlay loop muted playsInline controls />
          ) : (
            <img
              className={styles.media}
              src={current.url}
              alt={user.name}
              // Как в Telegram: нажатие на левую/правую половину фото листает.
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                go(e.clientX < r.left + r.width / 2 ? -1 : 1);
              }}
            />
          )}
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
                key={a.url}
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
              {avatars.length > 1 && index !== 0 ? (
                <button type="button" className={styles.barButton} onClick={() => void act(() => avatarApi.setMain(index), "Сохраняем…")}>
                  Сделать основной
                </button>
              ) : null}
              {avatars.length ? (
                <button
                  type="button"
                  className={`${styles.barButton} ${styles.barDanger}`}
                  onClick={() =>
                    void askConfirm("Удалить эту аватарку?").then((ok) => {
                      if (ok) void act(() => avatarApi.remove(index), "Удаляем…");
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
