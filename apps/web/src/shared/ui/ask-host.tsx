import { useEffect, useState, useSyncExternalStore } from "react";

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
  // Enter в вопросе да/нет — «да», как в askConfirm старого клиента.
  useEffect(() => {
    if (ask.kind !== "confirm") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      askStore.answer(ask.id, true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [ask]);
  return (
    <Dialog title={ask.text} onClose={cancel}>
      {ask.kind === "confirm" && ask.detail ? <p className={styles.text}>{ask.detail}</p> : null}
      {ask.kind === "text" ? (
        <input
          className={styles.input}
          value={value}
          autoFocus
          // Как input.select() в askText: набранное сразу заменяет прежнее значение.
          onFocus={(e) => e.currentTarget.select()}
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
