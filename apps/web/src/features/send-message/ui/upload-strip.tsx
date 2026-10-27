import { Icon } from "@/shared/ui";

import type { UploadTile } from "../model/use-uploads";

import styles from "./composer.module.css";

const R = 16;
const C = 2 * Math.PI * R;

/** Загружаемые файлы над полем ввода: превью, кольцо прогресса, отмена. */
export function UploadStrip({ tiles, onCancel }: { tiles: readonly UploadTile[]; onCancel: (id: number) => void }) {
  if (!tiles.length) return null;
  return (
    <div className={styles.uploads} role="list" aria-label="Загрузка файлов">
      {tiles.map((t) => (
        <div key={t.id} className={t.failed ? `${styles.uploadTile} ${styles.uploadFailed}` : styles.uploadTile} role="listitem" title={t.name}>
          <span className={styles.uploadPreview} style={t.previewUrl ? { backgroundImage: `url("${t.previewUrl}")` } : undefined}>
            {t.previewUrl ? null : <Icon name={t.kind === "video" ? "Video" : t.kind === "image" ? "Image" : "File"} size={20} />}
          </span>
          <svg className={styles.uploadRing} viewBox="0 0 40 40" aria-label={`Загружено ${Math.round(t.progress * 100)}%`}>
            <circle cx="20" cy="20" r={R} className={styles.uploadRingTrack} />
            <circle cx="20" cy="20" r={R} className={styles.uploadRingFill} strokeDasharray={C} strokeDashoffset={C * (1 - t.progress)} />
          </svg>
          <button type="button" className={styles.uploadCancel} title="Отменить" onClick={() => onCancel(t.id)}>
            <Icon name="X" size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
