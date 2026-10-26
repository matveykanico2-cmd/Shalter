import { createPortal } from "react-dom";
import { useNavigate } from "react-router";

import { Avatar, Icon } from "@/shared/ui";

import type { CallPeer } from "../api/call-api";
import { decline, joinCallById } from "../model/call-store";
import { useCall } from "../model/use-call";
import { useIncomingCall } from "../model/use-incoming-call";

import styles from "./incoming-call.module.css";

/** Экран входящего звонка поверх приложения — «Отклонить» и «Ответить». */
export function IncomingCall({ me }: { me: CallPeer }) {
  const { ringing, dismiss } = useIncomingCall(me.id);
  const navigate = useNavigate();
  const current = useCall();
  // Ответили из уведомления (/call/:id?answer=1) — звонок уже идёт.
  if (!ringing || current?.call.id === ringing.id) return null;
  const other = ringing.otherUser;
  const group = ringing.participantIds.length > 2;
  const video = ringing.kind === "video";
  const kind = group ? (video ? "Групповой видеозвонок" : "Групповой звонок") : video ? "Входящий видеозвонок" : "Входящий звонок";
  const answer = async () => {
    dismiss();
    await joinCallById(ringing.id, me).catch(() => {});
    void navigate(`/call/${ringing.id}`);
  };
  return createPortal(
    <div className={styles.screen} role="dialog" aria-label={kind}>
      <div className={styles.card}>
        <p className={styles.kind}>{kind}</p>
        <div className={styles.avatar}>
          <Avatar size={132} name={other?.name ?? "?"} color={other?.avatarColor} image={other?.avatarImage} />
        </div>
        <p className={styles.name}>{other?.name ?? "Звонок"}</p>
        <p className={styles.hint}>{other?.username ? `@${other.username}` : "Звонит…"}</p>
        <div className={styles.actions}>
          <div className={styles.action}>
            <button
              type="button"
              className={`${styles.button} ${styles.decline}`}
              title="Отклонить"
              aria-label="Отклонить"
              onClick={() => {
                dismiss();
                void decline(ringing);
              }}
            >
              <Icon name="Phone" size={26} className={styles.hangupIcon} />
            </button>
            <span className={styles.label}>Отклонить</span>
          </div>
          <div className={styles.action}>
            <button type="button" className={`${styles.button} ${styles.accept}`} title="Ответить" aria-label="Ответить" onClick={() => void answer()}>
              <Icon name={video ? "Video" : "Phone"} size={26} />
            </button>
            <span className={styles.label}>Ответить</span>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
