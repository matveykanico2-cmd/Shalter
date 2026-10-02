import { api } from "../api.js";

const PING_MS = 2500;

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

const active = new Map();

function finish(chatId, state) {
  clearInterval(state.timer);
  active.delete(chatId);
  api.sendTyping(chatId, "cancel").catch(() => {});
}

function ping(chatId) {
  const state = active.get(chatId);
  if (!state) return;
  state.stack = state.stack.filter((e) => !e.anchor || e.anchor.isConnected);
  const top = state.stack[state.stack.length - 1];
  if (top) api.sendTyping(chatId, top.action).catch(() => {});
  else finish(chatId, state);
}

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
  if (active.get(chatId) !== state) return () => {};
  if (!state.timer) state.timer = setInterval(() => ping(chatId), PING_MS);

  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    if (active.get(chatId) !== state) return;
    const i = state.stack.indexOf(entry);
    if (i === -1) return;
    state.stack.splice(i, 1);
    if (state.stack.length) ping(chatId);
    else finish(chatId, state);
  };
}

export function withChatAction(chatId, action, promise) {
  const stop = startChatAction(chatId, action);
  promise.then(stop, stop);
  return promise;
}

export function uploadActionFor(kinds) {
  if (kinds.includes("video")) return "upload_video";
  if (kinds.length && kinds.every((k) => k === "image")) return "upload_photo";
  if (kinds.includes("voice")) return "upload_voice";
  if (kinds.includes("video-note")) return "upload_video_note";
  return "upload_document";
}
