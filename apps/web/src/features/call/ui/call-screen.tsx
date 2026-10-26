import { type MouseEvent, useEffect, useRef, useState } from "react";

import { ContactPicker } from "@/entities/user";

import { errorText } from "@/shared/lib/error-text";
import { askConfirm, Avatar, Icon, Menu, type MenuItem, toast, VolumeControl } from "@/shared/ui";

import { callApi, type CallPeer } from "../api/call-api";
import { formatElapsed } from "../lib/format";
import { addParticipant, type CallState, createInviteLink, flipCamera, hangup, type PeerMedia, toggleCamera, toggleMute, toggleScreenShare } from "../model/call-store";

import styles from "./call-screen.module.css";
import { InviteDialog } from "./invite-dialog";
import { StreamVideo } from "./stream-media";
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

/** Экран звонка — как public/js/views/callScreen.js. */
export function CallScreen({ s, me, onMinimize, onHangup }: Props) {
  const screen = useRef<HTMLDivElement>(null);
  const [swapped, setSwapped] = useState(false);
  const [stripHidden, setStripHidden] = useState(false);
  const [linkStatus, setLinkStatus] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [addMenu, setAddMenu] = useState<{ at: { x: number; y: number }; items: MenuItem[] } | null>(null);
  const [pickingContact, setPickingContact] = useState(false);
  const { attach: pipAttach, style: pipStyle, onPointerDown: pipDown, justDragged: pipDragged } = useDraggable("shalter.callPipPos");
  const { attach: stripAttach, style: stripStyle, onPointerDown: stripDown, justDragged: stripDragged } = useDraggable("shalter.callStripPos");

  if (s.phase === "ended") {
    return (
      <div className={`${styles.screen} ${styles.ended}`}>
        <p>Звонок завершён</p>
      </div>
    );
  }

  const mediaOf = (p: CallPeer): PeerMedia => s.remoteMedia[p.id] ?? { camera: s.call.kind === "video", sharing: false };
  const remoteSharerId = s.sharing ? null : (s.others.find((p) => mediaOf(p).sharing)?.id ?? null);
  // Кто-то показывает экран — он крупно, остальные полосой сверху.
  const stageMode = s.sharing || !!remoteSharerId;
  const swap = swapped && !stageMode;
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else screen.current?.requestFullscreen?.().catch(() => {});
  };
  const toggleSwap = () => {
    if (pipDragged() || stripDragged() || stageMode) return;
    setSwapped((v) => !v);
  };

  const inviteByLink = async () => {
    setLinkStatus("Создаём ссылку…");
    try {
      setInviteUrl(await createInviteLink());
      setLinkStatus(null);
    } catch (err) {
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
      <div
        key={`${role}:${p.id}`}
        className={[styles.tile, role === "stage" ? styles.stageTile : "", small ? styles.stripTile : ""].filter(Boolean).join(" ")}
        title={stageMode ? p.name : swapped ? "Вернуть как было" : "Показать себя крупно"}
        style={stageMode ? undefined : { cursor: "pointer" }}
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
            <Avatar size={small ? 40 : 72} name={p.name} color={p.avatarColor} image={p.avatarImage} />
            <p className={styles.tileName}>{p.name}</p>
          </div>
        )}
        {role === "stage" ? <p className={styles.stageLabel}>Экран: {p.name}</p> : null}
        {showVideo && small ? <p className={styles.caption}>{p.name}</p> : null}
        <p className={styles.tileStatus}>{s.phase === "ringing" ? "вызов…" : s.connectedPeers[p.id] ? "" : "соединение…"}</p>
        {s.call.callerId === me.id && role !== "stage" ? (
          <button type="button" className={styles.remove} title={`Убрать из звонка: ${p.name}`} onClick={() => void remove(p)}>
            <Icon name="X" size={15} />
          </button>
        ) : null}
      </div>
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

  return (
    <div ref={screen} className={styles.screen}>
      <div className={styles.header}>
        <button type="button" className={styles.headerButton} title="Свернуть (PiP)" onClick={onMinimize}>
          <Icon name="ChevronLeft" size={20} />
        </button>
        <div className={styles.headerCenter}>
          <p className={styles.title}>{s.chatTitle}</p>
          <p className={styles.timer}>{s.phase === "ringing" ? "Вызов…" : formatElapsed(s.elapsed)}</p>
        </div>
        <button type="button" className={`${styles.headerButton} ${styles.invite}`} title="Пригласить по ссылке" onClick={() => void inviteByLink()}>
          <Icon name="Link" size={17} />
          <span className={styles.inviteLabel}>Пригласить</span>
        </button>
      </div>
      {s.mediaError ? <p className={styles.error}>{s.mediaError}</p> : null}
      {s.connectionError ? <p className={styles.error}>{s.connectionError}</p> : null}
      {linkStatus ? <p className={`${styles.error} ${styles.linkStatus}`}>{linkStatus}</p> : null}
      {area}
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
            <Avatar size={48} name={who.name} color={who.avatarColor} image={who.avatarImage} />
          </div>
        )}
        {s.cameraOn && s.cameraCount > 1 ? (
          <button type="button" className={styles.flip} title="Другая камера" onClick={() => void flipCamera()}>
            <Icon name="FlipCamera" size={14} />
          </button>
        ) : null}
        {s.cameraError ? <p className={styles.cameraError}>{s.cameraError}</p> : null}
      </div>
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
        <VolumeControl className={styles.volume} />
        <button type="button" className={styles.control} title="Добавить участника" onClick={(e) => void openAddMenu(e)}>
          <Icon name="Plus" size={20} />
        </button>
        <button type="button" className={styles.hangup} title="Завершить" onClick={() => void hangup().then(onHangup)}>
          <Icon name="Phone" size={22} className={styles.hangupIcon} />
        </button>
      </div>
      {addMenu ? <Menu at={addMenu.at} label="Добавить участника" items={addMenu.items} onClose={() => setAddMenu(null)} /> : null}
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
