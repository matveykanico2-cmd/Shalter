import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import type { Download } from "@/shared/lib/downloads";
import { Icon } from "@/shared/ui";

import styles from "./downloads.module.css";

/** Встроенный просмотр PDF, текста и музыки; остальное — только скачать снова (openDownloadViewer). */
export function DownloadViewer({ item, onClose }: { item: Download; onClose: () => void }) {
  const [text, setText] = useState("Загрузка…");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  useEffect(() => {
    if (item.kind !== "text") return;
    const ctrl = new AbortController();
    fetch(item.url, { credentials: "same-origin", signal: ctrl.signal })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(
        (t) => setText(t.length > 500_000 ? `${t.slice(0, 500_000)}\n…` : t),
        () => !ctrl.signal.aborted && setText("Не удалось открыть файл")
      );
    return () => ctrl.abort();
  }, [item]);

  return createPortal(
    <div className={styles.overlay} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`${styles.dialog} ${styles.viewer}`} role="dialog" aria-modal="true" aria-label={item.name}>
        <div className={styles.head}>
          <span className={styles.viewerTitle}>{item.name}</span>
          <a className={styles.iconButton} href={item.url} download={item.name} title="Скачать" aria-label="Скачать">
            <Icon name="Download" size={20} />
          </a>
          <button type="button" className={styles.iconButton} title="Закрыть" aria-label="Закрыть" onClick={onClose}>
            <Icon name="X" size={20} />
          </button>
        </div>
        <div className={styles.viewerBody}>
          {item.kind === "pdf" ? (
            <iframe className={styles.frame} src={item.url} title={item.name} />
          ) : item.kind === "audio" ? (
            <div className={styles.empty}>
              <Icon name="Volume" size={48} />
              <audio src={item.url} controls autoPlay />
            </div>
          ) : item.kind === "text" ? (
            <pre className={styles.text}>{text}</pre>
          ) : (
            <div className={styles.empty}>
              <Icon name="File" size={48} />
              <p>Этот формат открывается только во внешней программе</p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
