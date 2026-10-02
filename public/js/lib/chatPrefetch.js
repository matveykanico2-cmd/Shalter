import { api } from "../api.js";
import { getState } from "../state.js";
import { readCache, writeCache } from "./localCache.js";

export const CHAT_PAGE_SIZE = 60;
const inflight = new Map();
const warmedAt = new Map();
const FRESH_MS = 20_000;

export function prefetchChat(chat) {
  if (!chat?.id || chat.unreadCount > 0) return;
  const userId = getState().user?.id;
  if (!userId || inflight.has(chat.id)) return;
  if (Date.now() - (warmedAt.get(chat.id) ?? 0) < FRESH_MS) return;
  const p = Promise.all([api.getChat(chat.id), api.listMessages(chat.id, { limit: CHAT_PAGE_SIZE })]).then(([chatRes, first]) => {
    warmedAt.set(chat.id, Date.now());
    const prev = readCache(`chat.${chat.id}`, userId);
    writeCache(`chat.${chat.id}`, userId, { ...prev, chat: chatRes.chat, members: chatRes.members, messages: first.messages.slice(-CHAT_PAGE_SIZE) });
    return [chatRes, first];
  });
  inflight.set(chat.id, p);
  p.catch(() => {}).finally(() => setTimeout(() => inflight.delete(chat.id), 3000));
}

export function takePrefetched(chatId) {
  const p = inflight.get(chatId);
  inflight.delete(chatId);
  return p ?? null;
}
