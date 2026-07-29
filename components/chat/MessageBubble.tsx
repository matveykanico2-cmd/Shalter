"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar } from "../Avatar";
import { Icon } from "../icons";
import { DropdownMenu, MenuItem } from "../DropdownMenu";
import { FormattedText } from "./formatText";
import type { Message, PublicUser } from "@/lib/types";

const QUICK_EMOJI = ["👍", "❤️", "🔥", "😂", "😮", "😢", "🎉", "👏"];

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function AttachmentView({ a }: { a: NonNullable<Message["attachments"]>[number] }) {
  if (a.kind === "image") {
    return (
      <div className="mb-1 flex h-40 w-56 items-center justify-center rounded-lg bg-surface-alt text-muted">
        <Icon.Download size={20} />
        <span className="ml-2 truncate text-sm">{a.name ?? "photo.jpg"}</span>
      </div>
    );
  }
  if (a.kind === "voice") {
    return <VoicePlayer duration={a.durationSec ?? 8} url={a.url} />;
  }
  if (a.kind === "video-note") {
    return <VideoNotePlayer url={a.url} />;
  }
  if (a.kind === "file") {
    return (
      <div className="mb-1 flex items-center gap-2.5 rounded-lg border border-border bg-surface-alt px-3 py-2.5">
        <Icon.Download size={18} className="text-accent" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{a.name ?? "document.pdf"}</p>
          <p className="font-mono text-[11px] text-muted">{a.size ? `${(a.size / 1024).toFixed(0)} КБ` : "Документ"}</p>
        </div>
      </div>
    );
  }
  return null;
}

function VoicePlayer({ duration, url }: { duration: number; url?: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    if (!url) return;
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setT(audio.currentTime);
    const onEnd = () => {
      setPlaying(false);
      setT(0);
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnd);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnd);
    };
  }, [url]);

  function toggle() {
    if (url) {
      const audio = audioRef.current;
      if (!audio) return;
      if (playing) audio.pause();
      else audio.play();
      setPlaying(!playing);
      return;
    }
    // No recorded clip (seed/demo data) — simulate playback progress instead.
    if (playing) {
      setPlaying(false);
      return;
    }
    setPlaying(true);
    setT(0);
    const start = Date.now();
    const iv = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      if (elapsed >= duration) {
        setT(duration);
        setPlaying(false);
        clearInterval(iv);
      } else {
        setT(elapsed);
      }
    }, 100);
  }

  function cycleSpeed() {
    const next = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }

  const pct = Math.min(100, (t / duration) * 100);
  return (
    <div className="mb-1 flex w-56 items-center gap-2.5 rounded-lg bg-surface-alt px-3 py-2.5">
      {url && <audio ref={audioRef} src={url} className="hidden" />}
      <button
        onClick={toggle}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-contrast"
      >
        {playing ? <span className="block h-2.5 w-2.5 bg-current" /> : <Icon.Play size={14} />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="h-1 w-full rounded-full bg-border">
          <div className="h-1 rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1 font-mono text-[11px] tabular-nums text-muted">
          {Math.floor(t)}s / {Math.round(duration)}s
        </p>
      </div>
      {url && (
        <button onClick={cycleSpeed} className="shrink-0 rounded-full bg-surface px-1.5 py-1 font-mono text-[10.5px] text-muted">
          {speed}×
        </button>
      )}
    </div>
  );
}

function VideoNotePlayer({ url }: { url?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  if (!url) {
    return (
      <div className="mb-1 flex h-40 w-40 items-center justify-center rounded-full bg-surface-alt text-muted">
        <Icon.Play size={24} />
      </div>
    );
  }

  function toggle() {
    const video = videoRef.current;
    if (!video) return;
    if (playing) video.pause();
    else video.play();
    setPlaying(!playing);
  }

  return (
    <button onClick={toggle} className="relative mb-1 block h-40 w-40 overflow-hidden rounded-full bg-surface-alt">
      <video
        ref={videoRef}
        src={url}
        className="h-full w-full object-cover"
        onEnded={() => setPlaying(false)}
        playsInline
      />
      {!playing && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/20 text-white">
          <Icon.Play size={28} />
        </span>
      )}
    </button>
  );
}

function PollAttachment({ text, meta }: { text: string; meta: Record<string, unknown> }) {
  const options = (meta.options as string[]) ?? [];
  const initialVotes = (meta.votes as number[]) ?? options.map(() => 0);
  const [votes, setVotes] = useState(initialVotes);
  const [voted, setVoted] = useState<number | null>(null);
  const total = votes.reduce((a, b) => a + b, 0) || 1;

  return (
    <div className="mb-1 w-64 rounded-lg bg-surface-alt p-3">
      <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
        <span aria-hidden>📊</span> {text}
      </p>
      <div className="flex flex-col gap-1.5">
        {options.map((opt, i) => {
          const pct = Math.round((votes[i] / total) * 100);
          return (
            <button
              key={i}
              onClick={() => {
                if (voted !== null) return;
                setVotes((v) => v.map((x, idx) => (idx === i ? x + 1 : x)));
                setVoted(i);
              }}
              className="relative overflow-hidden rounded-md border border-border bg-surface px-2.5 py-1.5 text-left text-[13px]"
            >
              {voted !== null && (
                <span
                  className="absolute inset-y-0 left-0 bg-accent-soft"
                  style={{ width: `${pct}%` }}
                />
              )}
              <span className="relative flex justify-between">
                <span>{opt}</span>
                {voted !== null && <span className="font-mono tabular-nums text-muted">{pct}%</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function MessageBubble({
  message,
  me,
  sender,
  showSender,
  replyToMessage,
  onReply,
  onEdit,
  onDelete,
  onReact,
  onPin,
  onJumpTo,
  onForward,
}: {
  message: Message;
  me: PublicUser;
  sender: PublicUser | undefined;
  showSender: boolean;
  replyToMessage: Message | undefined;
  onReply: (m: Message) => void;
  onEdit: (m: Message) => void;
  onDelete: (m: Message) => void;
  onReact: (m: Message, emoji: string) => void;
  onPin: (m: Message) => void;
  onJumpTo: (id: string) => void;
  onForward: (m: Message) => void;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [emojiPicker, setEmojiPicker] = useState(false);
  const mine = message.senderId === me.id;

  if (message.type === "system") {
    return <div className="my-2 flex justify-center text-center text-xs text-muted">{message.text}</div>;
  }

  return (
    <div id={`msg-${message.id}`} className={`group flex gap-2 px-4 py-0.5 ${mine ? "flex-row-reverse" : ""}`}>
      {!mine && (
        <div className="w-8 shrink-0">
          {showSender && sender && (
            <Avatar name={sender.name} color={sender.avatarColor} image={sender.avatarImage} size={28} />
          )}
        </div>
      )}
      <div className={`flex max-w-[70%] flex-col ${mine ? "items-end" : "items-start"}`}>
        {showSender && !mine && sender && (
          <span className="mb-0.5 px-1 text-[12.5px] font-medium text-accent">{sender.name}</span>
        )}
        <div className="relative">
          <div
            className={`rounded-2xl px-3.5 py-2 ${
              mine ? "rounded-tr-sm bg-bubble-out" : "rounded-tl-sm bg-bubble-in"
            } ${message.deleted ? "italic text-muted" : "text-text"} border border-border/60 shadow-sm`}
          >
            {message.forwardedFrom && !message.deleted && (
              <p className="mb-1 flex items-center gap-1 text-[12px] text-muted">
                <Icon.Forward size={12} /> Переслано от {message.forwardedFrom.senderName}
              </p>
            )}
            {replyToMessage && !message.deleted && (
              <button
                onClick={() => onJumpTo(replyToMessage.id)}
                className="mb-1.5 block w-full rounded-md border-l-2 border-accent bg-black/[0.03] px-2 py-1 text-left text-[12.5px] text-muted"
              >
                <span className="line-clamp-1">{replyToMessage.text || "Медиа"}</span>
              </button>
            )}
            {message.attachments?.map((a, i) =>
              a.kind === "poll" ? (
                <PollAttachment key={i} text={message.text} meta={a.meta as Record<string, unknown>} />
              ) : (
                <AttachmentView key={i} a={a} />
              )
            )}
            {message.deleted ? (
              "Сообщение удалено"
            ) : message.attachments?.some((a) => a.kind === "poll") ? null : (
              <span className="whitespace-pre-wrap text-[14.5px] leading-relaxed">
                <FormattedText text={message.text} />
              </span>
            )}
            <span className="mt-0.5 flex items-center justify-end gap-1 text-[10.5px] text-muted">
              {message.editedAt && <span>изменено</span>}
              <span className="font-mono tabular-nums">{timeLabel(message.createdAt)}</span>
              {typeof message.views === "number" && (
                <span className="font-mono tabular-nums">· {message.views} 👁</span>
              )}
              {mine && (
                <>
                  {message.readByIds.length > 1 ? (
                    <Icon.CheckCheck size={13} className="text-accent" />
                  ) : (
                    <Icon.Check size={13} />
                  )}
                </>
              )}
            </span>
          </div>

          {!message.deleted && (
            <div
              className={`pointer-events-none absolute top-0 flex -translate-y-1/2 items-center gap-0.5 rounded-full border border-border bg-surface p-0.5 opacity-0 shadow-sm transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 ${
                mine ? "right-2" : "left-2"
              }`}
            >
              <button
                onClick={() => setEmojiPicker((v) => !v)}
                className="rounded-full p-1.5 text-muted hover:bg-surface-alt hover:text-text"
                title="Реакция"
              >
                <Icon.Smile size={15} />
              </button>
              <button
                onClick={() => onReply(message)}
                className="rounded-full p-1.5 text-muted hover:bg-surface-alt hover:text-text"
                title="Ответить"
              >
                <Icon.Reply size={15} />
              </button>
              <button
                onClick={(e) => setMenu({ x: e.clientX, y: e.clientY })}
                className="rounded-full p-1.5 text-muted hover:bg-surface-alt hover:text-text"
                title="Ещё"
              >
                <Icon.More size={15} />
              </button>
            </div>
          )}

          {emojiPicker && (
            <div
              className={`absolute z-10 flex gap-0.5 rounded-full border border-border bg-surface p-1 shadow-lg ${
                mine ? "right-0" : "left-0"
              } -top-11`}
            >
              {QUICK_EMOJI.map((e) => (
                <button
                  key={e}
                  onClick={() => {
                    onReact(message, e);
                    setEmojiPicker(false);
                  }}
                  className="rounded-full p-1 text-base hover:bg-surface-alt"
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>

        {message.reactions.length > 0 && (
          <div className={`mt-1 flex flex-wrap gap-1 ${mine ? "justify-end" : "justify-start"}`}>
            {message.reactions.map((r) => (
              <button
                key={r.emoji}
                onClick={() => onReact(message, r.emoji)}
                className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs ${
                  r.userIds.includes(me.id) ? "border-accent bg-accent-soft" : "border-border bg-surface"
                }`}
              >
                <span>{r.emoji}</span>
                <span className="font-mono tabular-nums text-muted">{r.userIds.length}</span>
              </button>
            ))}
          </div>
        )}

        {message.keyboard && (
          <div className="mt-1.5 flex flex-col gap-1">
            {message.keyboard.map((row, i) => (
              <div key={i} className="flex gap-1.5">
                {row.map((btn, j) => (
                  <button
                    key={j}
                    onClick={() => onReply({ ...message, text: btn.action } as Message)}
                    className="rounded-lg border border-border bg-surface px-3 py-1.5 text-[13px] text-accent hover:bg-surface-alt"
                  >
                    {btn.text}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {menu && (
        <DropdownMenu pos={menu} onClose={() => setMenu(null)}>
          <MenuItem
            icon={<Icon.Pin size={16} />}
            onClick={() => {
              onPin(message);
              setMenu(null);
            }}
          >
            {message.pinned ? "Открепить" : "Закрепить"}
          </MenuItem>
          <MenuItem
            icon={<Icon.Forward size={16} />}
            onClick={() => {
              onForward(message);
              setMenu(null);
            }}
          >
            Переслать
          </MenuItem>
          {mine && (
            <MenuItem
              icon={<Icon.Edit size={16} />}
              onClick={() => {
                onEdit(message);
                setMenu(null);
              }}
            >
              Изменить
            </MenuItem>
          )}
          {mine && (
            <MenuItem
              danger
              icon={<Icon.Trash size={16} />}
              onClick={() => {
                onDelete(message);
                setMenu(null);
              }}
            >
              Удалить
            </MenuItem>
          )}
        </DropdownMenu>
      )}
    </div>
  );
}
