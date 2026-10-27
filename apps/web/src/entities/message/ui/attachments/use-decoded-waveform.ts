import { type RefObject, useEffect, useState } from "react";

import { decodeWaveform } from "@/shared/lib/media/waveform";

/**
 * Осциллограмма старого голосового, где её не сохранили: считается из файла, когда
 * пузырь показался на экране (как waveObserver в messageBubble.js). Пока не готова
 * или не вышла — null, и столбики остаются ровными.
 */
export function useDecodedWaveform(ref: RefObject<HTMLElement | null>, url: string | undefined, enabled: boolean) {
  const [wave, setWave] = useState<{ url: string; levels: number[] } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!enabled || !url || !el || typeof IntersectionObserver !== "function") return;
    let alive = true;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      observer.disconnect();
      void decodeWaveform(url).then((levels) => {
        if (alive && levels) setWave({ url, levels });
      });
    });
    observer.observe(el);
    return () => {
      alive = false;
      observer.disconnect();
    };
  }, [ref, url, enabled]);

  return enabled && wave && wave.url === url ? wave.levels : null;
}
