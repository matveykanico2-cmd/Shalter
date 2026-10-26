import { type CSSProperties, type KeyboardEvent, type PointerEvent, type RefObject, useEffect, useRef, useState } from "react";

import { isServerModerator, type SelfUser } from "@/entities/session";

import { errorText } from "@/shared/lib/error-text";
import { applyVolume, subscribeVolume } from "@/shared/lib/media/media-volume";
import { askConfirm, Avatar, Button, Icon, StreamAudio, StreamVideo, VolumeControl } from "@/shared/ui";

import { liveApi, type LiveMessage, type LiveParticipant } from "../api/live-api";
import { attachFlv, isFlvSupported } from "../lib/flv-player";
import { closeLive, leaveLive, type LiveScreenInfo, type LiveView, stopLive, toggleCam, toggleMic, toggleScreenShare } from "../model/live-store";

import styles from "./live-screen.module.css";

type Props = { live: LiveView | null; screen: LiveScreenInfo; me: SelfUser };

// Если пользователя нет в базе, сервер присылает { id, name: "—" } без аватара.
const face = (u: LiveParticipant["user"]) => ({
  name: u.name,
  color: "avatarColor" in u ? u.avatarColor : null,
  image: "avatarImage" in u ? u.avatarImage : null,
});

const hasLiveVideo = (stream: MediaStream | null | undefined) => !!stream?.getVideoTracks().some((t) => t.readyState === "live" && t.enabled);

function toggleFullscreen(target: HTMLElement | null) {
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  else target?.requestFullscreen?.().catch(() => {});
}

/** Экран эфира — как public/js/components/liveScreen.js. */
export function LiveScreen({ live, screen, me }: Props) {
  const main = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [flvStatus, setFlvStatus] = useState<string | null>(null);

  if (!live || live.stream.status === "ended") {
    if (!live && screen.joining) return <div className={styles.overlay} role="dialog" aria-label="Эфир" />;
    return (
      <div className={styles.overlay} role="dialog" aria-label="Эфир">
        <div className={styles.message}>
          <p>{(!live && screen.error) || "Эфир завершён"}</p>
          <Button onClick={closeLive}>Закрыть</Button>
        </div>
      </div>
    );
  }

  const act = (fn: () => Promise<unknown>) => {
    fn().catch((err: unknown) => setError(errorText(err, "Не получилось")));
  };

  const streamId = live.stream.id;
  const isHost = live.myRole === "host";
  const viaObs = live.stream.source === "rtmp";
  const canStop = isHost || screen.canStopStream;
  const canSpeak = !viaObs && (live.myRole === "host" || live.myRole === "speaker");
  const host = live.participants.find((p) => p.role === "host");
  const speakers = live.participants.filter((p) => p.role === "speaker");
  const viewers = live.participants.filter((p) => p.role === "viewer");
  const mine = live.participants.find((p) => p.userId === live.meId);
  const hostIsMe = host?.userId === live.meId;
  const hostStream = hostIsMe ? live.localStream : host ? live.remoteStreams[host.userId] : null;
  const hostFace = host ? face(host.user) : { name: "?", color: null, image: null };

  const emptyStage = (text: string) => (
    <div className={styles.stageEmpty}>
      <Avatar size={96} {...hostFace} />
      <p>{text}</p>
    </div>
  );

  let stageBody;
  if (viaObs) {
    if (!isFlvSupported()) {
      stageBody = (
        <div className={styles.stageEmpty}>
          <p>Этот эфир идёт из внешней программы, а браузер не умеет его показывать.</p>
          <p className={styles.hint}>Откройте его в Chrome, Firefox или Edge — в Safari на iPhone такой поток не проигрывается.</p>
        </div>
      );
    } else if (!live.stream.rtmpLive || !live.flvUrl) {
      stageBody = emptyStage(isHost ? "Запустите трансляцию в OBS" : "Ведущий ещё не начал вещание");
    } else {
      stageBody = <FlvVideo url={live.flvUrl} onStatus={setFlvStatus} />;
    }
  } else if (hostStream && (live.stream.withVideo || hostStream.getVideoTracks().length > 0)) {
    stageBody = <StreamVideo stream={hostStream} className={hostIsMe && !live.sharing ? `${styles.video} ${styles.mirrored}` : styles.video} />;
  } else {
    stageBody = emptyStage(live.stream.withVideo ? "Ведущий ещё не включил камеру" : "Голосовой эфир");
  }

  const rows = [...(host ? [host] : []), ...speakers, ...viewers.slice().sort((a, b) => Number(b.handRaised) - Number(a.handRaised))];

  return (
    <div className={styles.overlay} role="dialog" aria-label="Эфир">
      {/* Звук ведущего и выступающих; видео ниже — без звука. */}
      <div hidden>
        {Object.entries(live.remoteStreams).map(([id, stream]) => (
          <StreamAudio key={id} stream={stream} />
        ))}
      </div>
      <div className={styles.main} ref={main}>
        <div
          className={styles.stage}
          onDoubleClick={(e) => {
            e.preventDefault();
            toggleFullscreen(main.current);
          }}
        >
          {stageBody}
          <div className={styles.stageTop}>
            <span className={styles.badge}>В ЭФИРЕ</span>
            <span className={styles.title}>{live.stream.title || screen.chatTitle || "Эфир"}</span>
            <span className={styles.count}>{live.participants.length} в эфире</span>
          </div>
          {speakers.length ? (
            <div className={styles.speakers}>
              {speakers.map((p) => (
                <SpeakerTile key={p.userId} p={p} stream={p.userId === live.meId ? live.localStream : live.remoteStreams[p.userId]} fullscreenTarget={main} />
              ))}
            </div>
          ) : null}
        </div>
        {viaObs && isHost && live.ingest && !live.stream.rtmpLive ? (
          <div className={styles.obsPanel}>
            <p className={styles.obsTitle}>Настройки для OBS Studio</p>
            <p className={styles.obsSub}>Настройки → Вещание → Сервис: «Настраиваемый…»</p>
            <ObsField label="Сервер" value={live.ingest.url} />
            <ObsField label="Ключ потока" value={live.ingest.key} />
            <p className={styles.hint}>Дальше — «Запустить трансляцию» в OBS. Картинка появится здесь через пару секунд.</p>
          </div>
        ) : null}
        {viaObs && flvStatus ? <p className={styles.error}>{flvStatus}</p> : null}
        {error ? <p className={styles.error}>{error}</p> : null}
        {live.error ? <p className={styles.error}>{live.error}</p> : null}
        <div className={styles.controls}>
          {canSpeak ? (
            <button type="button" className={`${styles.ctl} ${live.micOn && !mine?.mutedByHost ? styles.on : styles.off}`} title="Микрофон" onClick={toggleMic}>
              <Icon name="Mic" size={18} />
              <span>{mine?.mutedByHost ? "Заглушены" : live.micOn ? "Микрофон" : "Включить"}</span>
            </button>
          ) : null}
          {canSpeak && live.stream.withVideo ? (
            <button type="button" className={`${styles.ctl} ${live.camOn ? styles.on : styles.off}`} title="Камера" onClick={toggleCam}>
              <Icon name="Video" size={18} />
              <span>{live.camOn ? "Камера" : "Включить"}</span>
            </button>
          ) : null}
          {live.canShare ? (
            <button
              type="button"
              className={`${styles.ctl} ${live.sharing ? styles.on : ""}`}
              title={live.sharing ? "Остановить показ экрана" : "Показать свой экран"}
              onClick={() => act(toggleScreenShare)}
            >
              <Icon name="Monitor" size={18} />
              <span>{live.sharing ? "Показ идёт" : "Экран"}</span>
            </button>
          ) : null}
          {!canSpeak && !viaObs ? (
            <button type="button" className={`${styles.ctl} ${mine?.handRaised ? styles.on : ""}`} onClick={() => act(() => liveApi.raiseHand(streamId, !mine?.handRaised))}>
              <span>✋</span>
              <span>{mine?.handRaised ? "Рука поднята" : "Попросить слово"}</span>
            </button>
          ) : null}
          {!isHost ? (
            <button
              type="button"
              className={styles.ctl}
              onClick={() =>
                act(async () => {
                  await leaveLive();
                  closeLive();
                })
              }
            >
              <Icon name="LogOut" size={18} />
              <span>Выйти</span>
            </button>
          ) : null}
          {canStop ? (
            <button
              type="button"
              className={`${styles.ctl} ${styles.danger}`}
              onClick={() =>
                act(async () => {
                  await stopLive();
                  closeLive();
                })
              }
            >
              <Icon name="X" size={18} />
              <span>Завершить эфир</span>
            </button>
          ) : null}
          <VolumeControl className={styles.volume} />
        </div>
      </div>
      <div className={styles.side}>
        <div className={styles.people}>
          <p className={styles.panelTitle}>Участники — {live.participants.length}</p>
          {rows.map((p) => (
            <div key={p.userId} className={styles.person}>
              <Avatar size={28} {...face(p.user)} />
              <div className={styles.personBody}>
                <p className={styles.personName}>
                  {p.user.name}
                  {p.handRaised ? <span>✋</span> : null}
                </p>
                <p className={styles.personRole}>{p.role === "host" ? "ведущий" : p.role === "speaker" ? "говорит" : "смотрит"}</p>
              </div>
              {isHost && !viaObs && p.role !== "host" ? (
                <div className={styles.personActions}>
                  {p.role === "speaker" ? (
                    <button type="button" className={styles.miniBtn} title={p.mutedByHost ? "Разрешить звук" : "Заглушить"} onClick={() => act(() => liveApi.setMuted(streamId, p.userId, !p.mutedByHost))}>
                      {p.mutedByHost ? "🔇" : "🔈"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={`${styles.miniBtn} ${p.role === "speaker" ? styles.miniDanger : styles.miniAccent}`}
                    onClick={() => act(() => liveApi.setRole(streamId, p.userId, p.role === "speaker" ? "viewer" : "speaker"))}
                  >
                    {p.role === "speaker" ? "Забрать слово" : "Дать слово"}
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
        <LiveChat streamId={streamId} messages={live.messages} meId={live.meId} canModerate={isHost || screen.canStopStream || isServerModerator(me)} onError={setError} />
      </div>
    </div>
  );
}

/** Выступающий поверх сцены; с видео его можно отодвинуть. */
function SpeakerTile({ p, stream, fullscreenTarget }: { p: LiveParticipant; stream: MediaStream | null | undefined; fullscreenTarget: RefObject<HTMLDivElement | null> }) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const withVideo = hasLiveVideo(stream);
  const startDrag = (e: PointerEvent<HTMLDivElement>) => {
    const node = e.currentTarget;
    const rect = node.getBoundingClientRect();
    const dx = e.clientX - rect.left;
    const dy = e.clientY - rect.top;
    node.setPointerCapture?.(e.pointerId);
    const move = (ev: globalThis.PointerEvent) =>
      setPos({
        left: Math.min(Math.max(4, ev.clientX - dx), window.innerWidth - rect.width - 4),
        top: Math.min(Math.max(4, ev.clientY - dy), window.innerHeight - rect.height - 4),
      });
    const up = () => {
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", up);
    };
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerup", up);
  };
  const style: CSSProperties | undefined = pos ? { position: "fixed", left: pos.left, top: pos.top, right: "auto", bottom: "auto" } : undefined;
  return (
    <div
      className={[styles.speaker, withVideo ? styles.withVideo : "", p.mutedByHost ? styles.muted : ""].filter(Boolean).join(" ")}
      style={style}
      title={withVideo ? "Перетащите, чтобы отодвинуть · двойное нажатие — на весь экран" : undefined}
      onPointerDown={withVideo ? startDrag : undefined}
      onDoubleClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFullscreen(fullscreenTarget.current);
      }}
    >
      {stream ? <StreamVideo stream={stream} className={styles.video} /> : null}
      {withVideo ? null : <Avatar size={34} {...face(p.user)} />}
      <span className={styles.speakerName}>{p.user.name}</span>
      {p.mutedByHost ? (
        <span className={styles.speakerMute}>
          <Icon name="BellOff" size={12} />
        </span>
      ) : null}
    </div>
  );
}

/** Эфир из OBS: поток FLV со звуком (громкость — общая со звонками). */
function FlvVideo({ url, onStatus }: { url: string; onStatus: (text: string | null) => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    applyVolume(video);
    const unsubscribe = subscribeVolume(() => applyVolume(video));
    const detach = attachFlv(video, url, (state, text) => onStatus(state === "playing" ? null : text));
    return () => {
      unsubscribe();
      detach();
    };
  }, [url, onStatus]);
  return <video ref={ref} className={styles.video} autoPlay playsInline />;
}

function ObsField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const copy = async () => {
    input.current?.select();
    try {
      await navigator.clipboard.writeText(value);
      setCopied("Скопировано");
    } catch {
      setCopied("Выделено — Ctrl+C");
    }
    setTimeout(() => setCopied(null), 2000);
  };
  return (
    <label className={styles.obsField}>
      <span className={styles.obsLabel}>{label}</span>
      <input ref={input} className={styles.obsInput} type="text" value={value} readOnly />
      <button type="button" className={styles.obsCopy} onClick={() => void copy()}>
        {copied ?? "Копировать"}
      </button>
    </label>
  );
}

type ChatProps = { streamId: string; messages: LiveMessage[]; meId: string; canModerate: boolean; onError: (text: string) => void };

/** Чат эфира: отправка, правка своих, удаление своих (ведущий и модераторы — любых). */
function LiveChat({ streamId, messages, meId, canModerate, onError }: ChatProps) {
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<LiveMessage | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [messages]);

  const stopEditing = () => {
    setEditing(null);
    setText("");
  };
  const startEditing = (m: LiveMessage) => {
    setEditing(m);
    setText(m.text);
    input.current?.focus();
  };
  const send = async () => {
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    const was = editing;
    setText("");
    try {
      if (was) {
        await liveApi.editMessage(streamId, was.id, value);
        setEditing(null);
      } else {
        await liveApi.sendMessage(streamId, value);
      }
    } catch (err) {
      if (was) setText(value);
      onError(errorText(err, was ? "Не удалось сохранить" : "Не удалось отправить"));
    }
    setSending(false);
  };
  const remove = async (m: LiveMessage) => {
    if (!(await askConfirm(m.user.id === meId ? "Удалить сообщение?" : `Удалить сообщение ${m.user.name}?`))) return;
    try {
      await liveApi.deleteMessage(streamId, m.id);
      if (editing?.id === m.id) stopEditing();
    } catch (err) {
      onError(errorText(err, "Не удалось удалить"));
    }
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") void send();
    if (e.key === "Escape" && editing) stopEditing();
  };

  return (
    <div className={styles.chat}>
      <p className={styles.panelTitle}>Чат эфира</p>
      <div className={styles.chatList} ref={list}>
        {messages.length ? (
          messages.map((m) => {
            const own = m.user.id === meId;
            const canDelete = own || canModerate;
            return (
              <div key={m.id} className={editing?.id === m.id ? `${styles.chatMsg} ${styles.editingMsg}` : styles.chatMsg}>
                <p>
                  <span className={styles.chatAuthor}>{m.user.name}: </span>
                  {m.text}
                  {m.editedAt ? <span className={styles.edited}> · изм.</span> : null}
                </p>
                {canDelete ? (
                  <div className={styles.msgActions}>
                    {own ? (
                      <button type="button" className={styles.msgAction} title="Изменить" onClick={() => startEditing(m)}>
                        <Icon name="Edit" size={13} />
                      </button>
                    ) : null}
                    <button type="button" className={`${styles.msgAction} ${styles.msgDanger}`} title="Удалить" onClick={() => void remove(m)}>
                      <Icon name="Trash" size={13} />
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })
        ) : (
          <p className={styles.chatEmpty}>Пока никто ничего не написал</p>
        )}
      </div>
      {editing ? (
        <div className={styles.editingBar}>
          <Icon name="Edit" size={13} />
          <span className={styles.editingText}>Изменение: {editing.text}</span>
          <button type="button" className={styles.msgAction} title="Отменить" onClick={stopEditing}>
            <Icon name="X" size={14} />
          </button>
        </div>
      ) : null}
      <div className={styles.chatForm}>
        <input
          ref={input}
          className={styles.chatInput}
          placeholder={editing ? "Изменить сообщение" : "Сообщение в эфир"}
          maxLength={500}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button type="button" className={styles.sendBtn} title={editing ? "Сохранить" : "Отправить"} onClick={() => void send()}>
          <Icon name={editing ? "Check" : "Send"} size={16} />
        </button>
      </div>
    </div>
  );
}
