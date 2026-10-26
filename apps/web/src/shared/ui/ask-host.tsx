import { useState, useSyncExternalStore } from "react";

import { type Ask, askStore } from "./ask-store";
import { Button } from "./button";
import { Dialog } from "./dialog";
import styles from "./dialog.module.css";

/** Окно для askConfirm/askText; ставится один раз в оболочке приложения. */
export function AskHost() {
  const ask = useSyncExternalStore(askStore.subscribe, askStore.get);
  if (!ask) return null;
  return <AskDialog key={ask.id} ask={ask} />;
}

function AskDialog({ ask }: { ask: Ask }) {
  const [value, setValue] = useState(ask.kind === "text" ? ask.initial : "");
  const cancel = () => askStore.answer(ask.id, ask.kind === "confirm" ? false : null);
  const ok = () => askStore.answer(ask.id, ask.kind === "confirm" ? true : value);
  return (
    <Dialog title={ask.text} onClose={cancel}>
      {ask.kind === "text" ? (
        <input
          className={styles.input}
          value={value}
          autoFocus
          aria-label={ask.text}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") ok();
          }}
        />
      ) : null}
      <Button variant={ask.kind === "confirm" && ask.danger ? "danger" : "primary"} onClick={ok}>
        {ask.okLabel}
      </Button>
      <Button variant="secondary" onClick={cancel}>
        {ask.kind === "confirm" ? ask.cancelLabel : "Отмена"}
      </Button>
    </Dialog>
  );
}
