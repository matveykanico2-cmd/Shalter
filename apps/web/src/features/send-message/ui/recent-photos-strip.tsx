import { useEffect, useState } from "react";

import { loadRecentPhotos, readRecentPhoto, type RecentPhoto, thumbSrc } from "../lib/recent-photos";

import styles from "./composer.module.css";

type Props = {
  /** Выбранные фото — File в порядке выбора, тем же путём, что и «Галерея». */
  onSend: (files: File[]) => void;
};

/** Лента последних фото галереи в шторке скрепки: тап выбирает (номер — порядок), «Отправить (N)». */
export function RecentPhotosStrip({ onSend }: Props) {
  const [photos, setPhotos] = useState<RecentPhoto[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [denied, setDenied] = useState(false);

  useEffect(() => {
    let alive = true;
    void loadRecentPhotos().then((res) => {
      if (!alive) return;
      setPhotos(res.photos);
      setDenied(res.denied);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Отказ запоминается — без нажатия система больше не спрашивает.
  const allow = async () => {
    const res = await loadRecentPhotos(30, true);
    setPhotos(res.photos);
    setDenied(res.denied);
  };

  if (!photos.length) {
    return denied ? (
      <div className={styles.recentPhotos}>
        <button type="button" className={styles.recentPhotosSend} onClick={() => void allow()}>
          Разрешить доступ к фото
        </button>
      </div>
    ) : null;
  }

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const send = async () => {
    setBusy(true);
    setError("");
    try {
      const byId = new Map(photos.map((p) => [p.id, p]));
      // По одному: несколько больших снимков разом не поместились бы в память.
      const files: File[] = [];
      for (const id of picked) files.push(await readRecentPhoto(byId.get(id)!));
      onSend(files);
    } catch {
      setError("Не удалось открыть фото");
      setBusy(false);
    }
  };

  return (
    <div className={styles.recentPhotos}>
      <div className={styles.recentPhotosRow} role="group" aria-label="Последние фото">
        {photos.map((photo, i) => {
          const n = picked.indexOf(photo.id) + 1;
          return (
            <button
              key={photo.id}
              type="button"
              className={n ? `${styles.recentPhoto} ${styles.recentPhotoPicked}` : styles.recentPhoto}
              aria-pressed={n > 0}
              aria-label={`Фото ${i + 1}`}
              onClick={() => toggle(photo.id)}
            >
              <img src={thumbSrc(photo)} alt="" draggable={false} />
              <span className={styles.recentPhotoMark} aria-hidden="true">
                {n || ""}
              </span>
            </button>
          );
        })}
      </div>
      {picked.length ? (
        <button type="button" className={styles.recentPhotosSend} disabled={busy} onClick={() => void send()}>
          {busy ? "Открываем…" : `Отправить (${picked.length})`}
        </button>
      ) : null}
      {error ? <div className={styles.recentPhotosError} role="alert">{error}</div> : null}
    </div>
  );
}
