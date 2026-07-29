"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "../icons";
import { api } from "@/lib/client/api";
import type { Message } from "@/lib/types";

const EMOJI = ["😀", "😂", "😍", "👍", "🙏", "🔥", "🎉", "😢", "😮", "❤️", "👏", "🤔"];
const MAX_RECORD_SEC = 20; // keeps base64 clips reasonably sized for JSON storage

type RecordMode = "voice" | "video-note";

const TYPING_PING_MS = 2500; // well under the server's 4s expiry, so a steady typer never lapses

export function Composer({
  chatId,
  replyingTo,
  editingMessage,
  onCancelReply,
  onCancelEdit,
  onSend,
  onSaveEdit,
}: {
  chatId: string;
  replyingTo: Message | null;
  editingMessage: Message | null;
  onCancelReply: () => void;
  onCancelEdit: () => void;
  onSend: (text: string, attachments?: Message["attachments"]) => void;
  onSaveEdit: (text: string) => void;
}) {
  const [text, setText] = useState(editingMessage?.text ?? "");
  const lastTypingPingRef = useRef(0);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const [recording, setRecording] = useState<RecordMode | null>(null);
  const [recordSec, setRecordSec] = useState(0);
  const [recordError, setRecordError] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const recordTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  // Recorder callbacks close over stale state, so mirror the timer in a ref.
  const recordSecRef = useRef(0);

  useEffect(() => {
    recordSecRef.current = recordSec;
  }, [recordSec]);

  useEffect(() => {
    if (editingMessage) taRef.current?.focus();
  }, [editingMessage]);

  useEffect(() => {
    if (replyingTo) taRef.current?.focus();
  }, [replyingTo]);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 240) + "px";
  }, [text]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (recordTimer.current) clearInterval(recordTimer.current);
      if (autoStopTimer.current) clearTimeout(autoStopTimer.current);
    };
  }, []);

  function submit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (editingMessage) onSaveEdit(trimmed);
    else onSend(trimmed);
    setText("");
  }

  function handleTextChange(v: string) {
    setText(v);
    if (!editingMessage && v.trim() && Date.now() - lastTypingPingRef.current > TYPING_PING_MS) {
      lastTypingPingRef.current = Date.now();
      api.sendTyping(chatId).catch(() => {});
    }
  }

  function stopTracks() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function startRecording(mode: RecordMode) {
    setRecordError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setRecordError("Запись недоступна в этом браузере");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        mode === "voice" ? { audio: true } : { audio: true, video: { width: 240, height: 240 } }
      );
      streamRef.current = stream;
      if (mode === "video-note" && videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
      }
      const mimeType = mode === "voice" ? "audio/webm" : "video/webm";
      const recorder = new MediaRecorder(stream, MediaRecorder.isTypeSupported(mimeType) ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType });
        const url = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
        stopTracks();
        onSend("", [
          {
            kind: mode === "voice" ? "voice" : "video-note",
            url,
            mimeType: blob.type,
            durationSec: recordSecRef.current,
          },
        ]);
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(mode);
      setRecordSec(0);
      recordTimer.current = setInterval(() => setRecordSec((s) => s + 1), 1000);
      autoStopTimer.current = setTimeout(() => finishRecording(), MAX_RECORD_SEC * 1000);
    } catch {
      setRecordError("Нет доступа к микрофону или камере");
    }
  }

  function finishRecording() {
    if (recordTimer.current) clearInterval(recordTimer.current);
    if (autoStopTimer.current) clearTimeout(autoStopTimer.current);
    recorderRef.current?.stop();
    setRecording(null);
  }

  function cancelRecording() {
    if (recordTimer.current) clearInterval(recordTimer.current);
    if (autoStopTimer.current) clearTimeout(autoStopTimer.current);
    if (recorderRef.current) {
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
    }
    stopTracks();
    setRecording(null);
  }

  return (
    <div className="border-t border-border bg-surface px-3 py-2.5">
      {(replyingTo || editingMessage) && (
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-surface-alt px-3 py-1.5">
          {editingMessage ? <Icon.Edit size={15} className="text-accent" /> : <Icon.Reply size={15} className="text-accent" />}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-accent">{editingMessage ? "Редактирование" : "Ответ"}</p>
            <p className="truncate text-[13px] text-muted">{(editingMessage ?? replyingTo)?.text}</p>
          </div>
          <button
            onClick={editingMessage ? onCancelEdit : onCancelReply}
            className="rounded-full p-1 text-muted hover:bg-border"
          >
            <Icon.X size={14} />
          </button>
        </div>
      )}

      {recordError && <p className="mb-2 text-xs text-danger">{recordError}</p>}

      {recording ? (
        <div className="flex items-center gap-3 rounded-full bg-surface-alt px-4 py-2.5">
          {recording === "video-note" && (
            <video ref={videoPreviewRef} autoPlay muted className="h-9 w-9 rounded-full object-cover" />
          )}
          <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-danger" />
          <span className="font-mono text-sm tabular-nums">
            {recordSec}s / {MAX_RECORD_SEC}s
          </span>
          <span className="flex-1 text-sm text-muted">
            {recording === "voice" ? "Запись голосового…" : "Запись видео-сообщения…"}
          </span>
          <button onClick={cancelRecording} className="rounded-full p-1.5 text-muted hover:bg-border">
            <Icon.X size={16} />
          </button>
          <button onClick={finishRecording} className="rounded-full bg-accent px-3 py-1.5 text-sm text-accent-contrast">
            Отправить
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-1.5">
          <div className="relative">
            <button
              onClick={() => setShowAttach((v) => !v)}
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface-alt hover:text-text"
              title="Вложение"
            >
              <Icon.Paperclip size={19} />
            </button>
            {showAttach && (
              <div className="absolute bottom-11 left-0 z-10 w-44 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-lg">
                {["Фото или видео", "Файл", "Опрос", "Геолокация", "Контакт"].map((label) => (
                  <button
                    key={label}
                    onClick={() => {
                      setText((t) => (t ? t : `[${label}]`));
                      setShowAttach(false);
                    }}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-alt"
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative flex-1">
            <textarea
              ref={taRef}
              rows={1}
              value={text}
              onChange={(e) => handleTextChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="Сообщение"
              className="w-full resize-none rounded-2xl border border-border bg-surface-alt px-4 py-2 text-[14.5px] leading-relaxed text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <div className="relative">
            <button
              onClick={() => setShowEmoji((v) => !v)}
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface-alt hover:text-text"
              title="Эмодзи"
            >
              <Icon.Smile size={19} />
            </button>
            {showEmoji && (
              <div className="absolute bottom-11 right-0 z-10 grid w-56 grid-cols-6 gap-1 rounded-xl border border-border bg-surface p-2 shadow-lg">
                {EMOJI.map((e) => (
                  <button
                    key={e}
                    onClick={() => setText((t) => t + e)}
                    className="rounded-lg p-1.5 text-lg hover:bg-surface-alt"
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>

          {text.trim() ? (
            <button
              onClick={submit}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-contrast"
              title="Отправить"
            >
              <Icon.Send size={17} />
            </button>
          ) : (
            <>
              <button
                onClick={() => startRecording("video-note")}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-alt hover:text-text"
                title="Видео-сообщение"
              >
                <Icon.Video size={19} />
              </button>
              <button
                onClick={() => startRecording("voice")}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-alt hover:text-text"
                title="Голосовое сообщение"
              >
                <Icon.Mic size={19} />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
