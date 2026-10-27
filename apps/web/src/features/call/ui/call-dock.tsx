import { useMatch, useNavigate } from "react-router";

import { Avatar, StreamAudio } from "@/shared/ui";

import { formatElapsed } from "../lib/format";
import { useCall } from "../model/use-call";

import styles from "./call-dock.module.css";

/**
 * Звонок вне своего экрана — как call-bubble-slot и call-audio-sink в public/js/app.js:
 * звук собеседников играет здесь (экран звонка можно закрыть), а свёрнутый звонок —
 * пузырь в углу; нажатие возвращает на экран звонка.
 */
export function CallDock() {
  const s = useCall();
  const navigate = useNavigate();
  const onCallScreen = !!useMatch("/call/:callId");
  if (!s) return null;
  const other = s.others[0];
  return (
    <>
      <div hidden>
        {Object.entries(s.remoteStreams).map(([id, stream]) => (
          <StreamAudio key={id} stream={stream} />
        ))}
      </div>
      {s.minimized && !onCallScreen ? (
        <button type="button" className={styles.bubble} onClick={() => void navigate(`/call/${s.call.id}`)}>
          <Avatar size={28} name={other?.name ?? s.chatTitle} color={other?.avatarColor ?? "#8A8F98"} image={other?.avatarImage} />
          <span className={styles.title}>{s.chatTitle}</span>
          <span className={styles.timer}>{s.phase === "ringing" ? "Вызов…" : formatElapsed(s.elapsed)}</span>
        </button>
      ) : null}
    </>
  );
}
