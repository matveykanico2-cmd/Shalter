import { api } from "../api.js";

// Статус «что я сейчас делаю» в чате — «записывает голосовое», «отправляет
// фото», «выбирает стикер» (server/data/typing.js). Сервер держит статус
// четыре секунды, поэтому, пока действие идёт, он повторяется каждые 2.5 с, а
// когда кончилось — снимается сразу, не дожидаясь, пока истечёт сам.
//
// В одном чате может идти несколько действий сразу: грузится видео, а человек
// уже пишет подпись к следующему. Собеседник видит последнее начатое; когда
// оно кончается, снова виден предыдущий, а «отменить» уходит, только когда не
// осталось ни одного.
const PING_MS = 2500;

// Как это читается в шапке чата. Для группы перед текстом ставится имя.
export const CHAT_ACTION_LABELS = {
  typing: "печатает",
  choose_sticker: "выбирает стикер",
  upload_photo: "отправляет фото",
  record_video: "записывает видео",
  upload_video: "отправляет видео",
  record_voice: "записывает голосовое",
  upload_voice: "отправляет голосовое",
  upload_document: "отправляет файл",
  record_video_note: "записывает кружок",
  upload_video_note: "отправляет кружок",
};

// chatId → { stack: [{ action, anchor }], timer }
const active = new Map();

function finish(chatId, state) {
  clearInterval(state.timer);
  active.delete(chatId);
  api.sendTyping(chatId, "cancel").catch(() => {});
}

function ping(chatId) {
  const state = active.get(chatId);
  if (!state) return;
  // Действие, привязанное к элементу, который уже убран со страницы (ушли из
  // чата с открытой панелью стикеров, поле ввода перерисовалось посреди
  // записи), кончилось, даже если его забыли остановить, — иначе статус
  // висел бы до закрытия вкладки.
  state.stack = state.stack.filter((e) => !e.anchor || e.anchor.isConnected);
  const top = state.stack[state.stack.length - 1];
  if (top) api.sendTyping(chatId, top.action).catch(() => {});
  else finish(chatId, state);
}

// Начинает действие; возвращает функцию, которая его заканчивает (повторный
// вызов ничего не делает). anchor — необязательный элемент страницы: пока он
// в документе, действие живо.
export function startChatAction(chatId, action, anchor = null) {
  if (!chatId) return () => {};
  let state = active.get(chatId);
  if (!state) {
    state = { stack: [], timer: null };
    active.set(chatId, state);
  }
  const entry = { action, anchor };
  state.stack.push(entry);
  ping(chatId);
  // anchor уже не в документе — первый же ping всё закрыл, таймер не нужен.
  if (active.get(chatId) !== state) return () => {};
  if (!state.timer) state.timer = setInterval(() => ping(chatId), PING_MS);

  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    // Состояние могло уже закончиться само — по отвалившемуся anchor.
    if (active.get(chatId) !== state) return;
    const i = state.stack.indexOf(entry);
    if (i === -1) return;
    state.stack.splice(i, 1);
    if (state.stack.length) ping(chatId);
    else finish(chatId, state);
  };
}

// Держит статус, пока не выполнится promise, — для загрузок. Возвращает тот
// же promise, чтобы обёртку можно было поставить прямо в цепочку.
export function withChatAction(chatId, action, promise) {
  const stop = startChatAction(chatId, action);
  promise.then(stop, stop);
  return promise;
}

// Какой статус показывать для пачки вложений: видео важнее фото, всё прочее —
// «отправляет файл».
export function uploadActionFor(kinds) {
  if (kinds.includes("video")) return "upload_video";
  if (kinds.length && kinds.every((k) => k === "image")) return "upload_photo";
  if (kinds.includes("voice")) return "upload_voice";
  if (kinds.includes("video-note")) return "upload_video_note";
  return "upload_document";
}
