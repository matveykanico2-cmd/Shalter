import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";

import { chatQueries, type ChatSummary } from "@/entities/chat";

import { errorText } from "@/shared/lib/error-text";
import { askConfirm, toast } from "@/shared/ui";

import { leaveChannel, subscribeChannel } from "../api/channel-subscription";

import styles from "./subscribe-bar.module.css";

/**
 * Подписчик канала вместо поля ввода видит «ОТПИСАТЬСЯ»; кнопка меняется на месте, и
 * отписавшийся от публичного канала может тут же подписаться обратно (buildComposer).
 */
export function SubscribeBar({ chat }: { chat: ChatSummary }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const [subscribed, setSubscribed] = useState(true);
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    if (subscribed && !chat.isPublic && !(await askConfirm("Канал закрытый — вернуться в него можно будет только по приглашению. Отписаться?", { okLabel: "Отписаться" }))) return;
    setBusy(true);
    try {
      if (subscribed) {
        await leaveChannel(chat.id);
        // Закрытый канал без приглашения больше не откроется — уходим к чатам.
        if (!chat.isPublic) {
          client.setQueryData(chatQueries.list().queryKey, (list) => list?.filter((c) => c.id !== chat.id));
          void navigate("/", { replace: true });
          return;
        }
      } else await subscribeChannel(chat.id);
      setSubscribed(!subscribed);
      void client.invalidateQueries({ queryKey: chatQueries.list().queryKey });
    } catch (err) {
      toast(errorText(err, subscribed ? "Не удалось отписаться" : "Не удалось подписаться"), { error: true });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={styles.bar}>
      <button type="button" className={styles.button} disabled={busy} onClick={() => void toggle()}>
        {subscribed ? "ОТПИСАТЬСЯ" : "ПОДПИСАТЬСЯ"}
      </button>
    </div>
  );
}
