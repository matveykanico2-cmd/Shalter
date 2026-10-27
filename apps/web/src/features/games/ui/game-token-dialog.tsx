import { copyText } from "@/shared/lib/clipboard";
import { Button, Dialog } from "@/shared/ui";

import styles from "./games.module.css";

/** Окно с только что созданным токеном. */
export function GameTokenDialog({ token, onClose }: { token: string; onClose: () => void }) {
  return (
    <Dialog title="🔑 Токен Game API" onClose={onClose}>
      <p className={styles.hint}>Сохраните его — повторно он не показывается. С ним можно обновлять игру, читать статистику и ставить рекорды со своего сервера.</p>
      <code className={styles.token}>{token}</code>
      <div className={styles.row}>
        <a className={styles.hint} href="/games" target="_blank" rel="noreferrer">
          Документация
        </a>
        <span className={styles.spacer} />
        <Button onClick={() => void copyText(token, "Токен скопирован")}>Скопировать</Button>
      </div>
      <Button variant="secondary" onClick={onClose}>
        Закрыть
      </Button>
    </Dialog>
  );
}
