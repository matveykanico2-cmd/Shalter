import { useEffect, useState } from "react";

import { GestureGate, type GestureId, recognizeGesture } from "../lib/gestures";
import { createHands } from "../lib/mediapipe-hands";

const FRAME_MS = 100; // ~10 кадров в секунду — хватает и не грузит процессор
const COOLDOWN_MS = 3000;
const SHOW_MS = 2800;
const STORAGE_KEY = "shalter.callGestures";

/** «Жесты» в звонке — выбор запоминается на этом устройстве, по умолчанию выключено. */
export function useGesturesEnabled() {
  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const toggle = () =>
    setEnabled((on) => {
      try {
        localStorage.setItem(STORAGE_KEY, on ? "0" : "1");
      } catch {
        // Хранилище недоступно — выбор только на этот звонок.
      }
      return !on;
    });
  return [enabled, toggle] as const;
}

export type ShownGesture = { key: number; gesture: GestureId };

/**
 * Распознавание жестов на своей камере (только у себя на экране, собеседнику не уходит):
 * MediaPipe грузится при первом включении, кадр — раз в 100 мс, жест — не чаще раза в 3 с.
 */
export function useCallGestures(stream: MediaStream | null, enabled: boolean) {
  const [shown, setShown] = useState<ShownGesture | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!enabled || !stream || !stream.getVideoTracks().length) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let hands: Awaited<ReturnType<typeof createHands>> | null = null;
    let seq = 0;
    const gate = new GestureGate(COOLDOWN_MS);
    // Своё скрытое видео: превью может смениться (крупно/в углу), а распознавание — нет.
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    void video.play().catch(() => {});

    // Следующий кадр — только после того, как обработан этот, и не раньше чем через 100 мс;
    // видео ещё не готово — просто ждём следующего раза, без холостого цикла.
    const tick = async () => {
      if (stopped || !hands) return;
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        try {
          await hands.send({ image: video });
        } catch {
          // Кадр не обработался — попробуем следующий.
        }
      }
      if (!stopped) timer = setTimeout(() => void tick(), FRAME_MS);
    };

    createHands().then(
      (h) => {
        if (stopped) return void h.close().catch(() => {});
        hands = h;
        h.onResults((results) => {
          const all = results.multiHandLandmarks ?? [];
          if (!all.length) return gate.reset();
          for (const hand of all) {
            const gesture = recognizeGesture(hand);
            if (gesture && gate.accept(gesture, Date.now())) setShown({ key: ++seq, gesture });
          }
        });
        setFailed(false);
        void tick();
      },
      () => !stopped && setFailed(true)
    );

    return () => {
      stopped = true;
      clearTimeout(timer);
      void hands?.close().catch(() => {});
      video.pause();
      video.srcObject = null;
    };
  }, [enabled, stream]);

  // Показанный жест уходит сам.
  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(null), SHOW_MS);
    return () => clearTimeout(t);
  }, [shown]);

  return { shown: enabled ? shown : null, failed: enabled && failed };
}
