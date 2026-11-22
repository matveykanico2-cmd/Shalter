import type { CSSProperties } from "react";

import { Icon } from "@/shared/ui";

import type { UploadTile } from "../model/use-uploads";

import styles from "./composer.module.css";

/** Загружаемые файлы над полем ввода: превью, кольцо прогресса, отмена. */
export function UploadStrip({ tiles, onCancel, onTogglePause }: { tiles: readonly UploadTile[]; onCancel: (id: number) => void; onTogglePause: (id: number) => void }) {
  if (!tiles.length) return null;
  return (
    <div className={styles.uploads} role="list" aria-label="Загрузка файлов">
      {tiles.map((t) => (
        <div key={t.id} className={t.failed ? `${styles.uploadTile} ${styles.uploadFailed}` : styles.uploadTile} role="listitem" title={t.name}>
          <span className={styles.uploadPreview}>
            {/* Не декодируем каждый ролик в фоне: на Android это подвешивало composer.
                После отправки нормальное превью отдаёт сервер в сообщении. */}
            {t.previewUrl && t.kind === "video" ? <Icon name="Video" size={20} /> : null}
            {t.previewUrl && t.kind !== "video" ? <span className={styles.uploadImagePreview} style={{ backgroundImage: `url("${t.previewUrl}")` }} /> : null}
            {!t.previewUrl ? <Icon name={t.kind === "video" ? "Video" : t.kind === "image" ? "Image" : "File"} size={20} /> : null}
          </span>
          <button
            type="button"
            className={styles.uploadControl}
            style={{ "--upload-progress": `${Math.round(t.progress * 100)}%` } as CSSProperties}
            title={t.phase === "paused" ? "Продолжить" : "Поставить на паузу"}
            aria-label={t.phase === "paused" ? `Продолжить загрузку ${t.name}` : `Поставить загрузку ${t.name} на паузу`}
            onClick={() => onTogglePause(t.id)}
          >
            <Icon name={t.phase === "paused" ? "PlayFill" : "PauseFill"} size={15} />
          </button>
          <span className={styles.uploadMeta}>{t.phase === "processing" ? "Обработка" : t.phase === "paused" ? "Пауза" : `${Math.round(t.progress * 100)}%`}</span>
          <button type="button" className={styles.uploadCancel} title="Отменить" onClick={() => onCancel(t.id)}>
            <Icon name="X" size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
