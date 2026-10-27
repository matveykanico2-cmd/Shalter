import { useCallback, useEffect, useState } from "react";

import { errorText } from "@/shared/lib/error-text";
import { Button, Dialog, Icon, toast } from "@/shared/ui";

import { deleteScheduled, listScheduled, type Scheduled, sendScheduledNow } from "../api/send-message";
import { repeatLabel } from "../lib/repeat";

import styles from "./create-dialogs.module.css";

const WHEN = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** «Запланированные сообщения» чата — как public/js/components/scheduledMessagesDialog.js. */
export function ScheduledList({ chatId, onClose }: { chatId: string; onClose: () => void }) {
  const [list, setList] = useState<Scheduled[] | "error" | null>(null);
  const load = useCallback(
    () =>
      listScheduled(chatId).then(
        ({ scheduled }) => setList(scheduled),
        () => setList("error")
      ),
    [chatId]
  );
  useEffect(() => {
    void load();
  }, [load]);

  const act = async (fn: () => Promise<unknown>, fallback: string) => {
    try {
      await fn();
    } catch (err) {
      toast(errorText(err, fallback), { error: true });
    }
    void load();
  };

  return (
    <Dialog title="Запланированные сообщения" onClose={onClose}>
      {list === null ? (
        <p className={styles.hint}>Загрузка…</p>
      ) : list === "error" ? (
        <p className={styles.error}>Не удалось загрузить</p>
      ) : !list.length ? (
        <p className={styles.hint}>Нет запланированных сообщений</p>
      ) : (
        <div className={styles.scheduled}>
          {list.map((s) => {
            const when = s.sendAt.startsWith("9999-") ? "Когда будет в сети" : WHEN.format(new Date(s.sendAt));
            return (
              <div key={s.id} className={styles.scheduledRow}>
                <div className={styles.scheduledBody}>
                  <p className={styles.scheduledText}>{s.text || "Медиа"}</p>
                  <p className={styles.hint}>{s.repeat ? `${when} · 🔁 ${repeatLabel(s.repeat)}` : when}</p>
                </div>
                <button type="button" className={styles.rowButton} title="Отправить сейчас" onClick={() => void act(() => sendScheduledNow(chatId, s.id), "Не удалось отправить")}>
                  <Icon name="Send" size={15} />
                </button>
                <button type="button" className={styles.rowButton} title="Удалить" onClick={() => void act(() => deleteScheduled(chatId, s.id), "Не удалось удалить")}>
                  <Icon name="Trash" size={15} />
                </button>
              </div>
            );
          })}
        </div>
      )}
      <Button variant="secondary" onClick={onClose}>
        Закрыть
      </Button>
    </Dialog>
  );
}
