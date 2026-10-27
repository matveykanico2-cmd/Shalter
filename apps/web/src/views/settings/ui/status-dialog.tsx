import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { useUpdateSelf } from "@/entities/session";

import { errorText } from "@/shared/lib/error-text";
import { fileToImageDataUrl } from "@/shared/lib/image";
import { Button, Dialog, Icon } from "@/shared/ui";

import { addStatus, profileQueries, removeStatus, setActiveStatus } from "../api/profile-api";

import styles from "./status-dialog.module.css";

/** Окно «Статус» — openProfileStatusDialog: свои статусы (слоты), загрузка, готовые из каталога. */
export function StatusDialog({ onClose }: { onClose: () => void }) {
  const client = useQueryClient();
  const updateSelf = useUpdateSelf();
  const mine = useQuery(profileQueries.statuses());
  const catalog = useQuery(profileQueries.statusCatalog()).data ?? [];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const items = mine.data?.items ?? [];
  const activeId = mine.data?.activeId ?? null;
  const max = mine.data?.max ?? 1;
  const full = items.length >= max;
  const loadError = mine.isError ? errorText(mine.error, "Не удалось загрузить статусы") : null;

  const run = async (fn: () => Promise<{ user: Parameters<typeof updateSelf>[0]; items?: typeof items; activeId: string | null }>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fn();
      client.setQueryData(profileQueries.statuses().queryKey, (prev) => (prev ? { ...prev, items: res.items ?? prev.items, activeId: res.activeId } : prev));
      updateSelf(res.user);
    } catch (err) {
      setError(errorText(err, "Не удалось"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title="Статус" onClose={onClose} className={styles.dialog}>
      <p className={styles.heading}>
        Свои статусы — {items.length} из {max}
      </p>
      <div className={styles.grid}>
        <button type="button" className={activeId == null ? `${styles.cell} ${styles.active}` : styles.cell} title="Без статуса" aria-label="Без статуса" disabled={busy} onClick={() => void run(() => setActiveStatus(null))}>
          <span className={styles.none}>
            <Icon name="X" size={16} />
          </span>
        </button>
        {items.map((it) => (
          <div key={it.id} className={styles.wrap}>
            <button
              type="button"
              className={activeId === it.id ? `${styles.cell} ${styles.active}` : styles.cell}
              title={it.name || "Статус"}
              aria-label={it.name || "Статус"}
              disabled={busy}
              onClick={() => void run(() => setActiveStatus(it.id))}
            >
              <img className={styles.image} src={it.image} alt="" />
            </button>
            <button type="button" className={styles.remove} title="Удалить" aria-label="Удалить" disabled={busy} onClick={() => void run(() => removeStatus(it.id))}>
              <Icon name="X" size={10} />
            </button>
          </div>
        ))}
      </div>
      <Button disabled={busy || full} onClick={() => fileInput.current?.click()}>
        {full ? `Слотов больше нет (максимум ${max})` : "Загрузить своё изображение"}
      </Button>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void run(async () => addStatus({ image: await fileToImageDataUrl(file, 96, "image/png", 0.92) }));
        }}
      />
      {max === 1 ? <p className={styles.hint}>С Shalter Premium — до 5 статусов вместо одного.</p> : null}
      {error || loadError ? <p className={styles.error}>{error || loadError}</p> : null}
      <p className={styles.heading}>Готовые</p>
      <div className={styles.grid}>
        {catalog.length ? (
          catalog.map((c) => (
            <button key={c.id} type="button" className={styles.cell} title={c.name || "Статус"} aria-label={c.name || "Статус"} disabled={busy || full} onClick={() => void run(() => addStatus({ catalogId: c.id }))}>
              <img className={styles.image} src={c.image} alt="" />
            </button>
          ))
        ) : (
          <p className={styles.hint}>Пока пусто</p>
        )}
      </div>
      <Button variant="secondary" onClick={onClose}>
        Закрыть
      </Button>
    </Dialog>
  );
}
