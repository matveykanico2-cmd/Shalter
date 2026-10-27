import { Button, Dialog } from "@/shared/ui";

import styles from "./message-actions.module.css";

/**
 * «Выделить текст» — как openSelectTextDialog в messageBubble.js: на телефоне долгое нажатие
 * открывает меню, а не выделение, — часть текста выделяют здесь системным выделением.
 */
export function SelectTextDialog({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <Dialog title="Выделить текст" onClose={onClose}>
      <div className={styles.selectText}>{text}</div>
      <Button variant="secondary" onClick={onClose}>
        Закрыть
      </Button>
    </Dialog>
  );
}
