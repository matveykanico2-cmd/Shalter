import { closePwaInstallDialog, promptPwaInstall, usePwaInstall } from "@/shared/lib/pwa-install";
import { Icon } from "@/shared/ui";

import styles from "./pwa-install-dialog.module.css";

export function PwaInstallDialog() {
  const state = usePwaInstall();
  if (!state.dialog || state.installed) return null;
  return (
    <div className={styles.backdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closePwaInstallDialog(); }}>
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="install-title">
        <button type="button" className={styles.close} onClick={closePwaInstallDialog} aria-label="Закрыть"><Icon name="X" size={20} /></button>
        <div className={styles.icon}><Icon name="Download" size={28} /></div>
        <h2 id="install-title">Установить Shalter</h2>
        {state.ios ? <p>В Safari нажмите «Поделиться», затем выберите «На экран „Домой“». После этого Shalter будет открываться как приложение.</p> : state.canPrompt ? <p>Установите Shalter для быстрого запуска, полноэкранного режима и уведомлений.</p> : <p>Откройте меню браузера и выберите «Установить приложение» или «Добавить на главный экран».</p>}
        {state.ios ? <div className={styles.steps}><span>1</span><b>Поделиться</b><span>2</span><b>На экран «Домой»</b></div> : state.canPrompt ? <button type="button" className={styles.install} onClick={() => void promptPwaInstall().then(closePwaInstallDialog)}>Установить</button> : null}
        <button type="button" className={styles.cancel} onClick={closePwaInstallDialog}>Позже</button>
      </section>
    </div>
  );
}
