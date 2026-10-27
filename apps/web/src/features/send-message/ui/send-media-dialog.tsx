import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { plural } from "@/shared/lib/presence";
import { askText, Icon, Menu, type MenuItem } from "@/shared/ui";

import { fileKind, fileSizeLabel } from "../lib/files";
import type { Pick } from "../model/use-uploads";

import styles from "./send-media-dialog.module.css";

/** paidStars — платный пост: фото и видео откроют за столько звёзд (0 — бесплатно). */
export type MediaSendChoice = { picks: Pick[]; spoiler: boolean; paidStars: number };

type Props = {
  files: readonly File[];
  /** Можно «Размыть за звёзды» (не Избранное, не секретный, в канале — админ). */
  allowPaid?: boolean;
  onSend: (choice: MediaSendChoice) => void;
  onClose: () => void;
};

const MAX_PAID_STARS = 10_000;

/**
 * Окно отправки вложений — как public/js/components/mediaSendPopup.js (tweb popups/newMedia):
 * фото и видео альбомом, остальное списком; «Отправить без сжатия» и спойлер в «Ещё».
 * Подпись — текст из поля ввода.
 */
export function SendMediaDialog({ files: initial, allowPaid = false, onSend, onClose }: Props) {
  const [files, setFiles] = useState(() => [...initial]);
  const [asFiles, setAsFiles] = useState(false);
  const [spoiler, setSpoiler] = useState(false);
  const [paidStars, setPaidStars] = useState(0);
  const askPaidPrice = async () => {
    const raw = await askText("Сколько звёзд стоит открыть фото и видео?", { initial: paidStars ? String(paidStars) : "25", okLabel: "Готово" });
    if (raw === null) return;
    const n = Math.floor(Number(raw.replace(/\s+/g, "")));
    const stars = Number.isFinite(n) && n > 0 ? Math.min(n, MAX_PAID_STARS) : 0;
    setPaidStars(stars);
    if (stars) setSpoiler(false);
  };
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);


  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !menuAt) {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose, menuAt]);

  const isMedia = (f: File) => !asFiles && (f.type.startsWith("image/") || f.type.startsWith("video/"));
  const media = files.filter(isMedia);
  const docs = files.filter((f) => !isMedia(f));
  const compressible = initial.some((f) => f.type.startsWith("image/") || f.type.startsWith("video/"));

  const remove = (f: File) => {
    const next = files.filter((x) => x !== f);
    if (!next.length) onClose();
    else setFiles(next);
  };
  const send = () => {
    if (!files.length) return;
    // «Без сжатия» — файлом: фото и видео уходят как есть, без превью и пережатия.
    onSend({ picks: files.map((file) => ({ file, kind: asFiles ? "file" : fileKind(file) })), spoiler: !asFiles && spoiler, paidStars: asFiles ? 0 : paidStars });
  };

  const moreItems: MenuItem[] = [
    asFiles
      ? { icon: "Image", label: "Отправить сжатым", onClick: () => setAsFiles(false) }
      : {
          icon: "File",
          label: "Отправить без сжатия",
          onClick: () => {
            setAsFiles(true);
            setPaidStars(0);
          },
        },
    ...(!asFiles
      ? [
          {
            icon: spoiler ? ("Eye" as const) : ("EyeOff" as const),
            label: spoiler ? "Убрать размытие" : "Скрыть под спойлер",
            onClick: () => {
              setSpoiler((v) => !v);
              setPaidStars(0);
            },
          },
        ]
      : []),
    ...(allowPaid && !asFiles ? [{ icon: "Star" as const, label: paidStars ? "Изменить цену" : "Размыть за звёзды ⭐", onClick: () => void askPaidPrice() }] : []),
  ];

  return createPortal(
    <div
      className={styles.overlay}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-label={title(files, isMedia)}>
        <div className={styles.header}>
          <button type="button" className={styles.iconButton} title="Закрыть" onClick={onClose}>
            <Icon name="X" size={22} />
          </button>
          <h2 className={styles.title}>{title(files, isMedia)}</h2>
          {compressible ? (
            <button type="button" className={styles.iconButton} title="Ещё" onClick={(e) => setMenuAt({ x: e.clientX - 200, y: e.clientY + 8 })}>
              <Icon name="More" size={22} />
            </button>
          ) : null}
        </div>
        <div className={(spoiler || paidStars) && !asFiles ? `${styles.preview} ${styles.blurred}` : styles.preview}>
          {media.length ? (
            <div className={[styles.album, styles[`count${Math.min(media.length, 4)}`], media.length > 4 ? styles.many : ""].filter(Boolean).join(" ")}>
              {media.map((f, i) => (
                <div key={i} className={styles.media}>
                  <FilePreview file={f} as={f.type.startsWith("video/") ? "video" : "img"} />
                  {f.type.startsWith("video/") ? (
                    <span className={styles.videoBadge}>
                      <Icon name="PlayFill" size={14} />
                    </span>
                  ) : null}
                  <RemoveButton onClick={() => remove(f)} />
                </div>
              ))}
            </div>
          ) : null}
          {docs.length ? (
            <div className={styles.docs}>
              {docs.map((f, i) => (
                <div key={i} className={styles.doc}>
                  {f.type.startsWith("image/") ? (
                    <FilePreview file={f} as="thumb" className={styles.docThumb} />
                  ) : (
                    <span className={styles.docIcon}>{f.type.startsWith("audio/") ? <Icon name="PlayFill" size={22} /> : (f.name.split(".").pop() || "file").slice(0, 4).toUpperCase()}</span>
                  )}
                  <span className={styles.docBody}>
                    <span className={styles.docName}>{f.name}</span>
                    <span className={styles.docSize}>{fileSizeLabel(f.size)}</span>
                  </span>
                  <RemoveButton onClick={() => remove(f)} />
                </div>
              ))}
            </div>
          ) : null}
        </div>
        {(spoiler || paidStars) && !asFiles ? (
          <div className={styles.notice}>
            <span>{paidStars ? `⭐ Фото и видео откроют за ${paidStars} звёзд` : "🫥 Фото и видео будут размыты — откроются по нажатию"}</span>
            <button
              type="button"
              onClick={() => {
                setSpoiler(false);
                setPaidStars(0);
              }}
            >
              Убрать
            </button>
          </div>
        ) : null}
        <div className={styles.footer}>
          <button type="button" className={styles.send} title="Отправить" aria-label="Отправить" autoFocus onClick={send}>
            <Icon name="Send" size={22} />
          </button>
        </div>
      </div>
      {menuAt ? <Menu at={menuAt} items={moreItems} onClose={() => setMenuAt(null)} /> : null}
    </div>,
    document.body
  );
}

/**
 * Превью выбранного файла: адрес blob: создаёт и отзывает сам элемент — в StrictMode
 * эффект проходит дважды, и общий список адресов отзывался бы, пока они ещё на экране.
 */
function FilePreview({ file, as, className }: { file: File; as: "img" | "video" | "thumb"; className?: string }) {
  const ref = useRef<HTMLImageElement & HTMLVideoElement & HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const url = URL.createObjectURL(file);
    if (as === "thumb") el.style.backgroundImage = `url("${url}")`;
    else el.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file, as]);
  if (as === "video") return <video ref={ref} muted playsInline preload="metadata" />;
  if (as === "img") return <img ref={ref} alt="" />;
  return <span ref={ref} className={className} />;
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className={styles.remove}
      title="Убрать"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <Icon name="X" size={16} />
    </button>
  );
}

function title(files: readonly File[], isMedia: (f: File) => boolean) {
  const n = files.length;
  if (!n) return "Нечего отправлять";
  if (files.every(isMedia)) {
    const photos = files.filter((f) => f.type.startsWith("image/")).length;
    const videos = n - photos;
    if (!videos) return n === 1 ? "Отправить фото" : `Отправить ${n} фото`;
    if (!photos) return n === 1 ? "Отправить видео" : `Отправить ${n} видео`;
    return `Отправить ${n} ${plural(n, "медиафайл", "медиафайла", "медиафайлов")}`;
  }
  if (files.every((f) => f.type.startsWith("audio/"))) return n === 1 ? "Отправить аудио" : `Отправить ${n} аудио`;
  return n === 1 ? "Отправить файл" : `Отправить ${n} ${plural(n, "файл", "файла", "файлов")}`;
}
