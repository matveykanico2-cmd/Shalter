import { type PointerEvent, type RefObject, useRef } from "react";

import type { RecordMode } from "@/shared/lib/media/recorder";
import { Icon } from "@/shared/ui";

import styles from "./recording.module.css";
import type { HoldControl } from "./recording-bar";

const HOLD_MS = 450;

type Props = {
  /** Идёт запись с удержанием — видна только та кнопка, что её начала. */
  holdingMode: RecordMode | null;
  holdControlRef: RefObject<HoldControl | null>;
  onStart: (mode: RecordMode, hold: boolean) => void;
};

/** Кнопки записи кружка и голосового: нажатие — запись без рук, удержание — до отпускания. */
export function RecordButtons({ holdingMode, holdControlRef, onStart }: Props) {
  return (
    <>
      {!holdingMode || holdingMode === "video-note" ? <RecordButton mode="video-note" title="Видео-сообщение" holdControlRef={holdControlRef} onStart={onStart} /> : null}
      {!holdingMode || holdingMode === "voice" ? <RecordButton mode="voice" title="Голосовое сообщение" holdControlRef={holdControlRef} onStart={onStart} /> : null}
    </>
  );
}

function RecordButton({ mode, title, holdControlRef, onStart }: { mode: RecordMode; title: string; holdControlRef: RefObject<HoldControl | null>; onStart: Props["onStart"] }) {
  const press = useRef<{ id: number; x: number; y: number; timer?: ReturnType<typeof setTimeout>; held: boolean } | null>(null);
  const suppressClick = useRef(false);

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const p = { id: e.pointerId, x: e.clientX, y: e.clientY, held: false, timer: undefined as ReturnType<typeof setTimeout> | undefined };
    p.timer = setTimeout(() => {
      p.held = true;
      onStart(mode, true);
    }, HOLD_MS);
    press.current = p;
  };
  const onPointerMove = (e: PointerEvent) => {
    const p = press.current;
    if (p?.held && e.pointerId === p.id) holdControlRef.current?.move(e.clientX - p.x, e.clientY - p.y);
  };
  const end = (e: PointerEvent, how: "up" | "cancel") => {
    const p = press.current;
    if (!p || e.pointerId !== p.id) return;
    press.current = null;
    clearTimeout(p.timer);
    if (!p.held) return;
    suppressClick.current = true;
    if (how === "up") holdControlRef.current?.release();
    else holdControlRef.current?.lock();
  };

  return (
    <button
      type="button"
      className={styles.recordButton}
      title={`${title}: нажмите — запись без рук, удерживайте — запись до отпускания`}
      aria-label={title}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => end(e, "up")}
      onPointerCancel={(e) => end(e, "cancel")}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        if (suppressClick.current) {
          suppressClick.current = false;
          return;
        }
        onStart(mode, false);
      }}
    >
      <Icon name={mode === "voice" ? "Mic" : "Video"} size={20} />
    </button>
  );
}
