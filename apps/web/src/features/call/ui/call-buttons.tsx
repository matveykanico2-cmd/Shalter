import type { ChatSummary } from "@/entities/chat";

import { Icon } from "@/shared/ui";

import type { CallPeer } from "../api/call-api";
import { useStartCall } from "../model/use-start-call";
import { useVoiceRoom } from "../model/use-voice-room";

import styles from "./call-buttons.module.css";

type Props = { chat: ChatSummary; me: CallPeer };

/** Где можно звонить: личка с человеком (не Избранное, не бот) и группа — всем. */
const canCall = (chat: ChatSummary) => (chat.type === "dm" && !chat.isSaved && !chat.otherUser?.isBot) || chat.type === "group";

/** Кнопки шапки чата: «Голосовой чат · N», «Позвонить», «Видеозвонок» — как в chatView.js. */
export function CallButtons({ chat, me }: Props) {
  const start = useStartCall(me);
  const group = chat.type === "group";
  const room = useVoiceRoom(chat.id, group);
  const dm = chat.type === "dm";
  return (
    <>
      {group && room ? (
        <button type="button" className={styles.room} title="Присоединиться к голосовому чату" onClick={() => void start.joinRoom(chat.id)}>
          <span className={styles.dot} />
          <span className={styles.roomLabel}>Голосовой чат · {room.participantIds.length}</span>
        </button>
      ) : null}
      {canCall(chat) ? (
        <>
          <button type="button" className={styles.button} title={dm ? "Позвонить" : "Позвонить всем в группе"} onClick={() => void start.call(chat.id, "audio", { ringAll: group })}>
            <Icon name="Phone" size={18} />
          </button>
          <button type="button" className={styles.button} title={dm ? "Видеозвонок" : "Видеозвонок всем в группе"} onClick={() => void start.call(chat.id, "video", { ringAll: group })}>
            <Icon name="Video" size={18} />
          </button>
        </>
      ) : null}
    </>
  );
}
