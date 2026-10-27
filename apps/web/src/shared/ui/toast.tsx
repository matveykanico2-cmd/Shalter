import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { EmojiText } from "./emoji-text";
import styles from "./toast.module.css";
import { toastStore } from "./toast-store";

/** Ставится один раз в оболочке приложения. */
export function Toaster() {
  const shown = useSyncExternalStore(toastStore.subscribe, toastStore.get);
  if (!shown) return null;
  return createPortal(
    <div key={shown.id} className={shown.error ? `${styles.toast} ${styles.error}` : styles.toast} role={shown.error ? "alert" : "status"}>
      {/* Эмодзи картинками, как во всём старом клиенте (⭐ в «Не хватает звёзд»). */}
      <EmojiText text={shown.text} />
    </div>,
    document.body
  );
}
