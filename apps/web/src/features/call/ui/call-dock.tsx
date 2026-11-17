import { createPortal } from "react-dom";
import { useLocation, useMatch, useNavigate } from "react-router";

import { Avatar, StreamAudio } from "@/shared/ui";

import { formatElapsed } from "../lib/format";
import { useCall } from "../model/use-call";

import styles from "./call-dock.module.css";

/**
 * Звонок вне своего экрана — как call-bubble-slot и call-audio-sink в public/js/app.js:
 * звук собеседников играет здесь (экран звонка можно закрыть), а свёрнутый звонок —
 * компактная зелёная полоса сверху, как в Telegram; нажатие возвращает на экран звонка.
 */
export function CallDock() {
  const s = useCall();
  const navigate = useNavigate();
  const onCallScreen = !!useMatch("/call/:callId");
  const { pathname } = useLocation();
  const onChatScreen = pathname.startsWith("/chat/");
  if (!s) return null;
  const other = s.others[0];
  return createPortal(
    <>
      <div hidden>
        {Object.entries(s.remoteStreams).map(([id, stream]) => (
          <StreamAudio key={id} stream={stream} />
        ))}
      </div>
      {s.minimized && !onCallScreen && !onChatScreen ? (
        <button
          type="button"
          className={styles.strip}
          aria-label={`${s.chatTitle} ${formatElapsed(s.elapsed)}`}
          onClick={() => void navigate(`/call/${s.call.id}`)}
        >
          <Avatar size={28} name={other?.name ?? s.chatTitle} color={other?.avatarColor ?? "#8A8F98"} image={other?.avatarImage} emoji={other?.avatarEmoji} />
          <span className={styles.info}>
            <span className={styles.title}>{s.chatTitle}</span>
            <span className={styles.timer}>{s.phase === "ringing" ? "Вызов…" : formatElapsed(s.elapsed)}</span>
          </span>
          <span className={styles.live} aria-hidden="true" />
        </button>
      ) : null}
    </>,
    document.body,
  );
}

/** Компактная полоса внутри открытого чата: не перекрывает шапку и не плавает поверх меню. */
export function CallBar({ chatId }: { chatId: string }) {
  const s = useCall();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // AppRoutes keeps ChatView mounted under a synthetic location while a desktop
  // side panel (Contacts/Settings) is open. The browser path is the real visible
  // route, so use it to avoid rendering both the inline bar and the global PiP.
  const visiblePath = typeof window === "undefined" ? pathname : window.location.pathname;
  if (!s || !s.minimized || s.call.chatId !== chatId || !visiblePath.startsWith("/chat/")) return null;
  const other = s.others[0];
  return (
    <button
      type="button"
      className={styles.bar}
      aria-label={`${s.chatTitle} ${formatElapsed(s.elapsed)}`}
      onClick={() => void navigate(`/call/${s.call.id}`)}
    >
      <Avatar size={24} name={other?.name ?? s.chatTitle} color={other?.avatarColor ?? "#8A8F98"} image={other?.avatarImage} emoji={other?.avatarEmoji} />
      <span className={styles.barTitle}>{s.chatTitle}</span>
      <span className={styles.timer}>{formatElapsed(s.elapsed)}</span>
      <span className={styles.live} aria-hidden="true" />
    </button>
  );
}
