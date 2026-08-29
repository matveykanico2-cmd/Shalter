// Проигрывание эфира, который пришёл на сервер из OBS (server/rtmp.js).
//
// Браузер не умеет FLV сам — поток разбирает библиотека mpegts.js и отдаёт
// его <video> через Media Source Extensions. Библиотека лежит рядом
// (public/js/vendor/mpegts.js) и грузится не сразу, а в момент, когда впервые
// понадобилась: 275 КБ ради экрана, который откроют не все, — плохая сделка,
// если тянуть их с каждой загрузкой приложения.
//
// Обычным import её не подключить: это UMD-сборка, а не модуль, — поэтому
// <script> и window.mpegts.
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
  // MSE нет в обычной вкладке iOS Safari — там этот эфир не посмотреть, и
  // сказать об этом надо словами, а не чёрным прямоугольником.
  return typeof window.MediaSource !== "undefined" && typeof window.MediaSource.isTypeSupported === "function";
}

/**
 * Подключает <video> к потоку эфира. Возвращает функцию отключения.
 *
 * Пересоединение здесь обязательно, а не «на будущее»: ведущий в OBS жмёт
 * «Остановить», меняет сцену, перезапускает программу — поток обрывается, а
 * эфир продолжается. Без повторных попыток зритель после любой такой заминки
 * оставался бы перед застывшим кадром до перезагрузки страницы.
 */
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
        // enableStashBuffer: false и малый порог — это и есть «в прямом эфире»:
        // с накоплением библиотека набирает буфер посекунд, и зритель отстаёт
        // от происходящего на несколько секунд без всякой на то причины.
        { enableStashBuffer: false, stashInitialSize: 128, liveBufferLatencyChasing: true, lazyLoad: false }
      );
      player.attachMediaElement(videoEl);
      player.on(mpegts.Events.ERROR, () => retry());
      player.load();
      videoEl.play().catch(() => {
        // Автовоспроизведение со звуком браузер может и не разрешить — картинка
        // при этом уже идёт, а звук включит сам зритель.
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
      /* уже разрушен */
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
