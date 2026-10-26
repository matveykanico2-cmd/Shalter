// Эфир из OBS — поток FLV с сервера, как public/js/lib/flvPlayer.js. Проигрыватель mpegts.js
// отдаёт бэкенд (в разработке — через прокси Vite) и грузится только при первом таком эфире.

type MpegtsPlayer = { attachMediaElement(el: HTMLMediaElement): void; on(event: string, fn: () => void): void; load(): void; destroy(): void };
type Mpegts = {
  createPlayer(source: { type: "flv"; isLive: boolean; url: string }, config: Record<string, unknown>): MpegtsPlayer;
  Events: { ERROR: string };
};

const VENDOR_URL = "/js/vendor/mpegts.js";
let loading: Promise<Mpegts> | null = null;

const loaded = () => (window as unknown as { mpegts?: Mpegts }).mpegts;

function loadLibrary(): Promise<Mpegts> {
  const ready = loaded();
  if (ready) return Promise.resolve(ready);
  loading ??= new Promise<Mpegts>((resolve, reject) => {
    const tag = document.createElement("script");
    tag.src = VENDOR_URL;
    tag.onload = () => {
      const lib = loaded();
      if (lib) resolve(lib);
      else reject(new Error("mpegts не загрузился"));
    };
    tag.onerror = () => {
      loading = null;
      reject(new Error("Не удалось загрузить проигрыватель"));
    };
    document.head.appendChild(tag);
  });
  return loading;
}

export const isFlvSupported = () => typeof window.MediaSource !== "undefined" && typeof window.MediaSource.isTypeSupported === "function";

export type FlvStatus = "playing" | "waiting" | "error";

/** Подключить поток к <video>; пока вещания нет — пробует снова раз в 3 с. Возвращает отключение. */
export function attachFlv(video: HTMLVideoElement, url: string, onStatus: (state: FlvStatus, text: string | null) => void) {
  let player: MpegtsPlayer | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  function destroyPlayer() {
    if (!player) return;
    try {
      player.destroy();
    } catch {
      // Уже разрушен.
    }
    player = null;
  }

  function retry() {
    if (stopped || retryTimer) return;
    destroyPlayer();
    onStatus("waiting", "Ждём вещание из программы…");
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      void connect();
    }, 3000);
  }

  async function connect() {
    if (stopped) return;
    try {
      const mpegts = await loadLibrary();
      if (stopped) return;
      player = mpegts.createPlayer({ type: "flv", isLive: true, url }, { enableStashBuffer: false, stashInitialSize: 128, liveBufferLatencyChasing: true, lazyLoad: false });
      player.attachMediaElement(video);
      player.on(mpegts.Events.ERROR, retry);
      player.load();
      video.play().catch(() => {
        // Автозапуск со звуком запрещён — запустится по нажатию.
      });
      onStatus("playing", null);
    } catch (err) {
      onStatus("error", err instanceof Error && err.message ? err.message : "Не удалось подключиться к эфиру");
      retry();
    }
  }

  void connect();
  return () => {
    stopped = true;
    clearTimeout(retryTimer);
    destroyPlayer();
  };
}
