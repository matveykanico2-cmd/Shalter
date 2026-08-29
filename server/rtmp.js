const NodeMediaServer = require("node-media-server");
const context = require("node-media-server/src/node_core_ctx");
const live = require("./data/liveStreams");

// Приём эфира из внешней программы: OBS Studio, Streamlabs, vMix — всё, что
// умеет «Custom RTMP», то есть примерно всё.
//
// Зачем вообще второй способ вещать, когда есть демонстрация экрана из
// браузера: OBS — это сцены, переходы, наложения, игра с камерой в углу и
// нормальный звук с микшера. Браузер так не умеет и не будет.
//
// Как это устроено:
//
//   OBS ──RTMP:1935──► этот сервер ──HTTP-FLV:127.0.0.1──► прокси в routes/live.js ──► зритель
//
// Картинка не перекодируется вообще: что прислал OBS, то и уходит зрителю,
// только переложенное из RTMP в FLV. Поэтому здесь не нужен ffmpeg (его нет ни
// в зависимостях, ни на сервере) и не тратится процессор — иначе один эфир в
// 1080p съедал бы ядро целиком.
//
// Цена решения: FLV в браузере проигрывается не сам по себе, а разбирается
// библиотекой (public/js/vendor/mpegts.js) и скармливается Media Source
// Extensions. Это работает везде, кроме iOS Safari, где MSE в обычной вкладке
// нет. Честная альтернатива — HLS, но он требует ffmpeg и добавляет 5–15 секунд
// задержки вместо нынешних одной-двух.
//
// Задержка: ~1–2 секунды. Это больше, чем у эфира из браузера (WebRTC,
// доли секунды), и несравнимо меньше, чем у HLS.

// Внутренний HTTP — тот, с которого прокси забирает картинку. Зрители ходят не
// сюда, а на /api/live/:id/feed.flv, где проверяется, что человек вообще
// состоит в чате.
//
// Здесь важная поправка к желаемому: node-media-server версии 2 **игнорирует**
// host в настройках и слушает на всех интерфейсах. Проверено — порт виден по
// сетевому адресу машины. Поэтому доступ закрыт не привязкой к петле, а
// проверкой в prePlay ниже: с любого адреса, кроме локального, соединение
// разрывается до первого байта (тоже проверено: с петли приходит мегабайт, с
// адреса в сети — ноль). Порт 8010 всё равно стоит закрыть на файрволе — см.
// DEPLOY.md; лишний открытый порт не нужен, даже когда он ничего не отдаёт.
const RTMP_PORT = Number(process.env.RTMP_PORT || 1935);
const RTMP_HTTP_PORT = Number(process.env.RTMP_HTTP_PORT || 8010);
const RTMP_HTTP_HOST = "127.0.0.1";

// Ключ приходит из чужих рук — из поля в OBS, — и попадает в SQL и в путь
// внутреннего запроса. Пускаем дальше только то, что сами и выдали: 32 знака
// из шестнадцатеричных.
const KEY_RE = /^[a-f0-9]{32}$/;

let nms = null;
let onChange = () => {};

function streamKeyFromPath(streamPath) {
  // node-media-server отдаёт путь целиком: "/live/<ключ>".
  const key = String(streamPath ?? "").split("/").filter(Boolean).pop() ?? "";
  return KEY_RE.test(key) ? key : null;
}

function start({ onStreamChange } = {}) {
  if (nms) return nms;
  onChange = typeof onStreamChange === "function" ? onStreamChange : () => {};

  nms = new NodeMediaServer({
    // Тишина в логах: node-media-server по умолчанию печатает каждый кадр
    // уровня "debug" и топит в этом весь остальной вывод сервера.
    logType: 1,
    rtmp: {
      port: RTMP_PORT,
      chunk_size: 60000,
      gop_cache: true,
      ping: 30,
      ping_timeout: 60,
    },
    http: { port: RTMP_HTTP_PORT, host: RTMP_HTTP_HOST, allow_origin: "*", mediaroot: "./data/rtmp" },
  });

  // Пускать или не пускать. Единственная защита вещания: ключ знает только
  // ведущий, которому его показали. Неизвестный ключ — соединение рвётся сразу,
  // до первого кадра.
  nms.on("prePublish", (id, streamPath) => {
    const session = nms.getSession(id);
    const key = streamKeyFromPath(streamPath);
    const stream = key ? live.getLiveStreamByKey(key) : null;
    if (!stream || stream.source !== "rtmp") {
      session?.reject?.();
      return;
    }
    live.setRtmpLive(stream.id, true);
    onChange(stream, true);
  });

  nms.on("donePublish", (id, streamPath) => {
    const key = streamKeyFromPath(streamPath);
    const stream = key ? live.getLiveStreamByKey(key) : null;
    if (!stream) return;
    // Эфир не заканчиваем: программу могли перезапустить, а чат и собравшиеся
    // зрители при этом никуда не делись. Гасим только «на связи».
    live.setRtmpLive(stream.id, false);
    onChange(stream, false);
  });

  // Смотреть напрямую по внутреннему адресу нельзя даже с петли: зритель обязан
  // пройти через прокси, который проверит, что он состоит в чате. Играть роль
  // зрителя здесь может только сам прокси, поэтому просто запрещаем всё, кроме
  // запросов с локальной машины.
  nms.on("prePlay", (id) => {
    const session = nms.getSession(id);
    const ip = String(session?.ip ?? "");
    if (!ip.includes("127.0.0.1") && !ip.includes("::1")) session?.reject?.();
  });

  nms.run();
  return nms;
}

// Отключить вещающую программу. Нужно на «Завершить эфир»: сам по себе OBS об
// этом не узнает и продолжит заливать картинку в закончившийся эфир — часами,
// если ведущий закрыл вкладку и ушёл. Отдельная защита от повторного входа
// здесь тоже есть (prePublish не пустит на завершённый эфир), но она сработает
// только при переподключении, а текущее соединение живёт своей жизнью.
function stopPublisher(streamKey) {
  if (!nms || !KEY_RE.test(String(streamKey ?? ""))) return false;
  const sessionId = context.publishers.get(`/live/${streamKey}`);
  const session = sessionId ? context.sessions.get(sessionId) : null;
  if (!session) return false;
  // stop() у RTMP-сессии — «закончить по-хорошему»; reject() рвёт соединение и
  // есть у обеих разновидностей сессий, поэтому берём то, что найдётся.
  (session.stop ?? session.reject)?.call(session);
  return true;
}

// Адрес, по которому прокси забирает поток. Внутренний, наружу не отдаётся.
function internalFlvUrl(streamKey) {
  if (!KEY_RE.test(String(streamKey ?? ""))) return null;
  return `http://${RTMP_HTTP_HOST}:${RTMP_HTTP_PORT}/live/${streamKey}.flv`;
}

// Что показать ведущему, чтобы он вставил это в OBS. Хост берётся из адреса,
// по которому он открыл приложение: сервер сам не знает, под каким именем к
// нему приходят снаружи, а угадывать в этом месте нельзя — человек скопирует
// адрес, по которому не достучится.
function ingestUrlFor(requestHost) {
  const host = String(requestHost ?? "").split(":")[0] || "localhost";
  return `rtmp://${host}:${RTMP_PORT}/live`;
}

module.exports = { start, internalFlvUrl, ingestUrlFor, stopPublisher, RTMP_PORT, KEY_RE };
