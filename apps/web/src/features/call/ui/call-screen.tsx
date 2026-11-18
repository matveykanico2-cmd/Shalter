import { type MouseEvent, type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { ContactPicker } from "@/entities/user";

import { ApiError } from "@/shared/api";
import { errorText } from "@/shared/lib/error-text";
import { askConfirm, Avatar, Icon, Menu, type MenuItem, StreamVideo, toast, VolumeControl } from "@/shared/ui";

import { callApi, type CallPeer } from "../api/call-api";
import { formatElapsed } from "../lib/format";
import { addParticipant, type CallState, createInviteLink, flipCamera, hangup, type PeerMedia, toggleCamera, toggleHand, toggleMute, toggleScreenShare } from "../model/call-store";
import { useCallGestures, useGesturesEnabled } from "../model/use-call-gestures";

import { GestureEffect } from "./call-gestures";
import styles from "./call-screen.module.css";
import { InviteDialog } from "./invite-dialog";
import { useDraggable } from "./use-draggable";

type Props = {
  s: CallState;
  me: CallPeer;
  /** «Свернуть» — уйти в чат звонка, звонок продолжится в пузыре. */
  onMinimize: () => void;
  /** Положили трубку — экран уходит в чат звонка. */
  onHangup: (chatId: string | null) => void;
};

const hasVideo = (stream: MediaStream | null | undefined): stream is MediaStream => !!stream && stream.getVideoTracks().some((t) => t.readyState === "live");

// Полноэкранный режим — на весь документ, а не на экран звонка: меню, диалоги и тосты
// рисуются в body и должны оставаться видны. Экран звонка и так закрывает всё окно.
const canFullscreen = () => typeof document !== "undefined" && document.fullscreenEnabled !== false && typeof document.documentElement.requestFullscreen === "function";
const subscribeFullscreen = (fn: () => void) => {
  document.addEventListener("fullscreenchange", fn);
  return () => document.removeEventListener("fullscreenchange", fn);
};
const isFullscreen = () => !!document.fullscreenElement;

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  else document.documentElement.requestFullscreen?.({ navigationUI: "hide" }).catch(() => {});
}

// Иконки полноэкранного режима и «кадр целиком» (в общем наборе их нет).
const FULLSCREEN_ICON = "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5";
const EXIT_FULLSCREEN_ICON = "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5";
const FIT_ICON = "M3 7h18v10H3zM8 4h8M8 20h8";
function Glyph({ d }: { d: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/** Экран звонка — как public/js/views/callScreen.js. */
export function CallScreen({ s, me, onMinimize, onHangup }: Props) {
  const screen = useRef<HTMLDivElement>(null);
  const [swapped, setSwapped] = useState(false);
  const [stripHidden, setStripHidden] = useState(false);
  const [linkStatus, setLinkStatus] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [addMenu, setAddMenu] = useState<{ at: { x: number; y: number }; items: MenuItem[] } | null>(null);
  const [callMenuAt, setCallMenuAt] = useState<{ x: number; y: number } | null>(null);
  const [pickingContact, setPickingContact] = useState(false);
  // Собеседник заполняет экран (cover, края обрезаются); «Кадр целиком» — без обрезки.
  const [wholeFrame, setWholeFrame] = useState(false);
  const fullscreen = useSyncExternalStore(subscribeFullscreen, isFullscreen, () => false);
  // Ушли с экрана звонка (свернули, положили трубку) — из полноэкранного режима тоже.
  useEffect(
    () => () => {
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    },
    []
  );
  const { attach: pipAttach, style: pipStyle, onPointerDown: pipDown, justDragged: pipDragged } = useDraggable("shalter.callPipPos");
  const { attach: stripAttach, style: stripStyle, onPointerDown: stripDown, justDragged: stripDragged } = useDraggable("shalter.callStripPos");
  const [gesturesOn, toggleGestures] = useGesturesEnabled();
  const gestures = useCallGestures(s.phase !== "ended" && s.cameraOn ? s.localStream : null, gesturesOn);

  // Завершение обрабатывает CallView: он сразу возвращает пользователя в чат.
  // Не показываем промежуточный экран «Звонок завершён» даже на один кадр.
  if (s.phase === "ended") return null;

  const mediaOf = (p: CallPeer): PeerMedia => s.remoteMedia[p.id] ?? { camera: s.call.kind === "video", sharing: false, handRaised: false };
  const remoteSharerId = s.sharing ? null : (s.others.find((p) => mediaOf(p).sharing)?.id ?? null);
  // Кто-то показывает экран — он крупно, остальные полосой сверху.
  const stageMode = s.sharing || !!remoteSharerId;
  const swap = swapped && !stageMode;
  const toggleSwap = () => {
    if (pipDragged() || stripDragged() || stageMode) return;
    setSwapped((v) => !v);
  };

  const inviteByLink = async () => {
    if (s.phase === "ended") {
      onHangup(s.call.chatId);
      return;
    }
    setLinkStatus("Создаём ссылку…");
    try {
      setInviteUrl(await createInviteLink());
      setLinkStatus(null);
    } catch (err) {
      // Звонок мог завершиться на сервере между отрисовкой экрана и нажатием.
      if (err instanceof ApiError && (err.status === 404 || err.status === 410)) {
        await hangup().catch(() => null);
        onHangup(s.call.chatId);
        return;
      }
      const text = errorText(err, "Не удалось создать ссылку");
      setLinkStatus(text);
      setTimeout(() => setLinkStatus((cur) => (cur === text ? null : cur)), 2500);
    }
  };

  const inCall = (id: string) => id === me.id || s.others.some((o) => o.id === id);
  const add = (userId: string) => void addParticipant(userId).catch((err: unknown) => toast(errorText(err, "Не удалось добавить участника"), { error: true }));
  const openAddMenu = async (e: MouseEvent) => {
    const at = { x: e.clientX, y: e.clientY };
    const { members } = await callApi.chat(s.call.chatId).catch(() => ({ members: [] as CallPeer[] }));
    setAddMenu({
      at,
      items: [
        ...members.filter((m) => !inCall(m.id)).map((m): MenuItem => ({ icon: "Accounts", label: m.name, onClick: () => add(m.id) })),
        { icon: "Accounts", label: "Из контактов…", onClick: () => setPickingContact(true) },
      ],
    });
  };

  const remove = async (p: CallPeer) => {
    if (!(await askConfirm(`Убрать ${p.name} из звонка?`))) return;
    try {
      await callApi.removeParticipant(s.call.id, p.id);
    } catch (err) {
      toast(errorText(err, "Не удалось убрать участника"), { error: true });
    }
  };

  const tile = (p: CallPeer, role: "grid" | "stage" | "strip") => {
    const m = mediaOf(p);
    const main = s.remoteStreams[p.id] ?? null;
    let stream: MediaStream | null = null;
    let key = p.id;
    if (role === "stage") {
      stream = main;
    } else if (role === "strip" && p.id === remoteSharerId) {
      // Показывающий экран — в полосе его камера (второй видеоканал).
      stream = m.camera ? (s.remoteCamStreams[p.id] ?? null) : null;
      key = `${p.id}:cam`;
    } else if (swap) {
      stream = s.cameraOn ? s.localStream : null;
      key = `${p.id}:swap`;
    } else if (m.camera || m.sharing) {
      stream = main;
    }
    const showVideo = hasVideo(stream);
    const small = role === "strip";
    return (
      <DraggableTile
        key={`${role}:${p.id}`}
        className={[styles.tile, role === "stage" ? styles.stageTile : "", small ? styles.stripTile : ""].filter(Boolean).join(" ")}
        title={stageMode ? p.name : swapped ? "Вернуть как было" : "Показать себя крупно"}
        dragKey={`shalter.callTile.${p.id}`}
        movable={role === "grid"}
        onClick={(e) => {
          if (!stageMode && !(e.target as HTMLElement).closest("button")) toggleSwap();
        }}
        onDoubleClick={(e) => {
          e.preventDefault();
          toggleFullscreen();
        }}
      >
        {showVideo ? (
          <StreamVideo key={key} stream={stream} className={styles.tileVideo} />
        ) : (
          <div className={styles.tileAvatar}>
            <Avatar size={small ? 40 : 72} name={p.name} color={p.avatarColor} image={p.avatarImage} emoji={p.avatarEmoji} />
            <p className={styles.tileName}>{p.name}</p>
          </div>
        )}
        {role === "stage" ? <p className={styles.stageLabel}>Экран: {p.name}</p> : null}
        {showVideo && small ? <p className={styles.caption}>{p.name}</p> : null}
        {m.handRaised ? <span className={styles.handRaised} title={`${p.name} поднял руку`} aria-label={`${p.name} поднял руку`}>✋</span> : null}
        {s.call.callerId === me.id && role !== "stage" ? (
          <button type="button" className={styles.remove} title={`Убрать из звонка: ${p.name}`} onClick={() => void remove(p)}>
            <Icon name="X" size={15} />
          </button>
        ) : null}
      </DraggableTile>
    );
  };

  let area;
  if (stageMode) {
    const sharer = s.others.find((p) => p.id === remoteSharerId);
    const stage = s.sharing ? (
      <div
        key="own-screen"
        className={`${styles.tile} ${styles.stageTile}`}
        onDoubleClick={(e) => {
          e.preventDefault();
          toggleFullscreen();
        }}
      >
        <StreamVideo stream={s.screenStream} className={styles.tileVideo} />
        <p className={styles.stageLabel}>Вы показываете экран</p>
      </div>
    ) : sharer ? (
      tile(sharer, "stage")
    ) : null;
    area = (
      <div className={styles.stage}>
        {stage}
        {s.others.length ? (
          <div ref={stripAttach} data-draggable="" className={stripHidden ? `${styles.strip} ${styles.stripCollapsed}` : styles.strip} style={stripStyle}>
            <div className={styles.stripBar} title="Перетащите, чтобы передвинуть" onPointerDown={stripDown}>
              <Icon name="Users" size={14} />
              <span className={styles.stripCount}>Участники · {s.others.length}</span>
              <button type="button" className={styles.stripToggle} title={stripHidden ? "Показать участников" : "Скрыть участников"} onClick={() => setStripHidden((v) => !v)}>
                {stripHidden ? "Показать" : "Скрыть"}
              </button>
            </div>
            {stripHidden ? null : <div className={styles.stripTiles}>{s.others.map((p) => tile(p, "strip"))}</div>}
          </div>
        ) : null}
      </div>
    );
  } else {
    area = (
      <div className={s.others.length === 1 ? `${styles.grid} ${styles.solo}` : styles.grid} style={{ gridTemplateColumns: `repeat(${Math.min(s.others.length, 2) || 1}, minmax(0,1fr))` }}>
        {s.others.length ? s.others.map((p) => tile(p, "grid")) : <p className={styles.empty}>Ожидание участников…</p>}
      </div>
    );
  }

  // Своё превью в углу; «Показать себя крупно» меняет его местами с собеседником.
  const first = s.others[0];
  const pipStream = swap ? (first && (mediaOf(first).camera || mediaOf(first).sharing) ? (s.remoteStreams[first.id] ?? null) : null) : s.cameraOn ? s.localStream : null;
  const ownPreview = !swap && s.cameraOn;
  const who = swap && first ? first : me;
  const headerPerson = first ?? me;
  const leaveLabel = s.isRoom || s.joinedByLink ? "Покинуть встречу" : "Завершить";
  const hangupTitle = s.isRoom ? "Покинуть встречу" : "Завершить";
  const finishCall = () => void hangup().then(onHangup);

  return (
    <div ref={screen} className={wholeFrame ? `${styles.screen} ${styles.wholeFrame}` : styles.screen}>
      {area}
      <div className={styles.top}>
        <div className={styles.header}>
          <button type="button" className={styles.headerButton} title="Свернуть (PiP)" onClick={onMinimize}>
            <Icon name="ChevronLeft" size={20} />
          </button>
          <Avatar size={36} name={headerPerson.name} color={headerPerson.avatarColor} image={headerPerson.avatarImage} emoji={headerPerson.avatarEmoji} />
          <div className={styles.headerCenter}>
            <p className={styles.title}>{s.chatTitle}</p>
            <p className={styles.subtitle}>{s.phase === "ringing" ? "Вызов…" : formatElapsed(s.elapsed)}</p>
          </div>
          <div className={styles.headerActions}>
            {stageMode ? null : (
              <button
                type="button"
                className={styles.headerButton}
                title={wholeFrame ? "Заполнить экран" : "Показать кадр целиком"}
                aria-label="Кадр целиком"
                aria-pressed={wholeFrame}
                onClick={() => setWholeFrame((v) => !v)}
              >
                <Glyph d={FIT_ICON} />
              </button>
            )}
            {canFullscreen() ? (
              <button
                type="button"
                className={styles.headerButton}
                title={fullscreen ? "Выйти из полноэкранного режима (Esc)" : "На весь экран"}
                aria-label="На весь экран"
                aria-pressed={fullscreen}
                onClick={toggleFullscreen}
              >
                <Glyph d={fullscreen ? EXIT_FULLSCREEN_ICON : FULLSCREEN_ICON} />
              </button>
            ) : null}
            <button type="button" className={`${styles.headerButton} ${styles.invite}`} title="Пригласить по ссылке" onClick={() => void inviteByLink()}>
              <Icon name="Link" size={17} />
              <span className={styles.inviteLabel}>Пригласить</span>
            </button>
            <button type="button" className={styles.headerButton} title="Меню звонка" aria-label="Меню звонка" onClick={(e) => setCallMenuAt({ x: e.clientX, y: e.clientY })}>
              <Icon name="More" size={19} />
            </button>
          </div>
        </div>
        {s.mediaError ? <p className={styles.error}>{s.mediaError}</p> : null}
        {s.connectionError ? <p className={styles.error}>{s.connectionError}</p> : s.connectionStatus === "reconnecting" ? <p className={`${styles.error} ${styles.reconnecting}`} role="status"><span className={styles.statusDot} />Переподключение…</p> : s.connectionStatus === "connecting" && s.phase === "ringing" ? <p className={`${styles.error} ${styles.connecting}`} role="status"><span className={styles.statusDot} />Подключение…</p> : null}
        {linkStatus ? <p className={`${styles.error} ${styles.linkStatus}`}>{linkStatus}</p> : null}
      </div>
      <div
        ref={pipAttach}
        data-draggable=""
        className={styles.localPip}
        style={pipStyle}
        title={stageMode ? "Двойное нажатие — на весь экран" : swapped ? "Вернуть как было" : "Показать себя крупно · двойное нажатие — на весь экран"}
        onPointerDown={pipDown}
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest("button")) toggleSwap();
        }}
        onDoubleClick={(e) => {
          e.preventDefault();
          toggleFullscreen();
        }}
      >
        {hasVideo(pipStream) || (ownPreview && s.switchingCamera) ? (
          <LocalVideo stream={pipStream} mirrored={!swap && !s.facingBack} freeze={ownPreview && s.switchingCamera} />
        ) : (
          <div className={styles.localAvatar}>
            <Avatar size={48} name={who.name} color={who.avatarColor} image={who.avatarImage} emoji={who.avatarEmoji} />
          </div>
        )}
        {s.cameraOn && s.cameraCount > 1 ? (
          <button type="button" className={styles.flip} title="Другая камера" onClick={() => void flipCamera()}>
            <Icon name="FlipCamera" size={20} />
          </button>
        ) : null}
        {s.cameraError ? <p className={styles.cameraError}>{s.cameraError}</p> : null}
      </div>
      {!s.localStream && !s.mediaError && s.phase === "ringing" ? <div className={styles.loading} aria-live="polite"><span className={styles.loadingSpinner} />Подключаем звонок…</div> : null}
      <div className={styles.controls}>
        <button type="button" className={s.muted ? `${styles.control} ${styles.active}` : styles.control} title="Микрофон" aria-pressed={s.muted} onClick={toggleMute}>
          <Icon name="Mic" size={20} />
        </button>
        <button
          type="button"
          className={[styles.control, !s.cameraOn && s.call.kind === "video" ? styles.active : "", s.cameraOn && s.call.kind !== "video" ? styles.accent : ""].filter(Boolean).join(" ")}
          title={s.cameraOn ? "Выключить камеру" : "Включить камеру"}
          onClick={() => void toggleCamera()}
        >
          <Icon name="Video" size={20} />
        </button>
        <button type="button" className={s.sharing ? `${styles.control} ${styles.accent}` : styles.control} title={s.sharing ? "Остановить показ экрана" : "Демонстрация экрана"} onClick={() => void toggleScreenShare()}>
          <Icon name="Monitor" size={20} />
        </button>
        <button
          type="button"
          className={gesturesOn ? `${styles.control} ${styles.accent}` : styles.control}
          title={gestures.failed ? "Жесты: не удалось загрузить распознавание" : gesturesOn && !s.cameraOn ? "Жесты: включите камеру" : "Жесты"}
          aria-label="Жесты"
          aria-pressed={gesturesOn}
          onClick={toggleGestures}
        >
          <span aria-hidden="true" style={{ fontSize: 20, lineHeight: 1 }}>
            ✋
          </span>
        </button>
        <button
          type="button"
          className={s.handRaised ? `${styles.control} ${styles.accent}` : styles.control}
          title={s.handRaised ? "Опустить руку" : "Поднять руку"}
          aria-label={s.handRaised ? "Опустить руку" : "Поднять руку"}
          aria-pressed={s.handRaised}
          onClick={toggleHand}
        >
          <span aria-hidden="true" style={{ fontSize: 20, lineHeight: 1 }}>✋</span>
        </button>
        <VolumeControl className={styles.volume} />
        <button type="button" className={styles.control} title="Добавить участника" onClick={(e) => void openAddMenu(e)}>
          <Icon name="Plus" size={20} />
        </button>
        <button type="button" className={styles.hangup} title={hangupTitle} aria-label={leaveLabel} onClick={finishCall}>
          <Icon name="Phone" size={22} className={styles.hangupIcon} />
        </button>
      </div>
      <GestureEffect shown={gestures.shown} />
      {addMenu ? <Menu at={addMenu.at} label="Добавить участника" items={addMenu.items} onClose={() => setAddMenu(null)} /> : null}
      {callMenuAt ? (
        <Menu
          at={callMenuAt}
          label="Меню звонка"
          items={[
            { icon: "Link", label: "Пригласить по ссылке", onClick: () => void inviteByLink() },
            { icon: "ChevronLeft", label: "Свернуть в чат", onClick: onMinimize },
            { icon: "Phone", label: leaveLabel, danger: true, onClick: finishCall },
          ]}
          onClose={() => setCallMenuAt(null)}
        />
      ) : null}
      {pickingContact ? (
        <ContactPicker
          title="Кого добавить в звонок"
          exclude={[me.id]}
          onClose={() => setPickingContact(false)}
          onPick={(u) => {
            if (!inCall(u.id)) add(u.id);
          }}
        />
      ) : null}
      {inviteUrl ? <InviteDialog url={inviteUrl} callChatId={s.call.chatId} onClose={() => setInviteUrl(null)} /> : null}
    </div>
  );
}

function DraggableTile({
  dragKey,
  movable,
  className,
  title,
  onClick,
  onDoubleClick,
  children,
}: {
  dragKey: string;
  movable: boolean;
  className: string;
  title: string;
  onClick: (event: MouseEvent<HTMLDivElement>) => void;
  onDoubleClick: (event: MouseEvent<HTMLDivElement>) => void;
  children: ReactNode;
}) {
  const drag = useDraggable(dragKey);
  return (
    <div
      ref={movable ? drag.attach : undefined}
      data-draggable={movable ? "" : undefined}
      className={className}
      title={title}
      style={movable ? { ...drag.style, cursor: "grab" } : undefined}
      onPointerDown={movable ? drag.onPointerDown : undefined}
      onClick={(event) => {
        if (movable && drag.justDragged()) return;
        onClick(event);
      }}
      onDoubleClick={onDoubleClick}
    >
      {children}
    </div>
  );
}

type LocalVideoProps = { stream: MediaStream | null; mirrored: boolean; freeze: boolean };

/**
 * Своя камера. Пока она переключается, поверх — последний кадр (как в Telegram), а не
 * чёрный экран до первого кадра новой камеры; кадр уходит с первым новым.
 */
function LocalVideo({ stream, mirrored, freeze }: LocalVideoProps) {
  const video = useRef<HTMLVideoElement | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [frame, setFrame] = useState<"shown" | "leaving" | null>(null);
  if (freeze && frame !== "shown") setFrame("shown");

  // Кадр рисуем, как только холст появился, — видео ещё показывает старую камеру.
  useEffect(() => {
    const v = video.current;
    const c = canvas.current;
    if (frame !== "shown" || !freeze || !v || !c || !v.videoWidth) return;
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    try {
      c.getContext("2d")?.drawImage(v, 0, 0);
    } catch {
      // Кадр не нарисовался — просто без него.
    }
  }, [frame, freeze]);

  // Камера переключилась — убираем кадр с первым новым (или через 1,5 с).
  useEffect(() => {
    if (freeze || frame !== "shown") return;
    let leave: ReturnType<typeof setTimeout> | undefined;
    const drop = () => {
      setFrame("leaving");
      leave = setTimeout(() => setFrame(null), 180);
    };
    const fallback = setTimeout(drop, 1500);
    video.current?.requestVideoFrameCallback?.(() => {
      clearTimeout(fallback);
      drop();
    });
    return () => {
      clearTimeout(fallback);
      clearTimeout(leave);
    };
  }, [freeze, frame]);

  const mirror = mirrored ? styles.mirrored : "";
  return (
    <div className={styles.localStack}>
      <StreamVideo stream={stream} className={`${styles.localVideo} ${mirror}`} ref={(el) => void (video.current = el)} />
      {frame ? <canvas ref={canvas} className={[styles.localVideo, styles.freeze, mirror, frame === "leaving" ? styles.freezeLeaving : ""].filter(Boolean).join(" ")} /> : null}
    </div>
  );
}
