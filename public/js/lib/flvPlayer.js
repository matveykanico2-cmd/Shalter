const VENDOR_URL = "/js/vendor/mpegts.js";
let loading = null;

function loadLibrary() {
  if (window.mpegts) return Promise.resolve(window.mpegts);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const tag = document.createElement("script");
    tag.src = VENDOR_URL;
    tag.onload = () => (window.mpegts ? resolve(window.mpegts) : reject(new Error("mpegts не загрузился")));
    tag.onerror = () => reject(new Error("Не удалось загрузить проигрыватель"));
    document.head.appendChild(tag);
  });
  return loading;
}

export function isFlvSupported() {
  return typeof window.MediaSource !== "undefined" && typeof window.MediaSource.isTypeSupported === "function";
}

export function attachFlv(videoEl, url, { onStatus } = {}) {
  let player = null;
  let retryTimer = null;
  let stopped = false;
  const say = (state, text) => onStatus?.(state, text);

  async function connect() {
    if (stopped) return;
    try {
      const mpegts = await loadLibrary();
      if (stopped) return;
      player = mpegts.createPlayer(
        { type: "flv", isLive: true, url },
        { enableStashBuffer: false, stashInitialSize: 128, liveBufferLatencyChasing: true, lazyLoad: false }
      );
      player.attachMediaElement(videoEl);
      player.on(mpegts.Events.ERROR, () => retry());
      player.load();
      videoEl.play().catch(() => {
      });
      say("playing", null);
    } catch (err) {
      say("error", err.message || "Не удалось подключиться к эфиру");
      retry();
    }
  }

  function retry() {
    if (stopped || retryTimer) return;
    destroyPlayer();
    say("waiting", "Ждём вещание из программы…");
    retryTimer = setTimeout(() => {
      retryTimer = null;
      connect();
    }, 3000);
  }

  function destroyPlayer() {
    if (!player) return;
    try {
      player.destroy();
    } catch {
    }
    player = null;
  }

  connect();

  return () => {
    stopped = true;
    clearTimeout(retryTimer);
    destroyPlayer();
  };
}
