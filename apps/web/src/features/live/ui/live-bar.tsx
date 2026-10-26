import { useQueryClient } from "@tanstack/react-query";

import { errorText } from "@/shared/lib/error-text";
import { askConfirm, toast } from "@/shared/ui";

import { liveApi, liveQueries } from "../api/live-api";
import { openLive } from "../model/live-store";
import { useChatLive } from "../model/use-chat-live";

import styles from "./live-bar.module.css";

type Props = { chat: { id: string; type: string; title: string | null }; meId: string };

/** Плашка «Идёт эфир» над лентой группы или канала — как renderLiveBar в chatView.js. */
export function LiveBar({ chat, meId }: Props) {
  const client = useQueryClient();
  const info = useChatLive(chat);
  const stream = info?.stream;
  if (!info || !stream) return null;
  const canStop = "canStop" in info && info.canStop;
  const stop = async () => {
    if (!(await askConfirm("Завершить эфир для всех?"))) return;
    try {
      await liveApi.stop(stream.id);
    } catch (err) {
      toast(errorText(err, "Не удалось завершить эфир"), { error: true });
    }
    void client.invalidateQueries({ queryKey: liveQueries.forChat(chat.id).queryKey });
  };
  return (
    <div className={styles.bar}>
      <span className={styles.dot} />
      <div className={styles.body}>
        <p className={styles.title}>{stream.title || "Идёт эфир"}</p>
        <p className={styles.sub}>{info.viewers} в эфире</p>
      </div>
      <button type="button" className={styles.join} onClick={() => openLive(stream.id, meId, { chatTitle: chat.title, canStopStream: canStop })}>
        Смотреть
      </button>
      {canStop ? (
        <button type="button" className={styles.stop} onClick={() => void stop()}>
          Завершить
        </button>
      ) : null}
    </div>
  );
}
