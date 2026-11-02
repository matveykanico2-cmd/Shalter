import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";

import { chatQueries, type ChatSummary } from "@/entities/chat";

import { errorText } from "@/shared/lib/error-text";
import { askConfirm, toast } from "@/shared/ui";

import { joinChat, leaveChannel, subscribeChannel } from "../api/channel-subscription";

import styles from "./subscribe-bar.module.css";

/**
 * Подписчик канала вместо поля ввода видит «ОТПИСАТЬСЯ»; кнопка меняется на месте, и
 * отписавшийся от публичного канала может тут же подписаться обратно (buildComposer).
 * Не участник (вышел из канала или группы, а чат ещё открыт) видит «ПОДПИСАТЬСЯ» /
 * «ВСТУПИТЬ В ГРУППУ» / «ПОДАТЬ ЗАЯВКУ», а не «ОТПИСАТЬСЯ» и не поле ввода.
 */
export function SubscribeBar({ chat, meId }: { chat: ChatSummary; meId: string }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const isChannel = chat.type === "channel";
  const [subscribed, setSubscribed] = useState(() => chat.memberIds.includes(meId));
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const approve = !!chat.approveJoins;
  const toggle = async () => {
    if (subscribed && !chat.isPublic && !(await askConfirm(`${isChannel ? "Канал закрытый" : "Группа закрытая"} — вернуться можно будет только по приглашению. ${isChannel ? "Отписаться" : "Выйти"}?`, { okLabel: isChannel ? "Отписаться" : "Выйти" }))) return;
    setBusy(true);
    try {
      if (subscribed) {
        await leaveChannel(chat.id);
        // Закрытый чат без приглашения больше не откроется — уходим к чатам.
        if (!chat.isPublic) {
          client.setQueryData(chatQueries.list().queryKey, (list) => list?.filter((c) => c.id !== chat.id));
          void navigate("/", { replace: true });
          return;
        }
      } else {
        const res = isChannel && !approve ? await subscribeChannel(chat.id) : await joinChat(chat.id);
        if (res && typeof res === "object" && "pending" in res && res.pending) {
          setPending(true);
          toast(isChannel ? "Заявка на вступление в канал отправлена" : "Заявка на вступление в группу отправлена");
          return;
        }
      }
      setSubscribed(!subscribed);
      void client.invalidateQueries({ queryKey: chatQueries.list().queryKey });
    } catch (err) {
      toast(errorText(err, subscribed ? (isChannel ? "Не удалось отписаться" : "Не удалось выйти") : isChannel ? "Не удалось подписаться" : "Не удалось вступить"), { error: true });
    } finally {
      setBusy(false);
    }
  };
  const label = pending ? "ЗАЯВКА ОТПРАВЛЕНА" : subscribed ? (isChannel ? "ОТПИСАТЬСЯ" : "ВЫЙТИ ИЗ ГРУППЫ") : approve ? "ПОДАТЬ ЗАЯВКУ" : isChannel ? "ПОДПИСАТЬСЯ" : "ВСТУПИТЬ В ГРУППУ";
  return (
    <div className={styles.bar}>
      <button type="button" className={subscribed ? `${styles.button} ${styles.leave}` : styles.button} disabled={busy || pending} onClick={() => void toggle()}>
        {busy ? "…" : label}
      </button>
    </div>
  );
}
